import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  TokenExpiredError,
  type AuthSession,
  type AuthStrategy,
  type MagicLinkRequest,
  type OAuthProvider,
  type OAuthStartResult,
  type VerifiedToken,
} from '@icore/shared';

export interface SupabaseAuthStrategyOptions {
  client: SupabaseClient;
}

export class SupabaseAuthStrategy implements AuthStrategy {
  private readonly client: SupabaseClient;

  constructor(opts: SupabaseAuthStrategyOptions) {
    this.client = opts.client;
  }

  async signUp(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (!data.session) {
      throw new Error('email_confirmation_required');
    }
    return this.toSession(data.session);
  }

  async signIn(email: string, password: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw new Error(error?.message ?? 'invalid_credentials');
    }
    return this.toSession(data.session);
  }

  async refresh(refreshToken: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      throw new Error(error?.message ?? 'invalid_refresh_token');
    }
    return this.toSession(data.session);
  }

  async verifyToken(token: string): Promise<VerifiedToken> {
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) {
      const message = error?.message ?? 'invalid_token';
      // GoTrue reports expiry inside the message ("token has invalid claims: token is expired")
      if (/expired/i.test(message)) throw new TokenExpiredError(message);
      throw new Error(message);
    }
    const u = data.user as {
      app_metadata?: { role?: string };
      user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string };
    };
    const displayName = u.user_metadata?.full_name ?? u.user_metadata?.name;
    const avatarUrl = u.user_metadata?.avatar_url ?? u.user_metadata?.picture;
    return {
      uid: data.user.id,
      email: data.user.email,
      role: u.app_metadata?.role,
      displayName,
      avatarUrl,
    };
  }

  async setRole(uid: string, role: string): Promise<void> {
    const { error } = await this.client.auth.admin.updateUserById(uid, {
      app_metadata: { role },
    });
    if (error) throw new Error(error.message);
    // Sync role to profiles table (best-effort; profile row created by DB trigger on signup).
    const { error: upsertError } = await this.client
      .from('profiles')
      .upsert({ id: uid, role, updated_at: new Date().toISOString() });
    if (upsertError) throw new Error(`profiles upsert failed: ${upsertError.message}`);
  }

  async sendMagicLink(req: MagicLinkRequest): Promise<void> {
    const { error } = await this.client.auth.signInWithOtp({
      email: req.email,
      options: { emailRedirectTo: req.callbackUrl },
    });
    if (error) throw new Error(error.message);
  }

  async startOAuth(provider: OAuthProvider, callbackUrl: string): Promise<OAuthStartResult> {
    const { data, error } = await this.client.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl, skipBrowserRedirect: true },
    });
    if (error || !data?.url) throw new Error(error?.message ?? 'oauth_start_failed');
    const url = new URL(data.url);
    const state = url.searchParams.get('state') ?? randomUUID();
    return { redirectUrl: data.url, state };
  }

  async completeOAuth(
    _provider: OAuthProvider,
    code: string,
    _state: string,
  ): Promise<AuthSession> {
    const { data, error } = await this.client.auth.exchangeCodeForSession(code);
    if (error || !data?.session) throw new Error(error?.message ?? 'oauth_complete_failed');
    return this.toSession(data.session);
  }

  async verifyMagicLink(token: string): Promise<AuthSession> {
    const { data, error } = await this.client.auth.verifyOtp({
      type: 'magiclink',
      token_hash: token,
    });
    if (error || !data.session) {
      throw new Error(error?.message ?? 'invalid_magic_link');
    }
    return this.toSession(data.session);
  }

  async syncProfile(
    uid: string,
    fields: {
      role?: string;
      email?: string;
      displayName?: string;
      avatarUrl?: string;
      lastSignedIn?: string;
    },
  ): Promise<void> {
    const row: Record<string, unknown> = { id: uid, updated_at: new Date().toISOString() };
    if (fields.role !== undefined) row['role'] = fields.role;
    if (fields.email !== undefined) row['email'] = fields.email;
    if (fields.displayName !== undefined) row['display_name'] = fields.displayName;
    if (fields.avatarUrl !== undefined) row['avatar_url'] = fields.avatarUrl;
    if (fields.lastSignedIn !== undefined) row['last_signed_in'] = fields.lastSignedIn;
    const { error } = await this.client.from('profiles').upsert(row);
    if (error) throw new Error(`syncProfile failed: ${error.message}`);
  }

  async getProfile(uid: string): Promise<{
    displayName?: string;
    avatarUrl?: string;
    role?: string;
    email?: string;
    lastSignedIn?: string;
  } | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select('display_name, avatar_url, role, email, last_signed_in')
      .eq('id', uid)
      .single();
    if (error || !data) return null;
    const row = data as {
      display_name?: string;
      avatar_url?: string;
      role?: string;
      email?: string;
      last_signed_in?: string;
    };
    return {
      displayName: row.display_name ?? undefined,
      avatarUrl: row.avatar_url ?? undefined,
      role: row.role,
      email: row.email,
      lastSignedIn: row.last_signed_in ?? undefined,
    };
  }

  async updateProfile(uid: string, fields: { displayName?: string }): Promise<void> {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (fields.displayName !== undefined) row['display_name'] = fields.displayName;
    const { error } = await this.client.from('profiles').update(row).eq('id', uid);
    if (error) throw new Error(`updateProfile failed: ${error.message}`);
  }

  async getRole(uid: string): Promise<string | null> {
    const { data, error } = await this.client.auth.admin.getUserById(uid);
    if (error || !data.user) throw new Error(error?.message ?? 'user_missing');
    const meta = data.user.app_metadata as { role?: string } | undefined;
    return meta?.role ?? null;
  }

  private toSession(s: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    user: { id: string; email?: string | null } | null;
  }): AuthSession {
    return {
      accessToken: s.access_token,
      refreshToken: s.refresh_token,
      expiresIn: s.expires_in,
      user: { id: s.user?.id ?? '', email: s.user?.email ?? '' },
    };
  }
}
