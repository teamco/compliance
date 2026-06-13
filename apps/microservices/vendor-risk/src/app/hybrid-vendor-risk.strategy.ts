import type { ScanMode, VendorRiskStrategy, VendorScanResult } from '@icore/shared';

export class HybridVendorRiskStrategy implements VendorRiskStrategy {
  constructor(
    private readonly crawler: VendorRiskStrategy,
    private readonly scorecard: VendorRiskStrategy | null,
  ) {}

  async scan(domain: string, mode: ScanMode): Promise<VendorScanResult> {
    if (mode === 'baseline' || !this.scorecard) {
      return this.crawler.scan(domain, mode);
    }

    const [crawlerResult, scorecardResult] = await Promise.allSettled([
      this.crawler.scan(domain, mode),
      this.scorecard.scan(domain, mode),
    ]);

    const base = crawlerResult.status === 'fulfilled' ? crawlerResult.value : null;
    const sc = scorecardResult.status === 'fulfilled' ? scorecardResult.value : null;

    if (!base && !sc) throw new Error(`Both strategies failed for ${domain}`);
    if (!sc) return base!;
    if (!base) return sc;

    return {
      score: sc.score,
      grade: sc.grade,
      breakdown: sc.breakdown,
      findings: [...base.findings, ...sc.findings],
      scorecardData: sc.scorecardData,
    };
  }
}
