import { Module } from '@nestjs/common';
import { NotesClientModule } from '@icore/notes-client';
import { AiClientModule } from '@icore/ai-client';
import { AuthClientModule } from '@icore/auth-client';
import { NotesController } from './notes.controller';
import { ReportTemplatesController } from './report-templates.controller';
import { AbilityFactory } from '../abilities/ability.factory';
import { StandardsQueueService } from './standards-queue.service';

@Module({
  imports: [NotesClientModule.forRoot(), AiClientModule.forRoot(), AuthClientModule.forRoot()],
  controllers: [NotesController, ReportTemplatesController],
  providers: [AbilityFactory, StandardsQueueService],
})
export class NotesModule {}
