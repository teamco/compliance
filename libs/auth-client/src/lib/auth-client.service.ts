import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { signedSend } from '@icore/shared';
import type {
  AuthSession,
  OAuthProvider,
  OAuthStartResult,
  OrgMember,
  VerifiedToken,
} from '@icore/shared';
import { AUTH_CLIENT } from './auth-client.tokens';

@Injectable()
export class AuthClientService {
  constructor(@Inject(AUTH_CLIENT) private readonly client: ClientProxy) {}

  verify(token: string): Promise<VerifiedToken> {
    return signedSend<VerifiedToken>(this.client, 'auth.verify', { token });
  }

  login(email: string, password: string): Promise<AuthSession> {
    return signedSend<AuthSession>(this.client, 'auth.login', { email, password });
  }

  signup(email: string, password: string): Promise<AuthSession> {
    return signedSend<AuthSession>(this.client, 'auth.signup', { email, password });
  }

  refresh(refreshToken: string): Promise<AuthSession> {
    return signedSend<AuthSession>(this.client, 'auth.refresh', { refreshToken });
  }

  setRole(uid: string, role: string): Promise<void> {
    return signedSend<{ ok: boolean }>(this.client, 'auth.setRole', { uid, role }).then(
      () => undefined,
    );
  }

  ensureRole(
    uid: string,
    email: string,
    displayName?: string,
    avatarUrl?: string,
  ): Promise<string> {
    return signedSend<string>(this.client, 'auth.ensureRole', {
      uid,
      email,
      displayName,
      avatarUrl,
    });
  }

  getProfile(uid: string): Promise<{
    displayName?: string;
    avatarUrl?: string;
    role?: string;
    email?: string;
    lastSignedIn?: string;
  } | null> {
    return signedSend<{
      displayName?: string;
      avatarUrl?: string;
      role?: string;
      email?: string;
      lastSignedIn?: string;
    } | null>(this.client, 'auth.profile.get', { uid });
  }

  listOrgMembers(orgId: string): Promise<OrgMember[]> {
    return signedSend<OrgMember[]>(this.client, 'auth.org.members.list', { orgId });
  }

  updateProfile(uid: string, displayName: string): Promise<void> {
    return signedSend<{ ok: boolean }>(this.client, 'auth.profile.update', {
      uid,
      displayName,
    }).then(() => undefined);
  }

  sendMagicLink(email: string, callbackUrl: string): Promise<void> {
    return signedSend<{ ok: boolean }>(this.client, 'auth.magicLink.send', {
      email,
      callbackUrl,
    }).then(() => undefined);
  }

  verifyMagicLink(token: string): Promise<AuthSession> {
    return signedSend<AuthSession>(this.client, 'auth.magicLink.verify', { token });
  }

  startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult> {
    return signedSend<OAuthStartResult>(this.client, 'auth.oauth.start', { provider, callbackUrl });
  }

  completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession> {
    return signedSend<AuthSession>(this.client, 'auth.oauth.complete', { provider, code, state });
  }
}
