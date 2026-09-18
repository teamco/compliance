import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import React from 'react';
import { AcceptInvitePage } from '../accept-invite';

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useSearch: () => ({ token: 'tok-123' }),
    Link: ({
      children,
      to,
      search,
    }: {
      children: React.ReactNode;
      to: string;
      search?: Record<string, string>;
    }) => <a href={`${to}?${new URLSearchParams(search).toString()}`}>{children}</a>,
  };
});

let mockAccessToken: string | null = null;

vi.mock('@icore/template-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icore/template-shared')>();
  return {
    ...actual,
    useAuthStore: (selector: (s: { accessToken: string | null }) => unknown) =>
      selector({ accessToken: mockAccessToken }),
    useNotify: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});

vi.mock('@/lib/api', () => ({
  api: vi.fn().mockResolvedValue({
    orgName: 'Acme',
    role: 'viewer',
    email: 'a@x.com',
    expiresAt: '2026-01-01T00:00:00Z',
  }),
}));

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

function wrap(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

beforeEach(() => {
  mockAccessToken = null;
});

describe('AcceptInvitePage', () => {
  it('links back to accept-invite with the token via returnTo when not logged in', async () => {
    render(wrap(<AcceptInvitePage />));
    const link = await screen.findByRole('link', { name: /sign in/i });
    expect(link.getAttribute('href')).toBe(
      `/login?${new URLSearchParams({ returnTo: '/accept-invite?token=tok-123' }).toString()}`,
    );
  });
});
