import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES, useAuthStore } from '@icore/template-shared';
import React from 'react';
import { resolveHashSession, CallbackPage } from '../auth.callback';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

describe('resolveHashSession', () => {
  it('extracts accessToken/refreshToken/user from a Supabase implicit-grant hash', () => {
    const token = makeJwt({ sub: 'user-1', email: 'user@example.com' });
    const hash = `#access_token=${token}&refresh_token=refresh-abc&expires_in=3600&token_type=bearer&type=magiclink`;
    expect(resolveHashSession(hash)).toEqual({
      accessToken: token,
      refreshToken: 'refresh-abc',
      user: { id: 'user-1', email: 'user@example.com' },
    });
  });

  it('returns null when there is no hash', () => {
    expect(resolveHashSession('')).toBeNull();
  });

  it('returns null when access_token is missing', () => {
    expect(resolveHashSession('#refresh_token=refresh-abc')).toBeNull();
  });

  it('returns null when refresh_token is missing', () => {
    const token = makeJwt({ sub: 'user-1', email: 'user@example.com' });
    expect(resolveHashSession(`#access_token=${token}`)).toBeNull();
  });

  it('returns null for an error redirect (expired/invalid link)', () => {
    expect(
      resolveHashSession(
        '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
      ),
    ).toBeNull();
  });

  it('returns null when the access token is not a well-formed JWT', () => {
    expect(resolveHashSession('#access_token=not-a-jwt&refresh_token=refresh-abc')).toBeNull();
  });

  it('returns null when the JWT payload lacks sub or email', () => {
    const token = makeJwt({ sub: 'user-1' });
    expect(resolveHashSession(`#access_token=${token}&refresh_token=refresh-abc`)).toBeNull();
  });
});

const mockNavigate = vi.fn();
const mockApi = vi.fn();

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

const i18nForCallback = createIcoreI18n({ resources: ICORE_LOCALES });

function wrapCallback(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18nForCallback}>{ui}</I18nextProvider>;
}

describe('CallbackPage — hash-fragment session adoption', () => {
  const token = makeJwt({ sub: 'user-1', email: 'user@example.com' });
  const hash = `#access_token=${token}&refresh_token=refresh-abc&type=magiclink`;

  beforeEach(() => {
    mockNavigate.mockReset();
    mockApi.mockReset();
    useAuthStore.setState({ user: null });
    window.history.pushState(null, '', `/auth/callback${hash}`);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ role: undefined }) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adopts the hash session via /auth/session/adopt and uses its returned accessToken+user', async () => {
    mockApi.mockResolvedValueOnce({
      accessToken: 'server-verified-at',
      user: { id: 'user-1', email: 'user@example.com', role: 'admin' },
    });

    render(wrapCallback(<CallbackPage />));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' });
    });

    expect(mockApi).toHaveBeenCalledWith(
      '/auth/session/adopt',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ accessToken: token, refreshToken: 'refresh-abc' }),
      }),
    );
    expect(useAuthStore.getState().user).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      role: 'admin',
    });
  });

  it('falls back to the unverified hash session when /auth/session/adopt fails', async () => {
    mockApi.mockRejectedValueOnce(new Error('network error'));

    render(wrapCallback(<CallbackPage />));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' });
    });

    expect(useAuthStore.getState().user).toEqual({
      id: 'user-1',
      email: 'user@example.com',
    });
  });
});
