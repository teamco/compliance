import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { AuthSession, OAuthProvider, OAuthStartResult, VerifiedToken } from '@icore/shared';
import { AUTH_CLIENT } from './auth-client.tokens';

@Injectable()
export class AuthClientService {
  constructor(@Inject(AUTH_CLIENT) private readonly client: ClientProxy) {}

  verify(token: string): Promise<VerifiedToken> {
    return firstValueFrom(this.client.send<VerifiedToken>('auth.verify', { token }));
  }

  login(email: string, password: string): Promise<AuthSession> {
    return firstValueFrom(this.client.send<AuthSession>('auth.login', { email, password }));
  }

  signup(email: string, password: string): Promise<AuthSession> {
    return firstValueFrom(this.client.send<AuthSession>('auth.signup', { email, password }));
  }

  refresh(refreshToken: string): Promise<AuthSession> {
    return firstValueFrom(this.client.send<AuthSession>('auth.refresh', { refreshToken }));
  }

  setRole(uid: string, role: string): Promise<void> {
    return firstValueFrom(this.client.send<{ ok: boolean }>('auth.setRole', { uid, role })).then(
      () => undefined,
    );
  }

  ensureRole(
    uid: string,
    email: string,
    displayName?: string,
    avatarUrl?: string,
  ): Promise<string> {
    return firstValueFrom(
      this.client.send<string>('auth.ensureRole', { uid, email, displayName, avatarUrl }),
    );
  }

  getProfile(uid: string): Promise<{
    displayName?: string;
    avatarUrl?: string;
    role?: string;
    email?: string;
    lastSignedIn?: string;
  } | null> {
    return firstValueFrom(
      this.client.send<{
        displayName?: string;
        avatarUrl?: string;
        role?: string;
        email?: string;
        lastSignedIn?: string;
      } | null>('auth.profile.get', { uid }),
    );
  }

  updateProfile(uid: string, displayName: string): Promise<void> {
    return firstValueFrom(
      this.client.send<{ ok: boolean }>('auth.profile.update', { uid, displayName }),
    ).then(() => undefined);
  }

  sendMagicLink(email: string, callbackUrl: string): Promise<void> {
    return firstValueFrom(
      this.client.send<{ ok: boolean }>('auth.magicLink.send', { email, callbackUrl }),
    ).then(() => undefined);
  }

  verifyMagicLink(token: string): Promise<AuthSession> {
    return firstValueFrom(this.client.send<AuthSession>('auth.magicLink.verify', { token }));
  }

  startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult> {
    return firstValueFrom(
      this.client.send<OAuthStartResult>('auth.oauth.start', { provider, callbackUrl }),
    );
  }

  completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession> {
    return firstValueFrom(
      this.client.send<AuthSession>('auth.oauth.complete', { provider, code, state }),
    );
  }
}
