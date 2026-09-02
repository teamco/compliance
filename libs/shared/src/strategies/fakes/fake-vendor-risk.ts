import type {
  CategoryResult,
  ScanCategory,
  ScanMode,
  VendorRiskStrategy,
  VendorScanResult,
} from '../vendor-risk';

function makeCategoryResult(score: number): CategoryResult {
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  return { score, grade, findingCount: score < 80 ? 1 : 0 };
}

const CATEGORIES: ScanCategory[] = [
  'dns',
  'email',
  'tls',
  'web',
  'network',
  'breach',
  'reputation',
];

export class FakeVendorRiskStrategy implements VendorRiskStrategy {
  async scan(domain: string, _mode: ScanMode): Promise<VendorScanResult> {
    const catScore = domain.includes('bad') ? 40 : 85;
    const breakdown = Object.fromEntries(
      CATEGORIES.map((c) => [c, makeCategoryResult(catScore)]),
    ) as Record<ScanCategory, CategoryResult>;
    const score = catScore;
    const grade = makeCategoryResult(score).grade;
    return {
      score,
      grade,
      breakdown,
      findings:
        catScore < 80
          ? [
              {
                category: 'tls',
                severity: 'high',
                title: 'Weak TLS configuration',
                detail: 'TLS 1.0 still enabled.',
                remediation: 'Disable TLS 1.0 and 1.1 on all endpoints.',
              },
            ]
          : [],
    };
  }
}
