import { Module } from '@nestjs/common';
import { NotesClientModule } from '@icore/notes-client';
import { AiClientModule } from '@icore/ai-client';
import { NotesController } from './notes.controller';
import { AbilityFactory } from '../abilities/ability.factory';

@Module({
  imports: [NotesClientModule.forRoot(), AiClientModule.forRoot()],
  controllers: [NotesController],
  providers: [AbilityFactory],
})
export class NotesModule {}
