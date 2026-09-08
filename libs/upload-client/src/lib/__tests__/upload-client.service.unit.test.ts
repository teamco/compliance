import type { ClientProxy } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UploadClientService } from '../upload-client.service';

const ORIG = { ...process.env };

function makeClient(send: ClientProxy['send']): ClientProxy {
  return { send } as unknown as ClientProxy;
}

describe('UploadClientService', () => {
  beforeEach(() => {
    delete process.env['MS_HMAC_SECRET'];
    delete process.env['NODE_ENV'];
  });

  afterEach(() => {
    Object.assign(process.env, ORIG);
  });

  it('upload() base64-encodes the file buffer before sending', async () => {
    const send = vi.fn().mockReturnValue(of({ key: 'k1' }));
    const service = new UploadClientService(makeClient(send));
    const buffer = Buffer.from('hello');

    const result = await service.upload('u1', {
      buffer,
      filename: 'a.txt',
      mimeType: 'text/plain',
    });

    expect(result).toEqual({ key: 'k1' });
    expect(send).toHaveBeenCalledWith('storage.upload', {
      userId: 'u1',
      file: { buffer: buffer.toString('base64'), filename: 'a.txt', mimeType: 'text/plain' },
    });
  });

  it('remove() forwards userId and ref', async () => {
    const send = vi.fn().mockReturnValue(of(undefined));
    const service = new UploadClientService(makeClient(send));

    await service.remove('u1', { key: 'k1' } as never);

    expect(send).toHaveBeenCalledWith('storage.remove', { userId: 'u1', ref: { key: 'k1' } });
  });

  it('propagates an RPC error', async () => {
    const send = vi.fn().mockReturnValue(throwError(() => new Error('not found')));
    const service = new UploadClientService(makeClient(send));

    await expect(service.signedUrl('u1', { key: 'k1' } as never)).rejects.toThrow('not found');
  });
});
