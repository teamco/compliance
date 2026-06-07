import { Controller, Inject } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import type {
  ApiKey,
  ApiKeyWithSecret,
  AuditLogFilters,
  AuditLogPage,
  NotesStrategy,
  RetentionPrefsPayload,
  Webhook,
  WebhookInput,
} from '@icore/shared';

@Controller()
export class AdminController {
  constructor(@Inject('NotesStrategy') private readonly strategy: NotesStrategy) {}

  @MessagePattern('admin.audit.log')
  logAuditEvent(
    @Payload()
    payload: {
      userId: string;
      action: string;
      resourceType?: string;
      resourceId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<void> {
    return this.strategy.logAuditEvent(
      payload.userId,
      payload.action,
      payload.resourceType,
      payload.resourceId,
      payload.metadata,
    );
  }

  @MessagePattern('admin.audit.list')
  listAuditLogs(
    @Payload() payload: { userId: string; filters?: AuditLogFilters },
  ): Promise<AuditLogPage> {
    return this.strategy.listAuditLogs(payload.userId, payload.filters);
  }

  @MessagePattern('admin.apikeys.create')
  createApiKey(
    @Payload() payload: { userId: string; name: string; expiresAt?: string },
  ): Promise<ApiKeyWithSecret> {
    return this.strategy.createApiKey(payload.userId, payload.name, payload.expiresAt);
  }

  @MessagePattern('admin.apikeys.list')
  listApiKeys(@Payload() payload: { userId: string }): Promise<ApiKey[]> {
    return this.strategy.listApiKeys(payload.userId);
  }

  @MessagePattern('admin.apikeys.revoke')
  revokeApiKey(@Payload() payload: { id: string; userId: string }): Promise<{ ok: boolean }> {
    return this.strategy.revokeApiKey(payload.id, payload.userId);
  }

  @MessagePattern('admin.webhooks.create')
  createWebhook(@Payload() payload: { userId: string; input: WebhookInput }): Promise<Webhook> {
    return this.strategy.createWebhook(payload.userId, payload.input);
  }

  @MessagePattern('admin.webhooks.list')
  listWebhooks(@Payload() payload: { userId: string }): Promise<Webhook[]> {
    return this.strategy.listWebhooks(payload.userId);
  }

  @MessagePattern('admin.webhooks.update')
  updateWebhook(
    @Payload()
    payload: {
      id: string;
      userId: string;
      patch: Partial<WebhookInput> & { active?: boolean };
    },
  ): Promise<Webhook> {
    return this.strategy.updateWebhook(payload.id, payload.userId, payload.patch);
  }

  @MessagePattern('admin.webhooks.delete')
  deleteWebhook(@Payload() payload: { id: string; userId: string }): Promise<{ ok: boolean }> {
    return this.strategy.deleteWebhook(payload.id, payload.userId);
  }

  @MessagePattern('admin.retention.get')
  getRetentionPrefs(@Payload() payload: { userId: string }): Promise<RetentionPrefsPayload> {
    return this.strategy.getRetentionPrefs(payload.userId);
  }

  @MessagePattern('admin.retention.update')
  updateRetentionPrefs(
    @Payload() payload: { userId: string; patch: Partial<RetentionPrefsPayload> },
  ): Promise<RetentionPrefsPayload> {
    return this.strategy.updateRetentionPrefs(payload.userId, payload.patch);
  }
}
