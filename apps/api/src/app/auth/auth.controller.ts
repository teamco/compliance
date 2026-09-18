import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, seconds } from '@nestjs/throttler';
import { ApiBody, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthClientService } from '@icore/auth-client';
import { NotesClientService } from '@icore/notes-client';
import type { Organization, OAuthProvider, OrgInviteRole, VerifiedToken } from '@icore/shared';
import { Public } from './public.decorator';
import { CheckAbility } from '../abilities/check-ability.decorator';
import { AbilityFactory } from '../abilities/ability.factory';

const OAUTH_PROVIDERS: ReadonlySet<OAuthProvider> = new Set(['google', 'github']);

const ROLES: ReadonlySet<string> = new Set(['admin', 'user']);

function assertProvider(value: string): OAuthProvider {
  if (!OAUTH_PROVIDERS.has(value as OAuthProvider)) {
    throw new UnauthorizedException(`unknown_oauth_provider: ${value}`);
  }
  return value as OAuthProvider;
}

// 10 auth-burst requests / 60s across register + login + refresh.
// Server-side gate against credential-stuffing; gateway only.
@ApiTags('auth')
@Controller('auth')
@Throttle({ 'auth-burst': { limit: 10, ttl: seconds(60) } })
export class AuthController {
  constructor(
    private readonly authClient: AuthClientService,
    private readonly cfg: ConfigService,
    private readonly notes: NotesClientService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Create a new user and return an auth session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string', minLength: 8 },
      },
    },
  })
  async register(@Body() body: { email: string; password: string }) {
    try {
      return await this.authClient.signup(body.email, body.password);
    } catch (err) {
      const msg =
        (err as { message?: string; code?: string })?.message ??
        (err as { code?: string })?.code ??
        '';
      if (msg === 'email_confirmation_required') {
        throw new BadRequestException('email_confirmation_required');
      }
      throw err;
    }
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Exchange email + password for an auth session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password'],
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string' },
      },
    },
  })
  login(@Body() body: { email: string; password: string }) {
    return this.authClient.login(body.email, body.password);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Exchange a refresh token for a fresh access token' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: { refreshToken: { type: 'string' } },
    },
  })
  refresh(@Body() body: { refreshToken: string }) {
    return this.authClient.refresh(body.refreshToken);
  }

  @Public()
  @Post('magic-link')
  @ApiOperation({ summary: 'Send a passwordless sign-in link to the email' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string', format: 'email' } },
    },
  })
  requestMagicLink(@Body() body: { email: string }) {
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    const callbackUrl = `${origin}/auth/callback`;
    return this.authClient.sendMagicLink(body.email, callbackUrl);
  }

  @Public()
  @Post('magic-link/verify')
  @ApiOperation({ summary: 'Exchange a magic-link token for an auth session' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['token'],
      properties: { token: { type: 'string' } },
    },
  })
  verifyMagicLink(@Body() body: { token: string }) {
    return this.authClient.verifyMagicLink(body.token);
  }

  @Get('me')
  @ApiOperation({ summary: 'Return current user; assigns initial role on first call' })
  async me(@Req() req: Request & { user?: VerifiedToken }): Promise<VerifiedToken> {
    const user = req.user;
    if (!user?.uid) throw new UnauthorizedException('missing_user');
    const role = await this.authClient.ensureRole(
      user.uid,
      user.email ?? '',
      user.displayName,
      user.avatarUrl,
    );
    return { ...user, role };
  }

  @Get('org/members')
  @ApiOperation({ summary: 'List members of an organization' })
  async listOrgMembers(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    await this.checkOrgAccess(req, org, 'read');
    return this.authClient.listOrgMembers(orgId, org.userId, includeInactive === 'true');
  }

  @Post('org/invites')
  @ApiOperation({ summary: 'Invite a user to an org by email' })
  async createOrgInvite(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: { email: string; role: OrgInviteRole },
  ) {
    const uid = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    if (body.role !== 'admin' && body.role !== 'viewer') {
      throw new BadRequestException('invalid_role');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      throw new BadRequestException('invalid_email');
    }
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    await this.checkOrgManage(req, org);
    return this.authClient.createOrgInvite(orgId, body.email, body.role, uid);
  }

  @Get('org/invites')
  @ApiOperation({ summary: 'List pending invites for an org' })
  async listOrgInvites(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    await this.checkOrgManage(req, org);
    return this.authClient.listOrgInvites(orgId);
  }

  @Delete('org/invites/:inviteId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke a pending invite' })
  async revokeOrgInvite(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('inviteId') inviteId: string,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    await this.checkOrgManage(req, org);
    const invites = await this.authClient.listOrgInvites(orgId);
    if (!invites.some((i) => i.id === inviteId)) throw new NotFoundException();
    return this.authClient.revokeOrgInvite(inviteId);
  }

  @Post('org/invites/:inviteId/resend')
  @ApiOperation({ summary: 'Resend a pending invite with a fresh token' })
  async resendOrgInvite(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('inviteId') inviteId: string,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    await this.checkOrgManage(req, org);
    const invites = await this.authClient.listOrgInvites(orgId);
    if (!invites.some((i) => i.id === inviteId)) throw new NotFoundException();
    return this.authClient.resendOrgInvite(inviteId);
  }

  @Delete('org/members/:userId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Deactivate an org member, or leave an org by removing yourself' })
  async deactivateOrgMember(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('userId') userId: string,
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    if (userId === org.userId) throw new ForbiddenException('cannot_deactivate_owner');

    const actorUid = this.uid(req);
    if (actorUid !== userId) {
      await this.checkOrgManage(req, org);
    }

    const members = await this.authClient.listOrgMembers(orgId, org.userId);
    if (!members.some((m) => m.userId === userId)) throw new NotFoundException();

    return this.authClient.deactivateOrgMember(orgId, userId);
  }

  @Public()
  @Get('org-invites/:token')
  @ApiOperation({ summary: 'Preview an invite before authenticating' })
  async previewOrgInvite(@Param('token') token: string) {
    const invite = await this.authClient.getOrgInviteByToken(token);
    if (!invite || invite.status !== 'pending') throw new NotFoundException('invite_not_found');
    const org = await this.notes.getOrganizationById(invite.orgId);
    if (!org) throw new NotFoundException('invite_not_found');
    return {
      orgName: org.name,
      role: invite.role,
      email: invite.email,
      expiresAt: invite.expiresAt,
    };
  }

  @Post('org-invites/:token/accept')
  @ApiOperation({ summary: 'Accept a pending invite, creating org membership' })
  async acceptOrgInvite(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('token') token: string,
  ) {
    const uid = this.uid(req);
    const email = req.user?.email;
    if (!email) throw new BadRequestException('email required on session');
    const invite = await this.authClient.getOrgInviteByToken(token);
    if (!invite) throw new NotFoundException('invite_not_found');
    const org = await this.notes.getOrganizationById(invite.orgId);
    if (org && org.userId === uid) throw new BadRequestException('invite_already_member');
    return this.authClient.acceptOrgInvite(token, uid, email);
  }

  @Post('role')
  @CheckAbility('manage', 'all')
  @ApiOperation({ summary: 'Set a user role (admin only)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['uid', 'role'],
      properties: {
        uid: { type: 'string' },
        role: { type: 'string', enum: ['admin', 'user'] },
      },
    },
  })
  async setRole(@Body() body: { uid: string; role: string }) {
    if (!body.uid || !ROLES.has(body.role)) {
      throw new BadRequestException('invalid_uid_or_role');
    }
    await this.authClient.setRole(body.uid, body.role);
    return { ok: true };
  }

  @Public()
  @Get('oauth/:provider')
  @ApiOperation({ summary: 'Start an OAuth flow — redirects to the provider' })
  @ApiParam({ name: 'provider', enum: ['google', 'github'] })
  async oauthStart(@Param('provider') providerRaw: string, @Res() res: Response) {
    const provider = assertProvider(providerRaw);
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    const callbackUrl = `${origin}/auth/oauth/callback`;
    const { redirectUrl, state } = await this.authClient.startOAuth(provider, callbackUrl);
    res.cookie('oauth_state', state, {
      httpOnly: true,
      secure: this.cfg.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
    });
    return res.redirect(redirectUrl);
  }

  @Public()
  @Get('oauth/:provider/callback')
  @ApiOperation({ summary: 'Provider redirected back — exchange code for session' })
  @ApiParam({ name: 'provider', enum: ['google', 'github'] })
  async oauthCallback(
    @Param('provider') providerRaw: string,
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const provider = assertProvider(providerRaw);
    const cookieState = (req.cookies as Record<string, string> | undefined)?.['oauth_state'];
    if (!cookieState || cookieState !== state) {
      throw new UnauthorizedException('oauth_state_mismatch');
    }
    const session = await this.authClient.completeOAuth(provider, code, state);
    res.clearCookie('oauth_state');
    const origin = this.cfg.get<string>('CLIENT_ORIGIN') ?? 'http://localhost:4200';
    const fragment = new URLSearchParams({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      userId: session.user.id,
      email: session.user.email,
    });
    return res.redirect(`${origin}/auth/oauth/callback#${fragment.toString()}`);
  }

  private async checkOrgAccess(
    req: Request & { user?: VerifiedToken },
    org: Organization,
    action: 'read' | 'update' | 'delete',
  ): Promise<void> {
    if (req.user?.role === 'admin') return;

    const uid = req.user?.uid;
    if (org.userId === uid) return;

    const members = await this.authClient.listOrgMembers(org.id, org.userId);
    const membership = members.find((m) => m.userId === uid);
    if (!membership) throw new ForbiddenException();

    // Allowlist, not denylist: OrgMember.role is an unconstrained `string`, so an
    // unrecognized value must deny writes rather than fall through to granting them.
    if (action !== 'read' && membership.role !== 'owner' && membership.role !== 'admin') {
      throw new ForbiddenException();
    }
  }

  private async checkOrgOwner(
    req: Request & { user?: VerifiedToken },
    org: Organization,
  ): Promise<void> {
    if (req.user?.role === 'admin') return;
    if (org.userId !== req.user?.uid) throw new ForbiddenException();
  }

  private async checkOrgManage(
    req: Request & { user?: VerifiedToken },
    org: Organization,
  ): Promise<void> {
    if (req.user?.role === 'admin') return;
    if (org.userId === req.user?.uid) return;

    const members = await this.authClient.listOrgMembers(org.id, org.userId);
    const membership = members.find((m) => m.userId === req.user?.uid);
    if (!membership || membership.role !== 'admin') throw new ForbiddenException();
  }

  private uid(req: Request & { user?: VerifiedToken }): string {
    if (!req.user?.uid) throw new UnauthorizedException('missing_user');
    return req.user.uid;
  }
}
