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

export interface OrgMember {
  userId: string;
  displayName?: string;
  email?: string;
  role: string;
  isActive?: boolean; // absent or true = active; false = deactivated
  deactivatedAt?: string; // ISO timestamp of the most recent deactivation; cleared on reactivation
}

export type OrgInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type OrgInviteRole = 'admin' | 'viewer';

export interface OrgInvite {
  id: string;
  orgId: string;
  email: string;
  role: OrgInviteRole;
  token: string;
  invitedBy: string;
  status: OrgInviteStatus;
  expiresAt: string;
  createdAt: string;
  acceptedAt: string | null;
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
  // includeInactive is for resolving historical actor names (e.g. a past
  // validator/approver) that must still display after that member was
  // deactivated -- access-control call sites must never set it, since it
  // would defeat the active-only filter membership checks rely on.
  listOrgMembers(orgId: string, ownerId?: string, includeInactive?: boolean): Promise<OrgMember[]>;
  listOrgIdsForMember(userId: string): Promise<string[]>;
  createOrgInvite(
    orgId: string,
    email: string,
    role: OrgInviteRole,
    invitedBy: string,
  ): Promise<OrgInvite>;
  listOrgInvites(orgId: string): Promise<OrgInvite[]>;
  revokeOrgInvite(inviteId: string): Promise<void>;
  resendOrgInvite(inviteId: string): Promise<OrgInvite>;
  getOrgInviteByToken(token: string): Promise<OrgInvite | null>;
  acceptOrgInvite(token: string, userId: string, userEmail: string): Promise<OrgMember>;
  deactivateOrgMember(orgId: string, userId: string): Promise<void>;
}
