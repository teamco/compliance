import { vi } from 'vitest';
import { runVendorRiskContract } from '@icore/shared/testing';
import { OwnCrawlerStrategy } from './crawler';

vi.mock('node:dns/promises', () => ({
  resolve4: vi.fn().mockResolvedValue(['1.2.3.4']),
  resolveMx: vi.fn().mockResolvedValue([{ exchange: 'mail.example.com', priority: 10 }]),
  resolveNs: vi.fn().mockResolvedValue(['ns1.example.com', 'ns2.example.com']),
  resolveTxt: vi
    .fn()
    .mockResolvedValue([['v=spf1 include:_spf.example.com ~all'], ['v=DMARC1; p=quarantine']]),
}));

vi.mock('node:tls', () => ({
  connect: vi.fn().mockImplementation((_opts: unknown, cb: () => void) => {
    const socket = {
      getPeerCertificate: () => ({
        valid_to: new Date(Date.now() + 90 * 86400000).toISOString(),
      }),
      getProtocol: () => 'TLSv1.3',
      destroy: vi.fn(),
      on: vi.fn(),
    };
    setTimeout(cb, 0);
    return socket;
  }),
}));

const fakeFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  headers: {
    get: (h: string) =>
      [
        'strict-transport-security',
        'x-content-type-options',
        'x-frame-options',
        'content-security-policy',
      ].includes(h)
        ? 'present'
        : null,
  },
  json: async () => [],
});

runVendorRiskContract(
  'OwnCrawlerStrategy (mocked I/O)',
  () => new OwnCrawlerStrategy({ fetch: fakeFetch }),
);
