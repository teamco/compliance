import Anthropic from '@anthropic-ai/sdk';
import type {
  AiStrategy,
  ChatContext,
  ChatMessage,
  ChatResult,
  ControlFinding,
  GapAnalysisResult,
  GeneratedControl,
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

  constructor(opts: AnthropicAiStrategyOptions) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
  }

  async chat(messages: ChatMessage[], context: ChatContext): Promise<ChatResult> {
    const systemParts: string[] = [
      'You are a GRC (Governance, Risk & Compliance) expert assistant.',
    ];
    if (context.pageContext) systemParts.push(`Current page context: ${context.pageContext}`);
    if (context.frameworkId) systemParts.push(`Active framework: ${context.frameworkId}`);

    const stream = this.client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemParts.join('\n'),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    const text = await stream.finalText();
    const final = await stream.finalMessage();
    return {
      text,
      inputTokens: final.usage.input_tokens,
      outputTokens: final.usage.output_tokens,
    };
  }

  async generateStandards(
    orgProfile: OrgProfile,
    frameworkIds: string[],
  ): Promise<StandardsResult[]> {
    const system = [
      'You are a compliance standards expert. Generate security controls for the given frameworks.',
      'Return ONLY a valid JSON array matching this TypeScript type:',
      'Array<{ frameworkId: string; controls: Array<{ id: string; title: string; description: string; implementationGuidance: string }> }>',
      'No markdown, no explanation — raw JSON only.',
    ].join('\n');

    const userPrompt = [
      `Organization profile:`,
      `  Name: ${orgProfile.name}`,
      `  Industry: ${orgProfile.industry}`,
      `  Size: ${orgProfile.size}`,
      `  Regions: ${orgProfile.regions.join(', ')}`,
      ``,
      `Generate tailored security controls for these frameworks: ${frameworkIds.join(', ')}`,
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
    controls: GeneratedControl[],
    findings: ControlFinding[],
  ): Promise<GapAnalysisResult> {
    const system = [
      'You are a compliance gap analysis expert.',
      'Return ONLY a valid JSON object matching this TypeScript type:',
      '{ summary: string; criticalGaps: Array<{ controlId: string; severity: "critical"|"high"|"medium"|"low"; description: string }>; recommendations: Array<{ priority: number; action: string; effort: "low"|"medium"|"high" }>; riskScore: number }',
      'riskScore is 0–100. No markdown, no explanation — raw JSON only.',
    ].join('\n');

    const userPrompt = [
      `Controls (${controls.length} total):`,
      JSON.stringify(controls.slice(0, 50)),
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
