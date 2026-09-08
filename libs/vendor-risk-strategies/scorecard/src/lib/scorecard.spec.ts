import { vi } from 'vitest';
import { runVendorRiskContract } from '@icore/shared/testing';
import { SecurityScorecardStrategy } from './scorecard';

const fakeFetch = vi.fn().mockResolvedValue({
  ok: true,
  status: 200,
  json: async () => ({
    score: 82,
    grade: 'B',
    entries: [
      { key: 'dns_health', score: 90, findings: [] },
      { key: 'ssl', score: 85, findings: [] },
      { key: 'email_security', score: 78, findings: [{ id: 1 }] },
      { key: 'application_security', score: 80, findings: [] },
      { key: 'network_security', score: 75, findings: [] },
      { key: 'leaked_information', score: 88, findings: [] },
      { key: 'hacker_forum', score: 92, findings: [] },
    ],
  }),
});

runVendorRiskContract(
  'SecurityScorecardStrategy (mocked API)',
  () => new SecurityScorecardStrategy({ apiKey: 'test-key', fetch: fakeFetch }),
);
