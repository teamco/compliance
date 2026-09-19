import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES, useAuthStore } from '@icore/template-shared';
import React from 'react';
import { OAuthCallbackPage } from '../auth.oauth.callback';

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
}

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

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

function wrap(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

function setHash(hash: string) {
  window.history.pushState(null, '', `/auth/oauth/callback${hash}`);
}

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    mockApi.mockReset();
    useAuthStore.setState({ user: null });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ role: undefined }) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('snake_case (Supabase implicit-flow) branch: adopts the session via /auth/session/adopt', async () => {
    const token = makeJwt({ sub: 'user-1', email: 'user@example.com' });
    setHash(`#access_token=${token}&refresh_token=refresh-abc&provider=google`);
    mockApi.mockResolvedValueOnce({
      accessToken: 'server-verified-at',
      user: { id: 'user-1', email: 'user@example.com', role: 'admin' },
    });

    render(wrap(<OAuthCallbackPage />));

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

  it('snake_case branch: falls back to the unverified hash session when adoption fails', async () => {
    const token = makeJwt({ sub: 'user-1', email: 'user@example.com' });
    setHash(`#access_token=${token}&refresh_token=refresh-abc&provider=google`);
    mockApi.mockRejectedValueOnce(new Error('network error'));

    render(wrap(<OAuthCallbackPage />));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' });
    });

    expect(useAuthStore.getState().user).toEqual({
      id: 'user-1',
      email: 'user@example.com',
    });
  });

  it('camelCase (gateway-redirect, already cookie-issued) branch: does NOT call /auth/session/adopt', async () => {
    const token = makeJwt({ sub: 'user-2', email: 'gw@example.com' });
    setHash(`#accessToken=${token}&userId=user-2&email=gw@example.com`);

    render(wrap(<OAuthCallbackPage />));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/dashboard' });
    });

    expect(mockApi).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toEqual({
      id: 'user-2',
      email: 'gw@example.com',
    });
  });
});
