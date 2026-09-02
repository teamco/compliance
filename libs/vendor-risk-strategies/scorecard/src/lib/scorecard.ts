import type {
  CategoryResult,
  ScanCategory,
  ScanGrade,
  ScanMode,
  VendorRiskStrategy,
  VendorScanResult,
} from '@icore/shared';

function toGrade(score: number): ScanGrade {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

const SC_TO_CATEGORY: Record<string, ScanCategory> = {
  dns_health: 'dns',
  email_security: 'email',
  ssl: 'tls',
  application_security: 'web',
  network_security: 'network',
  leaked_information: 'breach',
  hacker_forum: 'reputation',
};

export interface SecurityScorecardOptions {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
}

export class SecurityScorecardStrategy implements VendorRiskStrategy {
  private readonly fetch: typeof globalThis.fetch;

  constructor(private readonly opts: SecurityScorecardOptions) {
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  async scan(domain: string, _mode: ScanMode): Promise<VendorScanResult> {
    const res = await this.fetch(`https://api.securityscorecard.io/companies/${domain}/factors`, {
      headers: {
        Authorization: `Token ${this.opts.apiKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) throw new Error(`SecurityScorecard API ${res.status} for ${domain}`);

    const data = (await res.json()) as {
      score?: number;
      grade?: string;
      entries?: Array<{ key: string; score: number; findings?: unknown[] }>;
    };

    const overallScore = data.score ?? 50;
    const entries = data.entries ?? [];

    const breakdown: Record<ScanCategory, CategoryResult> = {
      dns: { score: 50, grade: 'D', findingCount: 0 },
      email: { score: 50, grade: 'D', findingCount: 0 },
      tls: { score: 50, grade: 'D', findingCount: 0 },
      web: { score: 50, grade: 'D', findingCount: 0 },
      network: { score: 50, grade: 'D', findingCount: 0 },
      breach: { score: 50, grade: 'D', findingCount: 0 },
      reputation: { score: 50, grade: 'D', findingCount: 0 },
    };

    for (const entry of entries) {
      const cat = SC_TO_CATEGORY[entry.key];
      if (cat) {
        breakdown[cat] = {
          score: entry.score,
          grade: toGrade(entry.score),
          findingCount: entry.findings?.length ?? 0,
        };
      }
    }

    return {
      score: overallScore,
      grade: toGrade(overallScore),
      breakdown,
      findings: [],
      scorecardData: data,
    };
  }
}
