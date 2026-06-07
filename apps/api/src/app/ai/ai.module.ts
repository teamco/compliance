import { Module } from '@nestjs/common';
import { AiClientModule } from '@icore/ai-client';
import { NotesClientModule } from '@icore/notes-client';
import { AiHistoryController } from './ai-history.controller';
import { AiController } from './ai.controller';

@Module({
  imports: [AiClientModule.forRoot(), NotesClientModule.forRoot()],
  controllers: [AiController, AiHistoryController],
  exports: [AiClientModule],
})
export class AiModule {}
