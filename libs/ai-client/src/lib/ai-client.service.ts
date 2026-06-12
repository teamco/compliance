import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type {
  ChatContext,
  ChatMessage,
  ChatResult,
  ControlFinding,
  GapAnalysisResult,
  GeneratedStandard,
  OrgProfile,
  StandardsResult,
} from '@icore/shared';
import { AI_CLIENT } from './ai-client.tokens';

// AI calls run through Anthropic and can be slow; without a timeout a dropped
// TCP socket to the AI MS leaves the gateway awaiting a reply that never comes,
// so the SSE stream hangs silently. Timing out rejects the promise → the
// gateway's catch surfaces an error to the browser instead of stalling.
const CHAT_TIMEOUT_MS = 90_000;
const BATCH_TIMEOUT_MS = 180_000;

@Injectable()
export class AiClientService {
  constructor(@Inject(AI_CLIENT) private readonly client: ClientProxy) {}

  chat(messages: ChatMessage[], context: ChatContext): Promise<ChatResult> {
    return firstValueFrom(
      this.client
        .send<ChatResult>('ai.chat', { messages, context })
        .pipe(timeout({ each: CHAT_TIMEOUT_MS })),
    );
  }

  generateStandards(orgProfile: OrgProfile, frameworkIds: string[]): Promise<StandardsResult[]> {
    return firstValueFrom(
      this.client
        .send<StandardsResult[]>('ai.standards.generate', { orgProfile, frameworkIds })
        .pipe(timeout({ each: BATCH_TIMEOUT_MS })),
    );
  }

  analyzeGap(standards: GeneratedStandard[], findings: ControlFinding[]): Promise<GapAnalysisResult> {
    return firstValueFrom(
      this.client
        .send<GapAnalysisResult>('ai.gap.analyze', { standards, findings })
        .pipe(timeout({ each: BATCH_TIMEOUT_MS })),
    );
  }
}
