import type {
  AuthSession,
  AuthStrategy,
  MagicLinkRequest,
  OAuthProvider,
  OAuthStartResult,
  OrgInvite,
  OrgInviteRole,
  OrgMember,
  VerifiedToken,
} from '../auth';

interface PendingOAuth {
  provider: OAuthProvider;
  email: string;
}

interface StoredUser {
  id: string;
  email: string;
  password: string;
  role?: string;
  displayName?: string;
  avatarUrl?: string;
}

export class FakeAuthStrategy implements AuthStrategy {
  private readonly users = new Map<string, StoredUser>();
  private readonly tokensToUid = new Map<string, string>();
  private readonly refreshToUid = new Map<string, string>();
  private readonly magicLinkTokens = new Map<string, string>();
  private readonly magicLinkByEmail = new Map<string, string>();
  // OAuth state → pending challenge ; code → state ; cursor for the contract helper
  private readonly oauthStates = new Map<string, PendingOAuth>();
  private readonly oauthCodes = new Map<string, string>();
  private lastOAuthState: string | null = null;
  private readonly orgMembers = new Map<string, OrgMember[]>();
  private orgInvites = new Map<string, OrgInvite>();

  async signUp(email: string, password: string): Promise<AuthSession> {
    if (this.users.has(email)) throw new Error('user_exists');
    const user: StoredUser = { id: globalThis.crypto.randomUUID(), email, password };
    this.users.set(email, user);
    return this.issueSession(user);
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const user = this.users.get(email);
    if (!user || user.password !== password) throw new Error('invalid_credentials');
    return this.issueSession(user);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const uid = this.refreshToUid.get(refreshToken);
    if (!uid) throw new Error('invalid_refresh_token');
    this.refreshToUid.delete(refreshToken);
    const user = this.findById(uid);
    return this.issueSession(user);
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    const uid = this.tokensToUid.get(token);
    if (!uid) throw new Error('invalid_token');
    const user = this.findById(uid);
    return { uid: user.id, email: user.email, role: user.role };
  }

  async setRole(uid: string, role: string): Promise<void> {
    const user = this.findById(uid);
    user.role = role;
  }

  async getRole(uid: string): Promise<string | null> {
    const user = this.findById(uid);
    return user.role ?? null;
  }

  async syncProfile(
    uid: string,
    fields: { role?: string; displayName?: string; avatarUrl?: string; lastSignedIn?: string },
  ): Promise<void> {
    const user = this.findById(uid);
    if (fields.role !== undefined) user.role = fields.role;
    if (fields.displayName !== undefined) user.displayName = fields.displayName;
    if (fields.avatarUrl !== undefined) user.avatarUrl = fields.avatarUrl;
  }

  async getProfile(uid: string): Promise<{
    displayName?: string;
    avatarUrl?: string;
    role?: string;
    email?: string;
    lastSignedIn?: string;
  } | null> {
    const user = this.findById(uid);
    return {
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      email: user.email,
    };
  }

  async updateProfile(uid: string, fields: { displayName?: string }): Promise<void> {
    const user = this.findById(uid);
    if (fields.displayName !== undefined) user.displayName = fields.displayName;
  }

  async sendMagicLink(req: MagicLinkRequest): Promise<void> {
    let user = this.users.get(req.email);
    if (!user) {
      user = { id: globalThis.crypto.randomUUID(), email: req.email, password: '' };
      this.users.set(req.email, user);
    }
    const token = globalThis.crypto.randomUUID();
    this.magicLinkTokens.set(token, user.id);
    this.magicLinkByEmail.set(req.email, token);
  }

  async verifyMagicLink(token: string): Promise<AuthSession> {
    const uid = this.magicLinkTokens.get(token);
    if (!uid) throw new Error('invalid_magic_link');
    this.magicLinkTokens.delete(token);
    const user = this.findById(uid);
    return this.issueSession(user);
  }

  getLastMagicLinkToken(email: string): string {
    const token = this.magicLinkByEmail.get(email);
    if (!token) throw new Error(`no magic-link issued for ${email}`);
    return token;
  }

  async startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult> {
    const state = globalThis.crypto.randomUUID();
    this.lastOAuthState = state;
    const url = new URL(`https://fake-${provider}.example.com/authorize`);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('state', state);
    return { redirectUrl: url.toString(), state };
  }

  async completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<AuthSession> {
    const pending = this.oauthStates.get(state);
    if (!pending || pending.provider !== provider) throw new Error('invalid_oauth_state');
    if (this.oauthCodes.get(code) !== state) throw new Error('invalid_oauth_code');
    this.oauthStates.delete(state);
    this.oauthCodes.delete(code);
    let user = this.users.get(pending.email);
    if (!user) {
      user = { id: globalThis.crypto.randomUUID(), email: pending.email, password: '' };
      this.users.set(pending.email, user);
    }
    return this.issueSession(user);
  }

  // Test helper. Reserves a code + state pair for the contract harness so it
  // can drive completeOAuth without an actual provider redirect. The state
  // comes from the most recent startOAuth call.
  getLastOAuthChallenge(provider: OAuthProvider, email: string): { code: string; state: string } {
    if (!this.lastOAuthState) throw new Error('no startOAuth called yet');
    const state = this.lastOAuthState;
    const code = globalThis.crypto.randomUUID();
    this.oauthStates.set(state, { provider, email });
    this.oauthCodes.set(code, state);
    return { code, state };
  }

  seedOrgMember(orgId: string, member: OrgMember): void {
    const existing = this.orgMembers.get(orgId) ?? [];
    this.orgMembers.set(orgId, [...existing, member]);
  }

  async listOrgMembers(
    orgId: string,
    ownerId?: string,
    includeInactive?: boolean,
  ): Promise<OrgMember[]> {
    const all = this.orgMembers.get(orgId) ?? [];
    const filtered = includeInactive ? all : all.filter((m) => m.isActive !== false);
    // Stored membership rows only carry userId/role/isActive (set at invite
    // acceptance time) -- enrich with email/displayName here, same as the
    // Supabase strategy's profiles join, so the UI never falls back to a raw
    // uid for an otherwise-resolvable member.
    const members = filtered.map((m) => {
      const user = [...this.users.values()].find((u) => u.id === m.userId);
      return {
        ...m,
        email: m.email ?? user?.email,
        displayName: m.displayName ?? user?.displayName,
      };
    });
    if (!ownerId || members.some((m) => m.userId === ownerId)) return members;
    const owner = [...this.users.values()].find((u) => u.id === ownerId);
    return [{ userId: ownerId, role: 'owner', email: owner?.email }, ...members];
  }

  async listOrgIdsForMember(userId: string): Promise<string[]> {
    const result: string[] = [];
    for (const [orgId, members] of this.orgMembers.entries()) {
      if (members.some((m) => m.userId === userId && m.isActive !== false)) result.push(orgId);
    }
    return result;
  }

  async createOrgInvite(
    orgId: string,
    email: string,
    role: OrgInviteRole,
    invitedBy: string,
  ): Promise<OrgInvite> {
    const invite: OrgInvite = {
      id: `invite-${this.orgInvites.size + 1}`,
      orgId,
      email,
      role,
      token: `token-${Math.random().toString(36).slice(2)}`,
      invitedBy,
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      acceptedAt: null,
    };
    this.orgInvites.set(invite.id, invite);
    return invite;
  }

  async listOrgInvites(orgId: string): Promise<OrgInvite[]> {
    return [...this.orgInvites.values()].filter((i) => i.orgId === orgId && i.status === 'pending');
  }

  async revokeOrgInvite(inviteId: string): Promise<void> {
    const invite = this.orgInvites.get(inviteId);
    if (invite) invite.status = 'revoked';
  }

  async resendOrgInvite(inviteId: string): Promise<OrgInvite> {
    const existing = this.orgInvites.get(inviteId);
    if (!existing) throw new Error('invite_not_found');
    // Store a new object rather than mutating `existing` in place -- callers may still
    // hold a reference to the invite returned by createOrgInvite, and mutating that same
    // object would make its `.token` change out from under them too.
    const invite: OrgInvite = {
      ...existing,
      token: `token-${Math.random().toString(36).slice(2)}`,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    this.orgInvites.set(inviteId, invite);
    return invite;
  }

  async getOrgInviteByToken(token: string): Promise<OrgInvite | null> {
    return [...this.orgInvites.values()].find((i) => i.token === token) ?? null;
  }

  async acceptOrgInvite(token: string, userId: string, userEmail: string): Promise<OrgMember> {
    const invite = await this.getOrgInviteByToken(token);
    if (!invite) throw new Error('invite_not_found');
    if (invite.status !== 'pending') throw new Error('invite_not_pending');
    if (new Date(invite.expiresAt).getTime() < Date.now()) throw new Error('invite_expired');
    if (userEmail.toLowerCase() !== invite.email.toLowerCase())
      throw new Error('invite_email_mismatch');

    const existingMembers = this.orgMembers.get(invite.orgId) ?? [];
    const existing = existingMembers.find((m) => m.userId === userId);
    let member: OrgMember;
    if (existing) {
      if (existing.isActive !== false) throw new Error('invite_already_member');
      existing.isActive = true;
      existing.role = invite.role;
      existing.deactivatedAt = undefined;
      member = existing;
    } else {
      member = { userId, role: invite.role, isActive: true };
      this.orgMembers.set(invite.orgId, [...existingMembers, member]);
    }
    invite.status = 'accepted';
    invite.acceptedAt = new Date().toISOString();
    return member;
  }

  async deactivateOrgMember(orgId: string, userId: string): Promise<void> {
    const member = (this.orgMembers.get(orgId) ?? []).find((m) => m.userId === userId);
    if (!member) return;
    member.isActive = false;
    member.deactivatedAt = new Date().toISOString();

    // Revoke any pending invites for this same org + email so a reactivation
    // can't smuggle the removed member back in at a higher role with zero
    // manager action. Skip silently if the user has no email on record.
    let email: string | undefined;
    try {
      email = this.findById(userId).email;
    } catch {
      email = undefined;
    }
    if (!email) return;
    const lowerEmail = email.toLowerCase();
    for (const invite of this.orgInvites.values()) {
      if (
        invite.orgId === orgId &&
        invite.status === 'pending' &&
        invite.email.toLowerCase() === lowerEmail
      ) {
        invite.status = 'revoked';
      }
    }
  }

  private findById(uid: string): StoredUser {
    for (const user of this.users.values()) {
      if (user.id === uid) return user;
    }
    throw new Error('user_missing');
  }

  private issueSession(user: StoredUser): AuthSession {
    const accessToken = globalThis.crypto.randomUUID();
    const refreshToken = globalThis.crypto.randomUUID();
    this.tokensToUid.set(accessToken, user.id);
    this.refreshToUid.set(refreshToken, user.id);
    return {
      accessToken,
      refreshToken,
      expiresIn: 3600,
      user: { id: user.id, email: user.email },
    };
  }
}
