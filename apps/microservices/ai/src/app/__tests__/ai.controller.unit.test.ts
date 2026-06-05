import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeAiStrategy } from '@icore/shared';
import { AiController } from '../ai.controller';

describe('AiController', () => {
  let controller: AiController;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [AiController],
      providers: [{ provide: 'AiStrategy', useClass: FakeAiStrategy }],
    }).compile();

    controller = module.get(AiController);
  });

  it('chat returns a non-empty text string', async () => {
    const result = await controller.chat({
      messages: [{ role: 'user', content: 'What is ISO 27001?' }],
      context: { pageContext: 'framework-library' },
    });
    expect(typeof result.text).toBe('string');
    expect(result.text.length).toBeGreaterThan(0);
  });

  it('generateStandards returns one result per frameworkId', async () => {
    const results = await controller.generateStandards({
      orgProfile: { id: 'org-1', name: 'Acme', industry: 'tech', size: 'small', regions: ['US'] },
      frameworkIds: ['NIST-CSF'],
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.frameworkId).toBe('NIST-CSF');
  });

  it('analyzeGap returns a result with a numeric riskScore', async () => {
    const result = await controller.analyzeGap({ controls: [], findings: [] });
    expect(typeof result.riskScore).toBe('number');
    expect(Array.isArray(result.criticalGaps)).toBe(true);
  });
});
