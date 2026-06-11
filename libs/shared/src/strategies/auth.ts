/** Error code carried over RPC + HTTP when an access token is expired (vs malformed). */
export const AUTH_TOKEN_EXPIRED = 'TOKEN_EXPIRED';

/**
 * Expired access token — a normal lifecycle event, not a server fault.
 * Strategies throw this so transports can map it to a clean 401 without
 * ERROR-level stack logging.
 */
export class TokenExpiredError extends Error {
  readonly code = AUTH_TOKEN_EXPIRED;

  constructor(message = 'token_expired') {
    super(message);
    this.name = 'TokenExpiredError';
  }
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: { id: string; email: string };
}

export interface VerifiedToken {
  uid: string;
  email?: string;
  role?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface MagicLinkRequest {
  email: string;
  callbackUrl: string;
}

export type OAuthProvider = 'google' | 'github';

export interface OAuthStartResult {
  redirectUrl: string;
  state: string;
}

export interface AuthStrategy {
  verifyToken(token: string): Promise<VerifiedToken>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(email: string, password: string): Promise<AuthSession>;
  refresh(refreshToken: string): Promise<AuthSession>;
  setRole(uid: string, role: string): Promise<void>;
  getRole(uid: string): Promise<string | null>;
  syncProfile(
    uid: string,
    fields: {
      role?: string;
      email?: string;
      displayName?: string;
      avatarUrl?: string;
      lastSignedIn?: string;
    },
  ): Promise<void>;
  getProfile(uid: string): Promise<{
    displayName?: string;
    avatarUrl?: string;
    role?: string;
    email?: string;
    lastSignedIn?: string;
  } | null>;
  updateProfile(uid: string, fields: { displayName?: string }): Promise<void>;
  sendMagicLink(req: MagicLinkRequest): Promise<void>;
  verifyMagicLink(token: string): Promise<AuthSession>;
  startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult>;
  completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession>;
}
