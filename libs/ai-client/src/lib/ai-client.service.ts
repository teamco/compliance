import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type {
  ChatContext,
  ChatMessage,
  ChatResult,
  ControlFinding,
  GapAnalysisResult,
  GeneratedControl,
  OrgProfile,
  StandardsResult,
} from '@icore/shared';
import { AI_CLIENT } from './ai-client.tokens';

@Injectable()
export class AiClientService {
  constructor(@Inject(AI_CLIENT) private readonly client: ClientProxy) {}

  chat(messages: ChatMessage[], context: ChatContext): Promise<ChatResult> {
    return firstValueFrom(this.client.send<ChatResult>('ai.chat', { messages, context }));
  }

  generateStandards(orgProfile: OrgProfile, frameworkIds: string[]): Promise<StandardsResult[]> {
    return firstValueFrom(
      this.client.send<StandardsResult[]>('ai.standards.generate', { orgProfile, frameworkIds }),
    );
  }

  analyzeGap(controls: GeneratedControl[], findings: ControlFinding[]): Promise<GapAnalysisResult> {
    return firstValueFrom(
      this.client.send<GapAnalysisResult>('ai.gap.analyze', { controls, findings }),
    );
  }
}
