import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { AUTH_TOKEN_EXPIRED } from '@icore/shared';
import { AuthGuard } from '../auth.guard';

interface MockReq {
  headers: Record<string, string | undefined>;
  user?: unknown;
}

function ctx(headers: Record<string, string | undefined>): ExecutionContext {
  const req: MockReq = { headers };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const makeGuard = (overrides: { isPublic?: boolean; verify?: () => Promise<unknown> } = {}) => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(overrides.isPublic ?? false),
    } as unknown as Reflector;
    const client = {
      verify: vi
        .fn()
        .mockImplementation(overrides.verify ?? (() => Promise.resolve({ uid: 'u1' }))),
    };
    return { guard: new AuthGuard(reflector, client as never), client };
  };

  it('lets @Public routes through without checking the header', async () => {
    const { guard } = makeGuard({ isPublic: true });
    await expect(guard.canActivate(ctx({}))).resolves.toBe(true);
  });

  it('rejects when Authorization header is missing', async () => {
    const { guard } = makeGuard();
    await expect(guard.canActivate(ctx({ authorization: undefined }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects when scheme is not Bearer', async () => {
    const { guard } = makeGuard();
    await expect(guard.canActivate(ctx({ authorization: 'Basic abc' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('verifies token and attaches user on success', async () => {
    const { guard } = makeGuard({ verify: () => Promise.resolve({ uid: 'u1', role: 'user' }) });
    const c = ctx({ authorization: 'Bearer abc' });
    await expect(guard.canActivate(c)).resolves.toBe(true);
    const req = c.switchToHttp().getRequest() as MockReq;
    expect((req.user as { uid: string }).uid).toBe('u1');
  });

  it('rejects when verify throws', async () => {
    const { guard } = makeGuard({ verify: () => Promise.reject(new Error('bad')) });
    await expect(guard.canActivate(ctx({ authorization: 'Bearer abc' }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('surfaces TOKEN_EXPIRED code when the auth MS reports an expired token', async () => {
    const { guard } = makeGuard({
      verify: () => Promise.reject({ code: AUTH_TOKEN_EXPIRED, message: 'token is expired' }),
    });
    const err = await guard
      .canActivate(ctx({ authorization: 'Bearer stale' }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).getResponse()).toMatchObject({
      code: AUTH_TOKEN_EXPIRED,
      message: 'token_expired',
    });
  });

  it('maps non-expiry verify failures to generic invalid_token', async () => {
    const { guard } = makeGuard({ verify: () => Promise.reject(new Error('malformed')) });
    const err = await guard
      .canActivate(ctx({ authorization: 'Bearer junk' }))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UnauthorizedException);
    expect((err as UnauthorizedException).getResponse()).toMatchObject({
      message: 'invalid_token',
    });
  });
});
