import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type { AiChatMessage, NotesStrategy } from '@icore/shared';

@Controller()
export class ChatHistoryController {
  constructor(@Inject('NotesStrategy') private readonly strategy: NotesStrategy) {}

  @MessagePattern('chat.history.get')
  getChatHistory(@Payload() payload: { userId: string; limit?: number }): Promise<AiChatMessage[]> {
    return this.strategy.getChatHistory(payload.userId, payload.limit);
  }

  @MessagePattern('chat.history.save')
  saveChatMessage(
    @Payload() payload: { userId: string; role: 'user' | 'assistant'; content: string },
  ): Promise<AiChatMessage> {
    return this.strategy.saveChatMessage(payload.userId, payload.role, payload.content);
  }

  @MessagePattern('chat.history.clear')
  clearChatHistory(@Payload() payload: { userId: string }): Promise<{ ok: boolean }> {
    return this.strategy.clearChatHistory(payload.userId);
  }
}
