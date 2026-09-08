import { Body, Controller, Delete, Get, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { AiChatMessage, VerifiedToken } from '@icore/shared';

interface AuthedRequest extends Request {
  user?: VerifiedToken;
}

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/chat/history')
export class AiHistoryController {
  constructor(private readonly notes: NotesClientService) {}

  @Get()
  @ApiOperation({ summary: 'Load chat history (last 100 messages)' })
  getChatHistory(@Req() req: AuthedRequest): Promise<AiChatMessage[]> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.getChatHistory(uid);
  }

  @Post()
  @ApiOperation({ summary: 'Save a chat message' })
  saveChatMessage(
    @Req() req: AuthedRequest,
    @Body() body: { role: 'user' | 'assistant'; content: string },
  ): Promise<AiChatMessage> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.saveChatMessage(uid, body.role, body.content);
  }

  @Delete()
  @ApiOperation({ summary: 'Clear chat history' })
  clearChatHistory(@Req() req: AuthedRequest): Promise<{ ok: boolean }> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.clearChatHistory(uid);
  }
}
