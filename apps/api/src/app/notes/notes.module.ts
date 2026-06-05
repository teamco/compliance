import { Module } from '@nestjs/common';
import { NotesClientModule } from '@icore/notes-client';
import { AiClientModule } from '@icore/ai-client';
import { NotesController } from './notes.controller';

@Module({
  imports: [NotesClientModule.forRoot(), AiClientModule.forRoot()],
  controllers: [NotesController],
})
export class NotesModule {}
