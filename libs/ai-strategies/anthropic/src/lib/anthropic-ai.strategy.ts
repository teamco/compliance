import Anthropic from '@anthropic-ai/sdk';
import { Logger } from '@nestjs/common';
import type {
  AiStrategy,
  ChatContext,
  ChatMessage,
  ChatResult,
  ControlFinding,
  GapAnalysisResult,
  GeneratedStandard,
  OrgProfile,
  StandardsResult,
} from '@icore/shared';

export interface AnthropicAiStrategyOptions {
  apiKey: string;
}

function stripJsonFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

export class AnthropicAiStrategy implements AiStrategy {
  private readonly client: Anthropic;
  private readonly logger = new Logger(AnthropicAiStrategy.name);

  constructor(opts: AnthropicAiStrategyOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
  }

  async chat(messages: ChatMessage[], context: ChatContext): Promise<ChatResult> {
    const systemParts: string[] = [
      'You are a GRC (Governance, Risk & Compliance) expert assistant.',
    ];
    if (context.pageContext) systemParts.push(`Current page context: ${context.pageContext}`);
    if (context.frameworkId) systemParts.push(`Active framework: ${context.frameworkId}`);

    const started = Date.now();
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    this.logger.log(`chat start — ${messages.length} msg(s), ${totalChars} chars in`);

    try {
      const stream = this.client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemParts.join('\n'),
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      });

      const text = await stream.finalText();
      const final = await stream.finalMessage();
      const ms = Date.now() - started;
      this.logger.log(
        `chat done in ${ms}ms — in:${final.usage.input_tokens} out:${final.usage.output_tokens} text:${text.length} chars`,
      );
      return {
        text,
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
      };
    } catch (err) {
      const ms = Date.now() - started;
      const e = err as { name?: string; status?: number; message?: string };
      this.logger.error(
        `chat FAILED after ${ms}ms — ${e.name ?? 'Error'}${e.status ? ` (${e.status})` : ''}: ${e.message ?? String(err)}`,
      );
      throw err;
    }
  }

  async generateStandards(
    orgProfile: OrgProfile,
    frameworkIds: string[],
  ): Promise<StandardsResult[]> {
    const system = [
      'You are a compliance standards expert. Generate formal security standards for the given frameworks.',
      'Standards define WHAT must be done (the mandatory requirement), not HOW to implement it.',
      'Example of correct Standards language: "All user accounts must be protected by multi-factor authentication."',
      'Example of wrong Controls language (do not use): "Configure Okta MFA policy with TOTP as primary factor."',
      'Return ONLY a valid JSON array matching this TypeScript type:',
      'Array<{',
      '  frameworkId: string;',
      '  standards: Array<{',
      '    id: string;',
      '    title: string;',
      '    objective: string;',
      '    scope: string;',
      '    requirements: string[]',
      '  }>',
      '}>',
      'No markdown, no explanation — raw JSON only.',
    ].join('\n');

    const userPrompt = [
      `Organization profile:`,
      `  Name: ${orgProfile.name}`,
      `  Industry: ${orgProfile.industry}`,
      `  Size: ${orgProfile.size}`,
      `  Regions: ${orgProfile.regions.join(', ')}`,
      ``,
      `Generate tailored formal security standards for these frameworks: ${frameworkIds.join(', ')}`,
      `Each standard should have 3-8 specific requirements as mandatory statements.`,
    ].join('\n');

    const response = await this.client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    return JSON.parse(stripJsonFences(raw)) as StandardsResult[];
  }

  async analyzeGap(
    standards: GeneratedStandard[],
    findings: ControlFinding[],
  ): Promise<GapAnalysisResult> {
    const system = [
      'You are a compliance gap analysis expert.',
      'Return ONLY a valid JSON object matching this TypeScript type:',
      '{ summary: string; criticalGaps: Array<{ controlId: string; severity: "critical"|"high"|"medium"|"low"; description: string }>; recommendations: Array<{ priority: number; action: string; effort: "low"|"medium"|"high" }>; riskScore: number }',
      'riskScore is 0–100. No markdown, no explanation — raw JSON only.',
    ].join('\n');

    const userPrompt = [
      `Standards (${standards.length} total):`,
      JSON.stringify(standards.slice(0, 50)),
      ``,
      `Findings (${findings.length} total):`,
      JSON.stringify(findings),
    ].join('\n');

    const response = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      thinking: { type: 'adaptive' } as any,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    return JSON.parse(stripJsonFences(raw)) as GapAnalysisResult;
  }
}
