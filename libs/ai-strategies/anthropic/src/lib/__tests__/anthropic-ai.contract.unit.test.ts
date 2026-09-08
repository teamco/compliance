import { vi, beforeEach } from 'vitest';
import { runAiContract } from '@icore/shared/testing';
import type { LlmGenerateOptions, LlmResponse, LlmStrategy } from '@idevconn/llm-router';
import { AnthropicAiStrategy } from '../anthropic-ai.strategy';

// All four AiStrategy operations route through @idevconn/llm-router's
// ClaudeStrategy (wrapped in withInstrumentation). Vitest doesn't transform
// pre-built node_modules code, so mocking '@anthropic-ai/sdk' isn't visible
// to llm-router's own internal client — inject a fake LlmStrategy directly.
const mockGenerate = vi.fn<(opts: LlmGenerateOptions) => Promise<LlmResponse>>();

function makeFakeLlmStrategy(): LlmStrategy {
  return {
    providerName: 'claude',
    defaultModel: 'claude-sonnet-4-6',
    generate: mockGenerate,
    async validateKey() {
      /* not exercised by this contract */
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockGenerate.mockImplementation(async (opts: LlmGenerateOptions) => {
    if (opts.messages) {
      return {
        text: 'Mocked Anthropic response',
        model: opts.model ?? 'claude-sonnet-4-6',
        usage: { inputTokens: 10, outputTokens: 20 },
        truncated: false,
      };
    }

    // Distinguish generateStandards vs analyzeGap by system prompt keyword.
    const isGapAnalysis = (opts.systemPrompt ?? '').includes('gap analysis');
    const text = JSON.stringify(
      isGapAnalysis
        ? {
            summary: 'No gaps found.',
            criticalGaps: [],
            recommendations: [],
            riskScore: 0,
          }
        : [
            {
              frameworkId: 'NIST-CSF',
              standards: [
                {
                  id: 'NIST-CSF-STD-001',
                  title: 'Asset Management Standard',
                  objective: 'Ensure all assets are identified and managed.',
                  scope: 'All IT assets and systems.',
                  requirements: [
                    'All assets must be inventoried within 30 days of acquisition.',
                    'Asset ownership must be assigned and documented.',
                  ],
                },
              ],
            },
            {
              frameworkId: 'ISO-27001',
              standards: [
                {
                  id: 'ISO-27001-STD-001',
                  title: 'Information Security Policy Standard',
                  objective: 'Define and maintain information security policies.',
                  scope: 'All employees and contractors.',
                  requirements: [
                    'An information security policy must be approved by management.',
                    'Policies must be reviewed at least annually.',
                  ],
                },
              ],
            },
          ],
    );
    return {
      text,
      model: opts.model ?? 'claude-sonnet-4-6',
      usage: { inputTokens: 10, outputTokens: 20 },
      truncated: false,
    };
  });
});

runAiContract('AnthropicAiStrategy (mocked SDK)', () => {
  const strategy = new AnthropicAiStrategy({ apiKey: 'test-key' });
  (strategy as unknown as { llm: LlmStrategy }).llm = makeFakeLlmStrategy();
  return strategy;
});
