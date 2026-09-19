import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  setAuthCookies,
  clearAuthCookies,
  readRefreshToken,
  verifyCsrf,
  generateCsrfToken,
} from '../auth-cookies';

function makeRes(): Response {
  return { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as Response;
}

describe('setAuthCookies', () => {
  it('sets icore_rt as httpOnly scoped to /api/auth and icore_csrf as readable scoped to /', () => {
    const res = makeRes();
    setAuthCookies(res, { refreshToken: 'rt-1', csrfToken: 'csrf-1', isProd: false });

    expect(res.cookie).toHaveBeenCalledWith(
      'icore_rt',
      'rt-1',
      expect.objectContaining({ httpOnly: true, path: '/api/auth' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      'icore_csrf',
      'csrf-1',
      expect.objectContaining({ httpOnly: false, path: '/' }),
    );
  });

  it('scopes icore_csrf to path "/" (not /api/auth) so the SPA can read it via document.cookie from any route', () => {
    const res = makeRes();
    setAuthCookies(res, { refreshToken: 'rt-1', csrfToken: 'csrf-1', isProd: false });

    const csrfCall = (res.cookie as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
      (call) => call[0] === 'icore_csrf',
    );
    expect(csrfCall).toBeDefined();
    expect((csrfCall as unknown[])[2]).toMatchObject({ path: '/' });

    const refreshCall = (res.cookie as unknown as { mock: { calls: unknown[][] } }).mock.calls.find(
      (call) => call[0] === 'icore_rt',
    );
    expect(refreshCall).toBeDefined();
    expect((refreshCall as unknown[])[2]).toMatchObject({ path: '/api/auth' });
  });

  it('uses Secure + SameSite=None in production', () => {
    const res = makeRes();
    setAuthCookies(res, { refreshToken: 'rt-1', csrfToken: 'csrf-1', isProd: true });

    expect(res.cookie).toHaveBeenCalledWith(
      'icore_rt',
      expect.anything(),
      expect.objectContaining({ secure: true, sameSite: 'none' }),
    );
  });

  it('uses no Secure + SameSite=Lax outside production', () => {
    const res = makeRes();
    setAuthCookies(res, { refreshToken: 'rt-1', csrfToken: 'csrf-1', isProd: false });

    expect(res.cookie).toHaveBeenCalledWith(
      'icore_rt',
      expect.anything(),
      expect.objectContaining({ secure: false, sameSite: 'lax' }),
    );
  });
});

describe('clearAuthCookies', () => {
  it('clears each cookie at the same path it was set on: icore_rt at /api/auth, icore_csrf at /', () => {
    const res = makeRes();
    clearAuthCookies(res, { isProd: false });

    expect(res.clearCookie).toHaveBeenCalledWith(
      'icore_rt',
      expect.objectContaining({ path: '/api/auth' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      'icore_csrf',
      expect.objectContaining({ path: '/' }),
    );
  });
});

describe('readRefreshToken', () => {
  it('reads icore_rt from req.cookies', () => {
    const req = { cookies: { icore_rt: 'rt-1' } } as unknown as Request;
    expect(readRefreshToken(req)).toBe('rt-1');
  });

  it('returns undefined when no cookie is present', () => {
    const req = { cookies: {} } as unknown as Request;
    expect(readRefreshToken(req)).toBeUndefined();
  });
});

describe('verifyCsrf', () => {
  it('returns true when the header matches the cookie', () => {
    const req = {
      cookies: { icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'csrf-1' },
    } as unknown as Request;
    expect(verifyCsrf(req)).toBe(true);
  });

  it('returns false when the header does not match the cookie', () => {
    const req = {
      cookies: { icore_csrf: 'csrf-1' },
      headers: { 'x-csrf-token': 'wrong' },
    } as unknown as Request;
    expect(verifyCsrf(req)).toBe(false);
  });

  it('returns false when either is missing', () => {
    const req = { cookies: {}, headers: {} } as unknown as Request;
    expect(verifyCsrf(req)).toBe(false);
  });
});

describe('generateCsrfToken', () => {
  it('returns a non-empty random string, different each call', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
