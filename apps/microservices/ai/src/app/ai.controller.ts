import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
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

@Controller()
export class AiController {
  constructor(@Inject('AiStrategy') private readonly strategy: AiStrategy) {}

  @MessagePattern('ai.chat')
  chat(@Payload() payload: { messages: ChatMessage[]; context: ChatContext }): Promise<ChatResult> {
    return this.strategy.chat(payload.messages, payload.context);
  }

  @MessagePattern('ai.standards.generate')
  generateStandards(
    @Payload() payload: { orgProfile: OrgProfile; frameworkIds: string[] },
  ): Promise<StandardsResult[]> {
    return this.strategy.generateStandards(payload.orgProfile, payload.frameworkIds);
  }

  @MessagePattern('ai.gap.analyze')
  analyzeGap(
    @Payload() payload: { standards: GeneratedStandard[]; findings: ControlFinding[] },
  ): Promise<GapAnalysisResult> {
    return this.strategy.analyzeGap(payload.standards, payload.findings);
  }
}
