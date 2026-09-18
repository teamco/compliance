import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthClientService } from '@icore/auth-client';
import type { NotesClientService } from '@icore/notes-client';
import {
  FakeAuthStrategy,
  type Organization,
  type OrgInvite,
  type VerifiedToken,
} from '@icore/shared';
import { AuthController } from '../auth.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import { AbilityGuard } from '../../abilities/ability.guard';
import { CHECK_ABILITY_KEY } from '../../abilities/check-ability.decorator';

function makeConfig(env: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => env[key] } as unknown as ConfigService;
}

function makeAuthClient(): AuthClientService {
  return {
    signup: vi.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@x.com' },
    }),
    login: vi.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@x.com' },
    }),
    refresh: vi.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@x.com' },
    }),
    sendMagicLink: vi.fn().mockResolvedValue(undefined),
    verifyMagicLink: vi.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@x.com' },
    }),
    startOAuth: vi.fn().mockResolvedValue({
      redirectUrl: 'https://provider.example.com/auth?state=abc',
      state: 'abc',
    }),
    completeOAuth: vi.fn().mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
      expiresIn: 3600,
      user: { id: 'u1', email: 'a@x.com' },
    }),
    setRole: vi.fn().mockResolvedValue(undefined),
  } as unknown as AuthClientService;
}

function makeRes() {
  const headers: Record<string, string> = {};
  let redirectedTo: string | null = null;
  const cookies: Record<string, string> = {};
  let cookieCleared = false;
  return {
    cookie(name: string, value: string) {
      cookies[name] = value;
      return this;
    },
    clearCookie() {
      cookieCleared = true;
      return this;
    },
    redirect(url: string) {
      redirectedTo = url;
      return this;
    },
    header(name: string, value: string) {
      headers[name] = value;
      return this;
    },
    get redirectedTo() {
      return redirectedTo;
    },
    get cookies() {
      return cookies;
    },
    get cookieCleared() {
      return cookieCleared;
    },
  };
}

describe('AuthController (gateway) — magic-link', () => {
  it('requestMagicLink builds callback URL from CLIENT_ORIGIN', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({ CLIENT_ORIGIN: 'https://my.app' }));
    await controller.requestMagicLink({ email: 'a@x.com' });
    expect(client.sendMagicLink).toHaveBeenCalledWith('a@x.com', 'https://my.app/auth/callback');
  });

  it('requestMagicLink falls back to http://localhost:4200 when CLIENT_ORIGIN unset', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    await controller.requestMagicLink({ email: 'a@x.com' });
    expect(client.sendMagicLink).toHaveBeenCalledWith(
      'a@x.com',
      'http://localhost:4200/auth/callback',
    );
  });

  it('verifyMagicLink forwards the token, sets auth cookies, and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.verifyMagicLink(
      { token: 'tok' },
      res as unknown as import('express').Response,
    );
    expect(client.verifyMagicLink).toHaveBeenCalledWith('tok');
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('login sets auth cookies and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.login(
      { email: 'a@x.com', password: 'pw' },
      res as unknown as import('express').Response,
    );
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });

  it('register sets auth cookies and returns accessToken+user only', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const session = await controller.register(
      { email: 'a@x.com', password: 'password123' },
      res as unknown as import('express').Response,
    );
    expect(session).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
  });
});

describe('AuthController (gateway) — refresh', () => {
  it('rejects when the CSRF header does not match the CSRF cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1', icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'wrong' },
    } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.refresh(req, res as unknown as import('express').Response),
    ).rejects.toThrow(ForbiddenException);
    expect(client.refresh).not.toHaveBeenCalled();
  });

  it('rejects when there is no refresh cookie', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: {},
      headers: {},
    } as unknown as import('express').Request;
    const res = makeRes();
    await expect(
      controller.refresh(req, res as unknown as import('express').Response),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('on success, calls refresh with the cookie token and re-issues both cookies', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const req = {
      cookies: { icore_rt: 'rt-1', icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'csrf-1' },
    } as unknown as import('express').Request;
    const res = makeRes();
    const result = await controller.refresh(req, res as unknown as import('express').Response);
    expect(client.refresh).toHaveBeenCalledWith('rt-1');
    expect(result).toEqual({ accessToken: 'at', user: { id: 'u1', email: 'a@x.com' } });
    expect(res.cookies['icore_rt']).toBe('rt');
    expect(res.cookies['icore_csrf']).toBeTruthy();
  });
});

describe('AuthController (gateway) — OAuth', () => {
  it('oauthStart sets a state cookie and redirects to the provider URL', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({ CLIENT_ORIGIN: 'http://client' }));
    const res = makeRes();
    await controller.oauthStart('google', res as unknown as import('express').Response);
    expect(client.startOAuth).toHaveBeenCalledWith('google', 'http://client/auth/oauth/callback');
    expect(res.cookies['oauth_state']).toBe('abc');
    expect(res.redirectedTo).toBe('https://provider.example.com/auth?state=abc');
  });

  it('oauthCallback rejects when cookie state does not match query state', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    const req = { cookies: { oauth_state: 'right' } } as unknown as import('express').Request;
    await expect(
      controller.oauthCallback(
        'google',
        'code',
        'wrong',
        req,
        res as unknown as import('express').Response,
      ),
    ).rejects.toThrow();
  });

  it('oauthCallback exchanges + redirects to the client with a fragment', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({ CLIENT_ORIGIN: 'http://client' }));
    const res = makeRes();
    const req = { cookies: { oauth_state: 'abc' } } as unknown as import('express').Request;
    await controller.oauthCallback(
      'google',
      'code-xyz',
      'abc',
      req,
      res as unknown as import('express').Response,
    );
    expect(client.completeOAuth).toHaveBeenCalledWith('google', 'code-xyz', 'abc');
    expect(res.cookieCleared).toBe(true);
    expect(res.redirectedTo).toContain('http://client/auth/oauth/callback#');
    expect(res.redirectedTo).toContain('accessToken=at');
    expect(res.redirectedTo).toContain('refreshToken=rt');
  });

  it('oauthStart rejects unknown providers', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const res = makeRes();
    await expect(
      controller.oauthStart('apple', res as unknown as import('express').Response),
    ).rejects.toThrow();
  });
});

describe('AuthController (gateway) — setRole', () => {
  it('forwards uid + role to the auth client', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    const result = await controller.setRole({ uid: 'u2', role: 'admin' });
    expect(client.setRole).toHaveBeenCalledWith('u2', 'admin');
    expect(result).toEqual({ ok: true });
  });

  it('rejects an unknown role without touching the auth client', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    await expect(controller.setRole({ uid: 'u2', role: 'superadmin' })).rejects.toThrow(
      BadRequestException,
    );
    expect(client.setRole).not.toHaveBeenCalled();
  });

  it('rejects a missing uid', async () => {
    const client = makeAuthClient();
    const controller = new AuthController(client, makeConfig({}));
    await expect(controller.setRole({ uid: '', role: 'admin' })).rejects.toThrow(
      BadRequestException,
    );
    expect(client.setRole).not.toHaveBeenCalled();
  });

  // The route is admin-only via @CheckAbility('manage','all') + the global
  // AbilityGuard. Assert the metadata is wired and that a regular user is denied.
  it('is guarded as admin-only — a regular user is denied 403', () => {
    const required = new Reflector().get(CHECK_ABILITY_KEY, AuthController.prototype.setRole);
    expect(required).toEqual({ action: 'manage', subject: 'all' });

    const guard = new AbilityGuard(
      { getAllAndOverride: () => required } as unknown as Reflector,
      new AbilityFactory(),
    );
    const ctx = (role: string) =>
      ({
        getHandler: () => AuthController.prototype.setRole,
        getClass: () => AuthController,
        switchToHttp: () => ({ getRequest: () => ({ user: { uid: 'u', role } }) }),
      }) as unknown as ExecutionContext;

    expect(guard.canActivate(ctx('admin'))).toBe(true);
    expect(() => guard.canActivate(ctx('user'))).toThrow(ForbiddenException);
  });
});

const ORG: Organization = {
  id: 'org-1',
  userId: 'owner-1',
  name: 'Acme',
} as unknown as Organization;

const INVITE: OrgInvite = {
  id: 'invite-1',
  orgId: 'org-1',
  email: 'invitee@x.com',
  role: 'viewer',
  token: 'tok',
  invitedBy: 'owner-1',
  status: 'pending',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  createdAt: new Date().toISOString(),
  acceptedAt: null,
};

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    ...overrides,
  } as unknown as NotesClientService;
}

function makeInviteAuthClient(overrides: Partial<AuthClientService> = {}): AuthClientService {
  return {
    listOrgMembers: vi.fn().mockResolvedValue([]),
    createOrgInvite: vi.fn().mockResolvedValue(INVITE),
    listOrgInvites: vi.fn().mockResolvedValue([INVITE]),
    revokeOrgInvite: vi.fn().mockResolvedValue(undefined),
    resendOrgInvite: vi.fn().mockResolvedValue(INVITE),
    getOrgInviteByToken: vi.fn().mockResolvedValue(INVITE),
    acceptOrgInvite: vi.fn().mockResolvedValue({ userId: 'u1', role: 'viewer' }),
    deactivateOrgMember: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as AuthClientService;
}

function makeInviteController(notes: NotesClientService, auth: AuthClientService): AuthController {
  return new AuthController(auth, makeConfig({}), notes, new AbilityFactory());
}

function reqAs(uid: string, role?: string, email?: string): Request & { user?: VerifiedToken } {
  return { user: { uid, role, email } as VerifiedToken } as Request & { user?: VerifiedToken };
}

describe('AuthController (gateway) — org invite management routes', () => {
  describe('createOrgInvite', () => {
    it('rejects a missing orgId', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).createOrgInvite(reqAs('owner-1'), '', {
          email: 'a@x.com',
          role: 'viewer',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the org does not exist', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).createOrgInvite(reqAs('owner-1'), 'org-1', {
          email: 'a@x.com',
          role: 'viewer',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows the org owner', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await makeInviteController(notes, auth).createOrgInvite(reqAs('owner-1'), 'org-1', {
        email: 'a@x.com',
        role: 'viewer',
      });
      expect(auth.createOrgInvite).toHaveBeenCalledWith('org-1', 'a@x.com', 'viewer', 'owner-1');
    });

    it('rejects an invalid role before touching the strategy', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).createOrgInvite(reqAs('owner-1'), 'org-1', {
          email: 'a@x.com',
          role: 'owner' as never,
        }),
      ).rejects.toThrow(BadRequestException);
      expect(auth.createOrgInvite).not.toHaveBeenCalled();
    });

    it('rejects a malformed email before touching the strategy', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).createOrgInvite(reqAs('owner-1'), 'org-1', {
          email: 'not-an-email',
          role: 'viewer',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(auth.createOrgInvite).not.toHaveBeenCalled();
    });

    it('allows an org-admin member', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'admin-1', role: 'admin' }]),
      });
      await makeInviteController(notes, auth).createOrgInvite(reqAs('admin-1'), 'org-1', {
        email: 'a@x.com',
        role: 'viewer',
      });
      expect(auth.createOrgInvite).toHaveBeenCalled();
    });

    it('rejects a viewer member', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]),
      });
      await expect(
        makeInviteController(notes, auth).createOrgInvite(reqAs('viewer-1'), 'org-1', {
          email: 'a@x.com',
          role: 'viewer',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(auth.createOrgInvite).not.toHaveBeenCalled();
    });

    it('rejects a non-member', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).createOrgInvite(reqAs('outsider'), 'org-1', {
          email: 'a@x.com',
          role: 'viewer',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a platform admin regardless of membership', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await makeInviteController(notes, auth).createOrgInvite(
        reqAs('platform-admin', 'admin'),
        'org-1',
        { email: 'a@x.com', role: 'viewer' },
      );
      expect(auth.createOrgInvite).toHaveBeenCalledWith(
        'org-1',
        'a@x.com',
        'viewer',
        'platform-admin',
      );
    });
  });

  describe('listOrgInvites', () => {
    it('rejects a missing orgId', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).listOrgInvites(reqAs('owner-1'), ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the org does not exist', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).listOrgInvites(reqAs('owner-1'), 'org-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows the org owner', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).listOrgInvites(reqAs('owner-1'), 'org-1'),
      ).resolves.toEqual([INVITE]);
    });

    it('rejects a viewer member', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]),
      });
      await expect(
        makeInviteController(notes, auth).listOrgInvites(reqAs('viewer-1'), 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a non-member', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).listOrgInvites(reqAs('outsider'), 'org-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('revokeOrgInvite', () => {
    it('rejects a missing orgId', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).revokeOrgInvite(reqAs('owner-1'), '', 'invite-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the org does not exist', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).revokeOrgInvite(reqAs('owner-1'), 'org-1', 'invite-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows the org owner', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await makeInviteController(notes, auth).revokeOrgInvite(
        reqAs('owner-1'),
        'org-1',
        'invite-1',
      );
      expect(auth.revokeOrgInvite).toHaveBeenCalledWith('invite-1');
    });

    it('rejects a viewer member', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]),
      });
      await expect(
        makeInviteController(notes, auth).revokeOrgInvite(reqAs('viewer-1'), 'org-1', 'invite-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(auth.revokeOrgInvite).not.toHaveBeenCalled();
    });

    it('rejects a non-member', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).revokeOrgInvite(reqAs('outsider'), 'org-1', 'invite-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(auth.revokeOrgInvite).not.toHaveBeenCalled();
    });

    it('rejects revoking an invite that belongs to a different org (IDOR)', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgInvites: vi.fn().mockResolvedValue([INVITE]),
      });
      await expect(
        makeInviteController(notes, auth).revokeOrgInvite(
          reqAs('owner-1'),
          'org-1',
          'other-org-invite',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(auth.revokeOrgInvite).not.toHaveBeenCalled();
    });
  });

  describe('resendOrgInvite', () => {
    it('rejects a missing orgId', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).resendOrgInvite(reqAs('owner-1'), '', 'invite-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the org does not exist', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).resendOrgInvite(reqAs('owner-1'), 'org-1', 'invite-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('allows an org-admin member', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'admin-1', role: 'admin' }]),
      });
      await makeInviteController(notes, auth).resendOrgInvite(
        reqAs('admin-1'),
        'org-1',
        'invite-1',
      );
      expect(auth.resendOrgInvite).toHaveBeenCalledWith('invite-1');
    });

    it('rejects a viewer member', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]),
      });
      await expect(
        makeInviteController(notes, auth).resendOrgInvite(reqAs('viewer-1'), 'org-1', 'invite-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(auth.resendOrgInvite).not.toHaveBeenCalled();
    });

    it('rejects a non-member', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).resendOrgInvite(reqAs('outsider'), 'org-1', 'invite-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(auth.resendOrgInvite).not.toHaveBeenCalled();
    });

    it('rejects resending an invite that belongs to a different org (IDOR)', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgInvites: vi.fn().mockResolvedValue([INVITE]),
      });
      await expect(
        makeInviteController(notes, auth).resendOrgInvite(
          reqAs('owner-1'),
          'org-1',
          'other-org-invite',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(auth.resendOrgInvite).not.toHaveBeenCalled();
    });
  });

  describe('deactivateOrgMember', () => {
    it('rejects a missing orgId', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).deactivateOrgMember(reqAs('owner-1'), '', 'member-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound when the org does not exist', async () => {
      const notes = makeNotes({ getOrganizationById: vi.fn().mockResolvedValue(null) });
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).deactivateOrgMember(
          reqAs('owner-1'),
          'org-1',
          'member-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('forbids deactivating the org owner, even by the owner themselves', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'owner-1', role: 'owner' }]),
      });
      await expect(
        makeInviteController(notes, auth).deactivateOrgMember(reqAs('owner-1'), 'org-1', 'owner-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(auth.deactivateOrgMember).not.toHaveBeenCalled();
    });

    it('allows the org owner to deactivate an admin', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([
          { userId: 'owner-1', role: 'owner' },
          { userId: 'admin-1', role: 'admin' },
        ]),
      });
      await makeInviteController(notes, auth).deactivateOrgMember(
        reqAs('owner-1'),
        'org-1',
        'admin-1',
      );
      expect(auth.deactivateOrgMember).toHaveBeenCalledWith('org-1', 'admin-1');
    });

    it('allows an org-admin to deactivate another admin', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([
          { userId: 'admin-1', role: 'admin' },
          { userId: 'admin-2', role: 'admin' },
        ]),
      });
      await makeInviteController(notes, auth).deactivateOrgMember(
        reqAs('admin-1'),
        'org-1',
        'admin-2',
      );
      expect(auth.deactivateOrgMember).toHaveBeenCalledWith('org-1', 'admin-2');
    });

    it('rejects a viewer deactivating someone else', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([
          { userId: 'viewer-1', role: 'viewer' },
          { userId: 'viewer-2', role: 'viewer' },
        ]),
      });
      await expect(
        makeInviteController(notes, auth).deactivateOrgMember(
          reqAs('viewer-1'),
          'org-1',
          'viewer-2',
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(auth.deactivateOrgMember).not.toHaveBeenCalled();
    });

    it('allows a viewer to deactivate themselves (leave)', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'viewer-1', role: 'viewer' }]),
      });
      await makeInviteController(notes, auth).deactivateOrgMember(
        reqAs('viewer-1'),
        'org-1',
        'viewer-1',
      );
      expect(auth.deactivateOrgMember).toHaveBeenCalledWith('org-1', 'viewer-1');
    });

    it('404s when the target is not a member of the org', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        listOrgMembers: vi.fn().mockResolvedValue([{ userId: 'owner-1', role: 'owner' }]),
      });
      await expect(
        makeInviteController(notes, auth).deactivateOrgMember(
          reqAs('owner-1'),
          'org-1',
          'not-a-member',
        ),
      ).rejects.toThrow(NotFoundException);
      expect(auth.deactivateOrgMember).not.toHaveBeenCalled();
    });

    it('denies further access to a deactivated member end-to-end through the real strategy filter', async () => {
      const strategy = new FakeAuthStrategy();
      strategy.seedOrgMember('org-1', { userId: 'admin-1', role: 'admin' });
      const notes = makeNotes(); // ORG.userId is 'owner-1', ORG.id is 'org-1'
      const auth = {
        listOrgMembers: (orgId: string, ownerId?: string) =>
          strategy.listOrgMembers(orgId, ownerId),
        deactivateOrgMember: (orgId: string, userId: string) =>
          strategy.deactivateOrgMember(orgId, userId),
      } as unknown as AuthClientService;
      const controller = makeInviteController(notes, auth);

      // Owner deactivates admin-1
      await controller.deactivateOrgMember(reqAs('owner-1'), 'org-1', 'admin-1');

      // admin-1 immediately loses manage-tier access -- proven through the REAL
      // strategy's filter, not a mock that can't regress.
      await expect(controller.listOrgInvites(reqAs('admin-1'), 'org-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});

describe('AuthController (gateway) — org invite public/accept routes', () => {
  describe('previewOrgInvite', () => {
    it('returns minimal invite details without inviter identity', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      const result = await makeInviteController(notes, auth).previewOrgInvite('tok');
      expect(result).toEqual({
        orgName: 'Acme',
        role: 'viewer',
        email: 'invitee@x.com',
        expiresAt: INVITE.expiresAt,
      });
    });

    it('throws NotFound when the invite does not exist', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({ getOrgInviteByToken: vi.fn().mockResolvedValue(null) });
      await expect(makeInviteController(notes, auth).previewOrgInvite('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFound when the invite is not pending', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        getOrgInviteByToken: vi.fn().mockResolvedValue({ ...INVITE, status: 'revoked' }),
      });
      await expect(makeInviteController(notes, auth).previewOrgInvite('tok')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('acceptOrgInvite', () => {
    it('rejects when the session has no email', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      await expect(
        makeInviteController(notes, auth).acceptOrgInvite(reqAs('u1'), 'tok'),
      ).rejects.toThrow(BadRequestException);
      expect(auth.acceptOrgInvite).not.toHaveBeenCalled();
    });

    it('throws NotFound when the invite does not exist', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({ getOrgInviteByToken: vi.fn().mockResolvedValue(null) });
      await expect(
        makeInviteController(notes, auth).acceptOrgInvite(reqAs('u1', undefined, 'a@x.com'), 'tok'),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects accepting when the caller is the org owner', async () => {
      const notes = makeNotes({
        getOrganizationById: vi.fn().mockResolvedValue({ id: 'org-1', userId: 'owner-1' }),
      });
      const auth = makeInviteAuthClient({
        getOrgInviteByToken: vi.fn().mockResolvedValue({
          id: 'i1',
          orgId: 'org-1',
          email: 'owner@x.com',
          status: 'pending',
        }),
        acceptOrgInvite: vi.fn(),
      });
      const controller = makeInviteController(notes, auth);
      await expect(
        controller.acceptOrgInvite(reqAs('owner-1', undefined, 'owner@x.com'), 'tok'),
      ).rejects.toThrow(BadRequestException);
      expect(auth.acceptOrgInvite).not.toHaveBeenCalled();
    });

    it('accepts a pending invite for a non-owner caller', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient();
      const controller = makeInviteController(notes, auth);
      await controller.acceptOrgInvite(reqAs('newcomer', undefined, 'invitee@x.com'), 'tok');
      expect(auth.acceptOrgInvite).toHaveBeenCalledWith('tok', 'newcomer', 'invitee@x.com');
    });

    it.each([
      'invite_not_found',
      'invite_not_pending',
      'invite_expired',
      'invite_email_mismatch',
      'invite_already_member',
    ])('maps a %s strategy error to BadRequestException, not a raw 500', async (message) => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        acceptOrgInvite: vi.fn().mockRejectedValue(new Error(message)),
      });
      await expect(
        makeInviteController(notes, auth).acceptOrgInvite(
          reqAs('newcomer', undefined, 'invitee@x.com'),
          'tok',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rethrows an unrecognized strategy error unchanged', async () => {
      const notes = makeNotes();
      const auth = makeInviteAuthClient({
        acceptOrgInvite: vi.fn().mockRejectedValue(new Error('unexpected_db_error')),
      });
      await expect(
        makeInviteController(notes, auth).acceptOrgInvite(
          reqAs('newcomer', undefined, 'invitee@x.com'),
          'tok',
        ),
      ).rejects.toThrow('unexpected_db_error');
    });
  });
});
