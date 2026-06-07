import { Module } from '@nestjs/common';
import { NotesClientModule } from '@icore/notes-client';
import { AdminAiUsageController } from './admin-ai-usage.controller';
import { ApiKeysController } from './api-keys.controller';
import { AuditLogController } from './audit-log.controller';
import { ExportController } from './export.controller';
import { RetentionController } from './retention.controller';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [NotesClientModule.forRoot()],
  controllers: [
    AdminAiUsageController,
    AuditLogController,
    ApiKeysController,
    WebhooksController,
    ExportController,
    RetentionController,
  ],
})
export class AdminModule {}
