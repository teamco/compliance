import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Route } from '../_dashboard';

let mockAccessToken: string | null = null;

vi.mock('@icore/template-shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@icore/template-shared')>();
  return {
    ...actual,
    getAccessToken: () => mockAccessToken,
  };
});

beforeEach(() => {
  mockAccessToken = null;
});

describe('_dashboard beforeLoad guard', () => {
  it('redirects to /login with the current location as returnTo when unauthenticated', () => {
    let caught: unknown;
    try {
      Route.options.beforeLoad?.({
        location: { href: '/frameworks' },
      } as never);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(Response);
    expect(
      (caught as Response & { options: { to: string; search: { returnTo: string } } }).options,
    ).toMatchObject({ to: '/login', search: { returnTo: '/frameworks' } });
  });

  it('does not redirect when authenticated', () => {
    mockAccessToken = 'at';
    expect(() =>
      Route.options.beforeLoad?.({ location: { href: '/frameworks' } } as never),
    ).not.toThrow();
  });
});
