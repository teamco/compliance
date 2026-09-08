import type { ClientProxy } from '@nestjs/microservices';
import { signHmac } from '@icore/shared';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VendorRiskClientService } from '../vendor-risk-client.service';

const ORIG = { ...process.env };

function makeClient(send: ClientProxy['send']): ClientProxy {
  return { send } as unknown as ClientProxy;
}

describe('VendorRiskClientService', () => {
  beforeEach(() => {
    delete process.env['MS_HMAC_SECRET'];
    delete process.env['NODE_ENV'];
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.assign(process.env, ORIG);
  });

  it('listVendors() forwards orgId and resolves the RPC result', async () => {
    const send = vi.fn().mockReturnValue(of([{ id: 'v1' }]));
    const service = new VendorRiskClientService(makeClient(send));

    const result = await service.listVendors('org1');

    expect(result).toEqual([{ id: 'v1' }]);
    expect(send).toHaveBeenCalledWith('vendor.list', { orgId: 'org1' });
  });

  it('rejects with a timeout error on a lookup call that never responds', async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockReturnValue({ subscribe: () => ({ unsubscribe: () => undefined }) });
    const service = new VendorRiskClientService(makeClient(send));

    const promise = service.getVendor('v1');
    const assertion = expect(promise).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });

  it('propagates an RPC error', async () => {
    const send = vi.fn().mockReturnValue(throwError(() => new Error('not found')));
    const service = new VendorRiskClientService(makeClient(send));

    await expect(service.getVendor('v1')).rejects.toThrow('not found');
  });

  it('signs the payload when MS_HMAC_SECRET is configured', async () => {
    process.env['MS_HMAC_SECRET'] = 'topsecret';
    const send = vi.fn().mockReturnValue(of({ id: 'v1' }));
    const service = new VendorRiskClientService(makeClient(send));

    await service.getVendor('v1');

    const [, body] = send.mock.calls[0] as [string, { payload: unknown; signature: string }];
    expect(body.payload).toEqual({ id: 'v1' });
    expect(body.signature).toBe(signHmac({ id: 'v1' }, 'topsecret'));
  });
});
