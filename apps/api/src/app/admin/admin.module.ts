import { Module } from '@nestjs/common';
import { NotesClientModule } from '@icore/notes-client';
import { AiUsageModule } from '@idevconn/ai-usage/server';
import { SupabaseAiUsageDataSource } from './supabase-ai-usage-data-source';
import { ApiKeysController } from './api-keys.controller';
import { AuditLogController } from './audit-log.controller';
import { ExportController } from './export.controller';
import { RetentionController } from './retention.controller';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [
    NotesClientModule.forRoot(),
    AiUsageModule.forRoot({
      useClass: SupabaseAiUsageDataSource,
      imports: [NotesClientModule.forRoot()],
    }),
  ],
  controllers: [
    AuditLogController,
    ApiKeysController,
    WebhooksController,
    ExportController,
    RetentionController,
  ],
})
export class AdminModule {}
