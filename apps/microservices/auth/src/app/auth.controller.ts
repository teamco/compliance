import { Controller, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import {
  TokenExpiredError,
  type AuthSession,
  type AuthStrategy,
  type OAuthProvider,
  type OAuthStartResult,
  type VerifiedToken,
} from '@icore/shared';

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    @Inject('AuthStrategy') private readonly strategy: AuthStrategy,
    private readonly cfg: ConfigService,
  ) {}

  @MessagePattern('auth.verify')
  async verify(@Payload() payload: { token: string }): Promise<VerifiedToken> {
    try {
      return await this.strategy.verifyToken(payload.token);
    } catch (err) {
      // Expired token is normal session lifecycle (e.g. machine wake after sleep),
      // not a server fault — RpcException skips the ERROR-level stack log and
      // carries the code to the gateway.
      if (err instanceof TokenExpiredError) {
        throw new RpcException({ code: err.code, message: err.message, status: 401 });
      }
      throw err;
    }
  }

  @MessagePattern('auth.login')
  login(@Payload() payload: { email: string; password: string }): Promise<AuthSession> {
    return this.strategy.signIn(payload.email, payload.password);
  }

  @MessagePattern('auth.signup')
  async signup(@Payload() payload: { email: string; password: string }): Promise<AuthSession> {
    try {
      const session = await this.strategy.signUp(payload.email, payload.password);
      await this.assignInitialRole(session.user.id, session.user.email);
      return session;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'email_confirmation_required') {
        throw new RpcException({ code: 'email_confirmation_required', message: msg, status: 202 });
      }
      throw err;
    }
  }

  @MessagePattern('auth.refresh')
  refresh(@Payload() payload: { refreshToken: string }): Promise<AuthSession> {
    return this.strategy.refresh(payload.refreshToken);
  }

  @MessagePattern('auth.setRole')
  async setRole(@Payload() payload: { uid: string; role: string }): Promise<{ ok: boolean }> {
    await this.strategy.setRole(payload.uid, payload.role);
    return { ok: true };
  }

  @MessagePattern('auth.magicLink.send')
  async sendMagicLink(
    @Payload() payload: { email: string; callbackUrl: string },
  ): Promise<{ ok: boolean }> {
    await this.strategy.sendMagicLink(payload);
    return { ok: true };
  }

  @MessagePattern('auth.magicLink.verify')
  async verifyMagicLink(@Payload() payload: { token: string }): Promise<AuthSession> {
    const session = await this.strategy.verifyMagicLink(payload.token);
    await this.assignInitialRole(session.user.id, session.user.email);
    return session;
  }

  @MessagePattern('auth.oauth.start')
  startOAuth(
    @Payload() payload: { provider: OAuthProvider; callbackUrl: string },
  ): Promise<OAuthStartResult> {
    return this.strategy.startOAuth(payload.provider, payload.callbackUrl);
  }

  @MessagePattern('auth.ensureRole')
  async ensureRole(
    @Payload()
    payload: {
      uid: string;
      email: string;
      displayName?: string;
      avatarUrl?: string;
    },
  ): Promise<string> {
    await this.assignInitialRole(payload.uid, payload.email);
    const role = (await this.strategy.getRole(payload.uid)) ?? 'user';
    // Always sync profiles row — covers existing users who predate the trigger.
    await this.strategy.syncProfile(payload.uid, {
      role,
      email: payload.email,
      displayName: payload.displayName,
      avatarUrl: payload.avatarUrl,
      lastSignedIn: new Date().toISOString(),
    });
    return role;
  }

  @MessagePattern('auth.oauth.complete')
  async completeOAuth(
    @Payload() payload: { provider: OAuthProvider; code: string; state: string },
  ): Promise<AuthSession> {
    const session = await this.strategy.completeOAuth(
      payload.provider,
      payload.code,
      payload.state,
    );
    await this.assignInitialRole(session.user.id, session.user.email);
    return session;
  }

  @MessagePattern('auth.profile.get')
  getProfile(@Payload() payload: { uid: string }): Promise<{
    displayName?: string;
    avatarUrl?: string;
    role?: string;
    email?: string;
    lastSignedIn?: string;
  } | null> {
    return this.strategy.getProfile(payload.uid);
  }

  @MessagePattern('auth.profile.update')
  async updateProfile(
    @Payload() payload: { uid: string; displayName?: string },
  ): Promise<{ ok: boolean }> {
    await this.strategy.updateProfile(payload.uid, { displayName: payload.displayName });
    return { ok: true };
  }

  // Idempotent: skips work when a role already exists. Admin emails come
  // from ADMINS_LIST (comma-separated). Everyone else gets 'user'.
  private async assignInitialRole(uid: string, email: string): Promise<void> {
    const existing = await this.strategy.getRole(uid);
    if (existing) {
      this.logger.log(`Role already set for ${uid}: ${existing} — skipping`);
      return;
    }

    const admins = (this.cfg.get<string>('ADMINS_LIST') ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);

    const role = admins.includes(email.toLowerCase()) ? 'admin' : 'user';
    await this.strategy.setRole(uid, role);
    this.logger.log(`Assigned role '${role}' to ${uid} (${email})`);
  }
}
