import type { ClientProxy } from '@nestjs/microservices';
import { signHmac } from '@icore/shared';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthClientService } from '../auth-client.service';

const ORIG = { ...process.env };

function makeClient(send: ClientProxy['send']): ClientProxy {
  return { send } as unknown as ClientProxy;
}

describe('AuthClientService', () => {
  beforeEach(() => {
    delete process.env['MS_HMAC_SECRET'];
    delete process.env['NODE_ENV'];
  });

  afterEach(() => {
    Object.assign(process.env, ORIG);
  });

  it('verify() sends the token and resolves with the RPC result', async () => {
    const send = vi.fn().mockReturnValue(of({ uid: 'u1' }));
    const service = new AuthClientService(makeClient(send));

    const result = await service.verify('tok');

    expect(result).toEqual({ uid: 'u1' });
    expect(send).toHaveBeenCalledWith('auth.verify', { token: 'tok' });
  });

  it('login() forwards email/password', async () => {
    const send = vi.fn().mockReturnValue(of({ uid: 'u1', token: 'jwt' }));
    const service = new AuthClientService(makeClient(send));

    await service.login('a@b.com', 'pw');

    expect(send).toHaveBeenCalledWith('auth.login', { email: 'a@b.com', password: 'pw' });
  });

  it('setRole() resolves void even though the RPC returns a value', async () => {
    const send = vi.fn().mockReturnValue(of({ ok: true }));
    const service = new AuthClientService(makeClient(send));

    const result = await service.setRole('u1', 'admin');

    expect(result).toBeUndefined();
    expect(send).toHaveBeenCalledWith('auth.setRole', { uid: 'u1', role: 'admin' });
  });

  it('propagates an RPC error', async () => {
    const send = vi.fn().mockReturnValue(throwError(() => new Error('invalid credentials')));
    const service = new AuthClientService(makeClient(send));

    await expect(service.login('a@b.com', 'wrong')).rejects.toThrow('invalid credentials');
  });

  it('signs the payload when MS_HMAC_SECRET is configured', async () => {
    process.env['MS_HMAC_SECRET'] = 'topsecret';
    const send = vi.fn().mockReturnValue(of({ uid: 'u1' }));
    const service = new AuthClientService(makeClient(send));

    await service.verify('tok');

    const [pattern, body] = send.mock.calls[0] as [string, { payload: unknown; signature: string }];
    expect(pattern).toBe('auth.verify');
    expect(body.payload).toEqual({ token: 'tok' });
    expect(body.signature).toBe(signHmac({ token: 'tok' }, 'topsecret'));
  });
});
