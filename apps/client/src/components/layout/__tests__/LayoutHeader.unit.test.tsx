import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createIcoreI18n, ICORE_LOCALES } from '@icore/template-shared';
import React from 'react';
import { LayoutHeader } from '../LayoutHeader';

const { mockNavigate, mockLogout, mockSetAccessToken, mockApi, csrfHolder } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockLogout: vi.fn(),
  mockSetAccessToken: vi.fn(),
  mockApi: vi.fn().mockResolvedValue({ ok: true }),
  csrfHolder: { value: 'csrf-abc' as string | null },
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useRouterState: () => '/dashboard',
    Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
      <a href={to}>{children}</a>
    ),
  };
});

vi.mock('@icore/template-shared', async () => {
  const actual = await vi.importActual('@icore/template-shared');
  return {
    ...actual,
    useAuthStore: (selector: (s: { user: { email: string }; logout: () => void }) => unknown) =>
      selector({ user: { email: 'user@example.com' }, logout: mockLogout }),
    setAccessToken: mockSetAccessToken,
    readCsrfCookie: () => csrfHolder.value,
  };
});

vi.mock('@/queries/profile', () => ({
  useProfile: () => ({ data: undefined }),
}));

vi.mock('@/queries/notes', () => ({
  useOrganizations: () => ({ data: [] }),
}));

vi.mock('@/lib/api', () => ({
  api: (...args: unknown[]) => mockApi(...args),
}));

const i18n = createIcoreI18n({ resources: ICORE_LOCALES });

function wrap(ui: React.ReactElement) {
  return <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;
}

beforeEach(() => {
  csrfHolder.value = 'csrf-abc';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('LayoutHeader logout', () => {
  it('calls POST /auth/logout with the CSRF header, clears local state, then navigates to /login', async () => {
    render(wrap(<LayoutHeader />));

    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await vi.waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'csrf-abc' },
      });
    });

    expect(mockSetAccessToken).toHaveBeenCalledWith(null);
    expect(mockLogout).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith({ to: '/login' });
  });

  it('omits the CSRF header when no CSRF cookie is present', async () => {
    csrfHolder.value = null;

    render(wrap(<LayoutHeader />));

    fireEvent.click(screen.getByRole('button', { name: /user menu/i }));
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await vi.waitFor(() => {
      expect(mockApi).toHaveBeenCalledWith('/auth/logout', {
        method: 'POST',
        headers: {},
      });
    });
  });
});
