import { vi, beforeEach } from 'vitest';
import { runAiContract } from '@icore/shared/testing';
import { AnthropicAiStrategy } from '../anthropic-ai.strategy';

function makeFakeClient() {
  return {
    messages: {
      stream: vi.fn().mockReturnValue({
        finalText: vi.fn().mockResolvedValue('Mocked Anthropic response'),
        finalMessage: vi.fn().mockResolvedValue({
          usage: { input_tokens: 10, output_tokens: 20 },
        }),
      }),
      create: vi
        .fn()
        .mockImplementation(
          async (_params: {
            system?: string;
            messages: Array<{ role: string; content: string }>;
          }) => {
            // Distinguish generateStandards vs analyzeGap by system prompt keyword.
            const isGapAnalysis = (_params.system ?? '').includes('gap analysis');
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(
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
                  ),
                },
              ],
            };
          },
        ),
    },
  };
}

runAiContract('AnthropicAiStrategy (mocked SDK)', () => {
  const strategy = new AnthropicAiStrategy({ apiKey: 'test-key' });
  const fake = makeFakeClient();
  // Inject mock client — bypasses real HTTP
  (strategy as unknown as { client: typeof fake }).client = fake;
  return strategy;
});

// Reset mocks between each contract test so call counts stay isolated.
beforeEach(() => {
  vi.clearAllMocks();
});
