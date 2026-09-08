import type { VendorRiskStrategy } from '../vendor-risk';

export function runVendorRiskContract(name: string, factory: () => VendorRiskStrategy): void {
  describe(`VendorRiskStrategy contract: ${name}`, () => {
    let strategy: VendorRiskStrategy;

    beforeEach(() => {
      strategy = factory();
    });

    it('baseline scan returns score 0-100, valid grade, 7-category breakdown', async () => {
      const result = await strategy.scan('example.com', 'baseline');
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
      expect(Array.isArray(result.findings)).toBe(true);
      const cats = ['dns', 'email', 'tls', 'web', 'network', 'breach', 'reputation'];
      for (const cat of cats) {
        expect(result.breakdown[cat as keyof typeof result.breakdown]).toBeDefined();
      }
    });

    it('deep scan returns result with score field', async () => {
      const result = await strategy.scan('example.com', 'deep');
      expect(typeof result.score).toBe('number');
    });

    it('each finding has required fields', async () => {
      const result = await strategy.scan('bad.example.com', 'baseline');
      for (const f of result.findings) {
        expect(f.category).toBeDefined();
        expect(f.severity).toBeDefined();
        expect(f.title).toBeDefined();
        expect(f.remediation).toBeDefined();
      }
    });
  });
}
