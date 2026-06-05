import type { AiStrategy } from '../ai';

export function runAiContract(name: string, factory: () => AiStrategy): void {
  describe(`AiStrategy contract: ${name}`, () => {
    let strategy: AiStrategy;

    beforeEach(() => {
      strategy = factory();
    });

    it('chat returns a non-empty text string', async () => {
      const result = await strategy.chat([{ role: 'user', content: 'hello' }], {});
      expect(typeof result.text).toBe('string');
      expect(result.text.length).toBeGreaterThan(0);
      expect(typeof result.inputTokens).toBe('number');
      expect(typeof result.outputTokens).toBe('number');
    });

    it('generateStandards returns one result per frameworkId', async () => {
      const results = await strategy.generateStandards(
        { id: 'org-1', name: 'Acme', industry: 'tech', size: 'small', regions: ['US'] },
        ['NIST-CSF', 'ISO-27001'],
      );
      expect(results).toHaveLength(2);
      expect(results[0]?.frameworkId).toBe('NIST-CSF');
      expect(results[1]?.frameworkId).toBe('ISO-27001');
      for (const r of results) {
        expect(Array.isArray(r.controls)).toBe(true);
      }
    });

    it('analyzeGap returns a result with a numeric riskScore', async () => {
      const result = await strategy.analyzeGap([], []);
      expect(typeof result.riskScore).toBe('number');
      expect(typeof result.summary).toBe('string');
      expect(Array.isArray(result.criticalGaps)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });
}
