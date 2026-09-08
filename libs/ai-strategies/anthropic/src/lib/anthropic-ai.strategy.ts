import { Logger } from '@nestjs/common';
import { ClaudeStrategy } from '@idevconn/llm-router/claude';
import { withInstrumentation, type LlmStrategy } from '@idevconn/llm-router';
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
  VendorPostureInput,
  VendorPostureResult,
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
  private readonly llm: LlmStrategy;
  private readonly logger = new Logger(AnthropicAiStrategy.name);

  constructor(opts: AnthropicAiStrategyOptions) {
    this.llm = withInstrumentation(new ClaudeStrategy({ apiKey: opts.apiKey }), {
      onCall: (event) => {
        if (event.error) {
          this.logger.error(
            `${event.model} call FAILED after ${event.latencyMs}ms — ${event.error}`,
          );
          return;
        }
        this.logger.log(
          `${event.model} call done in ${event.latencyMs}ms — in:${event.usage.inputTokens} out:${event.usage.outputTokens}${event.truncated ? ' (truncated)' : ''}`,
        );
      },
    });
  }

  async chat(messages: ChatMessage[], context: ChatContext): Promise<ChatResult> {
    const systemParts: string[] = [
      'You are a GRC (Governance, Risk & Compliance) expert assistant.',
    ];
    if (context.pageContext) systemParts.push(`Current page context: ${context.pageContext}`);
    if (context.frameworkId) systemParts.push(`Active framework: ${context.frameworkId}`);

    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    this.logger.log(`chat start — ${messages.length} msg(s), ${totalChars} chars in`);

    const response = await this.llm.generate({
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      systemPrompt: systemParts.join('\n'),
      messages,
    });

    return {
      text: response.text,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    };
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

    const response = await this.llm.generate({
      model: 'claude-opus-4-8',
      maxTokens: 16000,
      systemPrompt: system,
      prompt: userPrompt,
    });

    return JSON.parse(stripJsonFences(response.text)) as StandardsResult[];
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

    const response = await this.llm.generate({
      model: 'claude-sonnet-4-6',
      maxTokens: 8192,
      thinking: { type: 'adaptive' },
      systemPrompt: system,
      prompt: userPrompt,
    });

    return JSON.parse(stripJsonFences(response.text)) as GapAnalysisResult;
  }

  async analyzeVendorPosture(input: VendorPostureInput): Promise<VendorPostureResult> {
    const system = [
      'You are a cybersecurity analyst specializing in vendor risk assessment.',
      'Analyze the provided domain scan results and return specific, actionable findings.',
      'No generic advice — every recommendation must reference a concrete finding.',
      'Return ONLY valid JSON matching this TypeScript type:',
      '{ summary: string; riskRating: "critical"|"high"|"medium"|"low"; recommendations: Array<{ priority: number; action: string; effort: "low"|"medium"|"high" }> }',
      'No markdown, no explanation — raw JSON only.',
    ].join('\n');

    const userPrompt = [
      `Domain: ${input.domain}`,
      `Score breakdown: ${JSON.stringify(input.breakdown)}`,
      `Findings (${input.findings.length}): ${JSON.stringify(input.findings)}`,
    ].join('\n');

    const response = await this.llm.generate({
      model: 'claude-sonnet-4-6',
      maxTokens: 4096,
      systemPrompt: system,
      prompt: userPrompt,
    });

    return JSON.parse(stripJsonFences(response.text)) as VendorPostureResult;
  }
}
