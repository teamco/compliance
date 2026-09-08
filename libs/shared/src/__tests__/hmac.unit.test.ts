import type { ExecutionContext } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import { of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HmacGuard, signedSend } from '../hmac';

const ORIG = { ...process.env };

function makeClient(send: ClientProxy['send']): ClientProxy {
  return { send } as unknown as ClientProxy;
}

function makeRpcContext(data: unknown): ExecutionContext {
  return {
    getType: () => 'rpc',
    switchToRpc: () => ({ getData: () => data }),
  } as unknown as ExecutionContext;
}

describe('signedSend', () => {
  beforeEach(() => {
    delete process.env['MS_HMAC_SECRET'];
    delete process.env['NODE_ENV'];
  });

  afterEach(() => {
    Object.assign(process.env, ORIG);
  });

  it('sends the raw payload unsigned when MS_HMAC_SECRET is not set (dev)', async () => {
    const send = vi.fn().mockReturnValue(of('ok'));
    await signedSend(makeClient(send), 'x.pattern', { a: 1 });
    expect(send).toHaveBeenCalledWith('x.pattern', { a: 1 });
  });

  it('wraps the payload in a signed envelope when MS_HMAC_SECRET is set', async () => {
    process.env['MS_HMAC_SECRET'] = 'topsecret';
    const send = vi.fn().mockReturnValue(of('ok'));
    await signedSend(makeClient(send), 'x.pattern', { a: 1 });

    const [, body] = send.mock.calls[0] as [string, { payload: unknown; signature: string }];
    expect(body.payload).toEqual({ a: 1 });
    expect(typeof body.signature).toBe('string');
    expect(body.signature.length).toBeGreaterThan(0);
  });

  it('refuses to send unsigned in production when MS_HMAC_SECRET is missing', async () => {
    process.env['NODE_ENV'] = 'production';
    const send = vi.fn().mockReturnValue(of('ok'));

    await expect(signedSend(makeClient(send), 'x.pattern', { a: 1 })).rejects.toThrow(
      /MS_HMAC_SECRET/,
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe('HmacGuard', () => {
  beforeEach(() => {
    delete process.env['MS_HMAC_SECRET'];
    delete process.env['NODE_ENV'];
  });

  afterEach(() => {
    Object.assign(process.env, ORIG);
  });

  it('passes through unsigned calls in dev when MS_HMAC_SECRET is not set', () => {
    const guard = new HmacGuard();
    const ctx = makeRpcContext({ a: 1 });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws in production when MS_HMAC_SECRET is not configured', () => {
    process.env['NODE_ENV'] = 'production';
    const guard = new HmacGuard();
    expect(() => guard.canActivate(makeRpcContext({ a: 1 }))).toThrow(/MS_HMAC_SECRET/);
  });

  it('rejects a call with no signature envelope when a secret is configured', () => {
    process.env['MS_HMAC_SECRET'] = 'topsecret';
    const guard = new HmacGuard();
    expect(() => guard.canActivate(makeRpcContext({ a: 1 }))).toThrow(/Missing HMAC signature/);
  });

  it('rejects a call with an invalid signature', () => {
    process.env['MS_HMAC_SECRET'] = 'topsecret';
    const guard = new HmacGuard();
    const data = { payload: { a: 1 }, signature: 'bogus' };
    expect(() => guard.canActivate(makeRpcContext(data))).toThrow(/Invalid HMAC signature/);
  });

  it('accepts a validly signed call and unwraps the payload in place for @Payload()', async () => {
    process.env['MS_HMAC_SECRET'] = 'topsecret';
    const { signHmac } = await import('../hmac');
    const guard = new HmacGuard();
    const payload = { a: 1, b: 'x' };
    const data: Record<string, unknown> = {
      payload,
      signature: signHmac(payload, 'topsecret'),
    };

    expect(guard.canActivate(makeRpcContext(data))).toBe(true);
    // Same object reference — @Payload() extraction (which reads this same
    // object later in the Nest pipeline) now sees the unwrapped body.
    expect(data).toEqual({ a: 1, b: 'x' });
    expect(data['signature']).toBeUndefined();
    expect(data['payload']).toBeUndefined();
  });
});
