import { Inject, Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type {
  AiChatMessage,
  AiUsageLogEntry,
  AiUsageSummaryRpc,
  AiUsageTimeseriesPoint,
  ApiKey,
  ApiKeyWithSecret,
  AuditLogFilters,
  AuditLogPage,
  ControlPatch,
  Framework,
  FrameworkControl,
  GapAnalysis,
  GapAnalysisResult,
  Organization,
  OrganizationInput,
  PushSubscriptionPayload,
  ReportTemplate,
  ReportTemplateInput,
  RetentionPrefsPayload,
  StandardControl,
  StandardsDocument,
  StandardsSnapshot,
  UserPrefsPayload,
  Webhook,
  WebhookInput,
  WorkflowTransition,
} from '@icore/shared';
import { NOTES_CLIENT } from './notes-client.tokens';

@Injectable()
export class NotesClientService {
  constructor(@Inject(NOTES_CLIENT) private readonly client: ClientProxy) {}

  listFrameworks(): Promise<Framework[]> {
    return firstValueFrom(this.client.send<Framework[]>('notes.frameworks.list', {}));
  }

  getFramework(id: string): Promise<Framework | null> {
    return firstValueFrom(this.client.send<Framework | null>('notes.frameworks.get', { id }));
  }

  listControlsByFramework(frameworkId: string): Promise<FrameworkControl[]> {
    return firstValueFrom(
      this.client.send<FrameworkControl[]>('notes.controls.list', { frameworkId }),
    );
  }

  listOrganizations(userId: string): Promise<Organization[]> {
    return firstValueFrom(this.client.send<Organization[]>('notes.org.list', { userId }));
  }

  createOrganization(userId: string, data: OrganizationInput): Promise<Organization> {
    return firstValueFrom(this.client.send<Organization>('notes.org.create', { userId, data }));
  }

  getOrganizationById(orgId: string): Promise<Organization | null> {
    return firstValueFrom(this.client.send<Organization | null>('notes.org.get-by-id', { orgId }));
  }

  updateOrganization(orgId: string, data: OrganizationInput): Promise<Organization> {
    return firstValueFrom(this.client.send<Organization>('notes.org.update', { orgId, data }));
  }

  deleteOrganization(orgId: string): Promise<void> {
    return firstValueFrom(this.client.send<void>('notes.org.delete', { orgId }));
  }

  createStandardsDocument(
    userId: string,
    orgId: string,
    frameworkIds: string[],
  ): Promise<{ id: string }> {
    return firstValueFrom(
      this.client.send<{ id: string }>('notes.standards.create', { userId, orgId, frameworkIds }),
    );
  }

  saveStandardsDocument(id: string, controls: StandardControl[]): Promise<void> {
    return firstValueFrom(
      this.client.send<{ ok: boolean }>('notes.standards.save', { id, controls }),
    ).then(() => undefined);
  }

  failStandardsDocument(id: string, reason?: string): Promise<void> {
    return firstValueFrom(
      this.client.send<{ ok: boolean }>('notes.standards.fail', { id, reason }),
    ).then(() => undefined);
  }

  deleteStandardsDocument(id: string): Promise<void> {
    return firstValueFrom(this.client.send<{ ok: boolean }>('notes.standards.delete', { id })).then(
      () => undefined,
    );
  }

  resetStandardsDocument(id: string): Promise<void> {
    return firstValueFrom(this.client.send<{ ok: boolean }>('notes.standards.reset', { id })).then(
      () => undefined,
    );
  }

  getStandardsDocument(id: string): Promise<StandardsDocument | null> {
    return firstValueFrom(
      this.client.send<StandardsDocument | null>('notes.standards.get', { id }),
    );
  }

  listStandardsDocuments(orgId: string): Promise<StandardsDocument[]> {
    return firstValueFrom(this.client.send<StandardsDocument[]>('notes.standards.list', { orgId }));
  }

  transitionWorkflow(id: string, transition: WorkflowTransition): Promise<StandardsDocument> {
    return firstValueFrom(
      this.client.send<StandardsDocument>('notes.standards.workflow', { id, transition }),
    );
  }

  updateControl(docId: string, code: string, patch: ControlPatch): Promise<StandardControl> {
    return firstValueFrom(
      this.client.send<StandardControl>('notes.standards.update-control', { docId, code, patch }),
    );
  }

  listSnapshots(documentId: string): Promise<StandardsSnapshot[]> {
    return firstValueFrom(
      this.client.send<StandardsSnapshot[]>('notes.standards.snapshots.list', { documentId }),
    );
  }

  getSnapshot(snapshotId: string): Promise<StandardsSnapshot | null> {
    return firstValueFrom(
      this.client.send<StandardsSnapshot | null>('notes.standards.snapshots.get', { snapshotId }),
    );
  }

  getUserPrefs(userId: string): Promise<UserPrefsPayload> {
    return firstValueFrom(this.client.send<UserPrefsPayload>('settings.prefs.get', { userId }));
  }

  updateUserPrefs(userId: string, patch: Partial<UserPrefsPayload>): Promise<UserPrefsPayload> {
    return firstValueFrom(
      this.client.send<UserPrefsPayload>('settings.prefs.update', { userId, patch }),
    );
  }

  savePushSubscription(userId: string, sub: PushSubscriptionPayload): Promise<{ ok: boolean }> {
    return firstValueFrom(this.client.send<{ ok: boolean }>('settings.push.save', { userId, sub }));
  }

  removePushSubscription(userId: string, endpoint: string): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.client.send<{ ok: boolean }>('settings.push.remove', { userId, endpoint }),
    );
  }

  getChatHistory(userId: string, limit?: number): Promise<AiChatMessage[]> {
    return firstValueFrom(this.client.send<AiChatMessage[]>('chat.history.get', { userId, limit }));
  }

  saveChatMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<AiChatMessage> {
    return firstValueFrom(
      this.client.send<AiChatMessage>('chat.history.save', { userId, role, content }),
    );
  }

  clearChatHistory(userId: string): Promise<{ ok: boolean }> {
    return firstValueFrom(this.client.send<{ ok: boolean }>('chat.history.clear', { userId }));
  }

  // ─── Admin ─────────────────────────────────────────────────────────────────

  logAuditEvent(
    userId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return firstValueFrom(
      this.client.send<void>('admin.audit.log', {
        userId,
        action,
        resourceType,
        resourceId,
        metadata,
      }),
    );
  }

  listAuditLogs(userId: string, filters?: AuditLogFilters): Promise<AuditLogPage> {
    return firstValueFrom(this.client.send<AuditLogPage>('admin.audit.list', { userId, filters }));
  }

  createApiKey(userId: string, name: string, expiresAt?: string): Promise<ApiKeyWithSecret> {
    return firstValueFrom(
      this.client.send<ApiKeyWithSecret>('admin.apikeys.create', { userId, name, expiresAt }),
    );
  }

  listApiKeys(userId: string): Promise<ApiKey[]> {
    return firstValueFrom(this.client.send<ApiKey[]>('admin.apikeys.list', { userId }));
  }

  revokeApiKey(id: string, userId: string): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.client.send<{ ok: boolean }>('admin.apikeys.revoke', { id, userId }),
    );
  }

  createWebhook(userId: string, input: WebhookInput): Promise<Webhook> {
    return firstValueFrom(this.client.send<Webhook>('admin.webhooks.create', { userId, input }));
  }

  listWebhooks(userId: string): Promise<Webhook[]> {
    return firstValueFrom(this.client.send<Webhook[]>('admin.webhooks.list', { userId }));
  }

  updateWebhook(
    id: string,
    userId: string,
    patch: Partial<WebhookInput> & { active?: boolean },
  ): Promise<Webhook> {
    return firstValueFrom(
      this.client.send<Webhook>('admin.webhooks.update', { id, userId, patch }),
    );
  }

  deleteWebhook(id: string, userId: string): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.client.send<{ ok: boolean }>('admin.webhooks.delete', { id, userId }),
    );
  }

  getRetentionPrefs(userId: string): Promise<RetentionPrefsPayload> {
    return firstValueFrom(
      this.client.send<RetentionPrefsPayload>('admin.retention.get', { userId }),
    );
  }

  updateRetentionPrefs(
    userId: string,
    patch: Partial<RetentionPrefsPayload>,
  ): Promise<RetentionPrefsPayload> {
    return firstValueFrom(
      this.client.send<RetentionPrefsPayload>('admin.retention.update', { userId, patch }),
    );
  }

  // ─── Report templates ────────────────────────────────────────────────────

  listReportTemplates(): Promise<ReportTemplate[]> {
    return firstValueFrom(this.client.send<ReportTemplate[]>('notes.templates.list', {}));
  }

  createReportTemplate(userId: string, input: ReportTemplateInput): Promise<ReportTemplate> {
    return firstValueFrom(
      this.client.send<ReportTemplate>('notes.templates.create', { userId, input }),
    );
  }

  updateReportTemplate(id: string, patch: Partial<ReportTemplateInput>): Promise<ReportTemplate> {
    return firstValueFrom(
      this.client.send<ReportTemplate>('notes.templates.update', { id, patch }),
    );
  }

  deleteReportTemplate(id: string): Promise<{ ok: boolean }> {
    return firstValueFrom(this.client.send<{ ok: boolean }>('notes.templates.delete', { id }));
  }

  addTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate> {
    return firstValueFrom(
      this.client.send<ReportTemplate>('notes.templates.favorite.add', { id, orgId }),
    );
  }

  removeTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate> {
    return firstValueFrom(
      this.client.send<ReportTemplate>('notes.templates.favorite.remove', { id, orgId }),
    );
  }

  saveGapAnalysis(
    orgId: string,
    userId: string,
    docId: string | null,
    result: GapAnalysisResult,
  ): Promise<GapAnalysis> {
    return firstValueFrom(
      this.client.send<GapAnalysis>('notes.gap.save', { orgId, userId, docId, result }),
    );
  }

  listGapAnalyses(orgId: string): Promise<GapAnalysis[]> {
    return firstValueFrom(this.client.send<GapAnalysis[]>('notes.gap.list', { orgId }));
  }

  getGapAnalysis(id: string): Promise<GapAnalysis | null> {
    return firstValueFrom(this.client.send<GapAnalysis | null>('notes.gap.get', { id }));
  }

  // ─── AI usage ─────────────────────────────────────────────────────────────

  logAiUsage(entry: AiUsageLogEntry): void {
    void this.client.send('admin.ai-usage.log', entry).toPromise();
  }

  getAiUsageSummary(since: string, userId?: string): Promise<AiUsageSummaryRpc> {
    return firstValueFrom(
      this.client.send<AiUsageSummaryRpc>('admin.ai-usage.summary', { since, userId }),
    );
  }

  getAiUsageTimeseries(since: string, userId?: string): Promise<AiUsageTimeseriesPoint[]> {
    return firstValueFrom(
      this.client.send<AiUsageTimeseriesPoint[]>('admin.ai-usage.timeseries', { since, userId }),
    );
  }
}
