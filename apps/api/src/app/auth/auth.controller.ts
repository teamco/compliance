import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
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
import { subject } from '@casl/ability';
import { AuthClientService } from '@icore/auth-client';
import { NotesClientService } from '@icore/notes-client';
import type { Organization, OAuthProvider, VerifiedToken } from '@icore/shared';
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
  ) {
    if (!orgId) throw new BadRequestException('orgId required');
    const org = await this.notes.getOrganizationById(orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.authClient.listOrgMembers(orgId);
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

  private checkOrgAccess(
    req: Request & { user?: VerifiedToken },
    org: Organization,
    action: 'read' | 'update' | 'delete',
  ): void {
    const ability = this.abilityFactory.forUser(req.user);
    if (!ability.can(action, subject('Organization', { id: org.id, userId: org.userId }))) {
      throw new ForbiddenException();
    }
  }
}
