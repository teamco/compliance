import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AiClientService } from '@icore/ai-client';
import { NotesClientService } from '@icore/notes-client';
import type {
  ChatContext,
  ChatMessage,
  ControlFinding,
  GapAnalysisResult,
  GeneratedControl,
  OrgProfile,
  StandardsResult,
  VerifiedToken,
} from '@icore/shared';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
export class AiController {
  constructor(
    private readonly aiClient: AiClientService,
    private readonly notes: NotesClientService,
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'AI copilot — streams SSE text tokens to the browser' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['messages'],
      properties: {
        messages: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['user', 'assistant'] },
              content: { type: 'string' },
            },
          },
        },
        context: {
          type: 'object',
          properties: {
            orgId: { type: 'string' },
            frameworkId: { type: 'string' },
            pageContext: { type: 'string' },
          },
        },
      },
    },
  })
  async chat(
    @Body() body: { messages: ChatMessage[]; context?: ChatContext },
    @Res() res: Response,
    @Req() req: Request & { user?: VerifiedToken },
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      const result = await this.aiClient.chat(body.messages, body.context ?? {});
      const words = result.text.split(' ');
      for (const word of words) {
        res.write(`data: ${JSON.stringify({ token: word + ' ' })}\n\n`);
        await new Promise<void>((resolve) => setTimeout(resolve, 8));
      }
      res.write(
        `data: ${JSON.stringify({ done: true, usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens } })}\n\n`,
      );
      const uid = req.user?.uid;
      if (uid) {
        this.notes.logAiUsage({
          user_id: uid,
          provider: 'anthropic',
          operation: 'chat',
          model: 'claude-sonnet-4-6',
          key_source: 'platform',
          input_tokens: result.inputTokens,
          output_tokens: result.outputTokens,
          success: true,
          latency_ms: 0,
        });
      }
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({ error: err instanceof Error ? err.message : 'unknown_error' })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  @Post('standards/generate')
  @ApiOperation({ summary: 'Generate AI-tailored compliance controls for given frameworks' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['orgProfile', 'frameworkIds'],
      properties: {
        orgProfile: { type: 'object' },
        frameworkIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  async generateStandards(
    @Body() body: { orgProfile: OrgProfile; frameworkIds: string[] },
    @Req() req: Request & { user?: VerifiedToken },
  ): Promise<StandardsResult[]> {
    const result = await this.aiClient.generateStandards(body.orgProfile, body.frameworkIds);
    const uid = req.user?.uid;
    if (uid) {
      this.notes.logAiUsage({
        user_id: uid,
        provider: 'anthropic',
        operation: 'standards.generate',
        model: 'claude-opus-4-8',
        key_source: 'platform',
        success: true,
        latency_ms: 0,
      });
    }
    return result;
  }

  @Post('gap/analyze')
  @ApiOperation({ summary: 'Analyze compliance gaps against findings and return a risk report' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['controls', 'findings'],
      properties: {
        controls: { type: 'array', items: { type: 'object' } },
        findings: { type: 'array', items: { type: 'object' } },
      },
    },
  })
  async analyzeGap(
    @Body() body: { controls: GeneratedControl[]; findings: ControlFinding[] },
    @Req() req: Request & { user?: VerifiedToken },
  ): Promise<GapAnalysisResult> {
    const result = await this.aiClient.analyzeGap(body.controls, body.findings);
    const uid = req.user?.uid;
    if (uid) {
      this.notes.logAiUsage({
        user_id: uid,
        provider: 'anthropic',
        operation: 'gap.analyze',
        model: 'claude-sonnet-4-6',
        key_source: 'platform',
        success: true,
        latency_ms: 0,
      });
    }
    return result;
  }
}
