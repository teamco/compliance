import type {
  AiChatMessage,
  AiUsageLogEntry,
  AiUsageSummaryRpc,
  AiUsageTimeseriesPoint,
  ApiKey,
  ApiKeyWithSecret,
  AuditLog,
  AuditLogFilters,
  AuditLogPage,
  ControlPatch,
  Framework,
  FrameworkControl,
  GapAnalysis,
  GapAnalysisResult,
  NotesStrategy,
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
} from '../notes';
import { DEFAULT_RETENTION_PREFS, DEFAULT_USER_PREFS, WORKFLOW_TRANSITIONS } from '../notes';

export class FakeNotesStrategy implements NotesStrategy {
  private frameworks = new Map<string, Framework>();
  private controls = new Map<string, FrameworkControl>();
  private orgs = new Map<string, Organization>(); // key = orgId
  private gapAnalyses: GapAnalysis[] = [];
  private docs = new Map<string, StandardsDocument>(); // key = id
  private snapshots: StandardsSnapshot[] = [];
  private userPrefs = new Map<string, UserPrefsPayload>();
  private pushSubscriptions = new Map<string, PushSubscriptionPayload[]>();
  private chatMessages = new Map<string, AiChatMessage[]>();
  private auditLogs = new Map<string, AuditLog[]>();
  private apiKeys = new Map<string, ApiKey[]>();
  private webhooks = new Map<string, Webhook[]>();
  private retentionPrefs = new Map<string, RetentionPrefsPayload>();
  private reportTemplates: ReportTemplate[] = [];

  seedFramework(fw: Framework): void {
    this.frameworks.set(fw.id, fw);
  }

  seedControl(c: FrameworkControl): void {
    this.controls.set(c.id, c);
  }

  async listFrameworks(): Promise<Framework[]> {
    return [...this.frameworks.values()];
  }

  async getFramework(id: string): Promise<Framework | null> {
    return this.frameworks.get(id) ?? null;
  }

  async listControlsByFramework(frameworkId: string): Promise<FrameworkControl[]> {
    return [...this.controls.values()].filter((c) => c.frameworkId === frameworkId);
  }

  async listOrganizations(userId: string): Promise<Organization[]> {
    return [...this.orgs.values()].filter((o) => o.userId === userId);
  }

  async createOrganization(userId: string, data: OrganizationInput): Promise<Organization> {
    const now = new Date().toISOString();
    const org: Organization = {
      id: globalThis.crypto.randomUUID(),
      userId,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.orgs.set(org.id, org);
    return org;
  }

  async getOrganizationById(orgId: string): Promise<Organization | null> {
    return this.orgs.get(orgId) ?? null;
  }

  async updateOrganization(orgId: string, data: OrganizationInput): Promise<Organization> {
    const existing = this.orgs.get(orgId);
    if (!existing) throw new Error(`org_not_found: ${orgId}`);
    const updated: Organization = { ...existing, ...data, updatedAt: new Date().toISOString() };
    this.orgs.set(orgId, updated);
    return updated;
  }

  async deleteOrganization(orgId: string): Promise<void> {
    if (!this.orgs.has(orgId)) throw new Error(`org_not_found: ${orgId}`);
    this.orgs.delete(orgId);
  }

  async createStandardsDocument(
    userId: string,
    orgId: string,
    frameworkIds: string[],
  ): Promise<{ id: string }> {
    const id = globalThis.crypto.randomUUID();
    this.docs.set(id, {
      id,
      userId,
      orgId,
      frameworkIds,
      controls: [],
      status: 'pending',
      workflowStatus: 'draft',
      createdAt: new Date().toISOString(),
    });
    return { id };
  }

  async saveStandardsDocument(id: string, controls: StandardControl[]): Promise<void> {
    const existing = this.docs.get(id);
    if (!existing) throw new Error(`doc_not_found: ${id}`);
    this.docs.set(id, { ...existing, controls, status: 'completed' });
  }

  async failStandardsDocument(id: string, _reason?: string): Promise<void> {
    const existing = this.docs.get(id);
    if (!existing) throw new Error(`doc_not_found: ${id}`);
    this.docs.set(id, { ...existing, status: 'failed' });
  }

  async deleteStandardsDocument(id: string): Promise<void> {
    if (!this.docs.has(id)) throw new Error(`doc_not_found: ${id}`);
    this.docs.delete(id);
  }

  async resetStandardsDocument(id: string): Promise<void> {
    const existing = this.docs.get(id);
    if (!existing) throw new Error(`doc_not_found: ${id}`);
    this.docs.set(id, { ...existing, status: 'pending', controls: [] });
  }

  async getStandardsDocument(id: string): Promise<StandardsDocument | null> {
    return this.docs.get(id) ?? null;
  }

  async listStandardsDocuments(orgId: string): Promise<StandardsDocument[]> {
    return [...this.docs.values()].filter((d) => d.orgId === orgId);
  }

  async updateControl(docId: string, code: string, patch: ControlPatch): Promise<StandardControl> {
    const doc = this.docs.get(docId);
    if (!doc) throw new Error(`doc_not_found: ${docId}`);
    const idx = doc.controls.findIndex((c) => c.code === code);
    if (idx === -1) throw new Error(`control_not_found: ${code}`);
    const updated = { ...doc.controls[idx], ...patch } as StandardControl;
    const controls = [...doc.controls];
    controls[idx] = updated;
    this.docs.set(docId, { ...doc, controls });
    return updated;
  }

  async transitionWorkflow(id: string, transition: WorkflowTransition): Promise<StandardsDocument> {
    const doc = this.docs.get(id);
    if (!doc) throw new Error(`doc_not_found: ${id}`);
    const { from, to } = WORKFLOW_TRANSITIONS[transition];
    if (doc.workflowStatus !== from) {
      throw new Error(`invalid_transition: ${doc.workflowStatus} → ${transition}`);
    }
    const updated = { ...doc, workflowStatus: to };
    this.docs.set(id, updated);
    if (transition === 'approve') {
      const version = this.snapshots.filter((s) => s.documentId === id).length + 1;
      this.snapshots.push({
        id: globalThis.crypto.randomUUID(),
        documentId: id,
        version,
        workflowStatus: to,
        controls: [...doc.controls],
        createdAt: new Date().toISOString(),
      });
    }
    return updated;
  }

  async listSnapshots(documentId: string): Promise<StandardsSnapshot[]> {
    return this.snapshots
      .filter((s) => s.documentId === documentId)
      .sort((a, b) => b.version - a.version);
  }

  async getSnapshot(snapshotId: string): Promise<StandardsSnapshot | null> {
    return this.snapshots.find((s) => s.id === snapshotId) ?? null;
  }

  async saveGapAnalysis(
    orgId: string,
    userId: string,
    docId: string | null,
    result: GapAnalysisResult,
  ): Promise<GapAnalysis> {
    const analysis: GapAnalysis = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      docId,
      result,
      riskScore: result.riskScore,
      createdAt: new Date().toISOString(),
    };
    this.gapAnalyses.push(analysis);
    return analysis;
  }

  async listGapAnalyses(orgId: string): Promise<GapAnalysis[]> {
    return this.gapAnalyses.filter((g) => g.orgId === orgId);
  }

  async getGapAnalysis(id: string): Promise<GapAnalysis | null> {
    return this.gapAnalyses.find((g) => g.id === id) ?? null;
  }

  async getUserPrefs(userId: string): Promise<UserPrefsPayload> {
    return this.userPrefs.get(userId) ?? { ...DEFAULT_USER_PREFS };
  }

  async updateUserPrefs(
    userId: string,
    patch: Partial<UserPrefsPayload>,
  ): Promise<UserPrefsPayload> {
    const current = await this.getUserPrefs(userId);
    const updated: UserPrefsPayload = {
      ...current,
      ...patch,
      notificationPrefs: patch.notificationPrefs
        ? { ...current.notificationPrefs, ...patch.notificationPrefs }
        : current.notificationPrefs,
    };
    this.userPrefs.set(userId, updated);
    return updated;
  }

  async savePushSubscription(
    userId: string,
    sub: PushSubscriptionPayload,
  ): Promise<{ ok: boolean }> {
    const existing = this.pushSubscriptions.get(userId) ?? [];
    const filtered = existing.filter((s) => s.endpoint !== sub.endpoint);
    this.pushSubscriptions.set(userId, [...filtered, sub]);
    return { ok: true };
  }

  async removePushSubscription(userId: string, endpoint: string): Promise<{ ok: boolean }> {
    const existing = this.pushSubscriptions.get(userId) ?? [];
    this.pushSubscriptions.set(
      userId,
      existing.filter((s) => s.endpoint !== endpoint),
    );
    return { ok: true };
  }

  async getChatHistory(userId: string, limit = 100): Promise<AiChatMessage[]> {
    const msgs = this.chatMessages.get(userId) ?? [];
    return msgs.slice(-limit);
  }

  async saveChatMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<AiChatMessage> {
    const msg: AiChatMessage = {
      id: globalThis.crypto.randomUUID(),
      role,
      content,
      createdAt: new Date().toISOString(),
    };
    const existing = this.chatMessages.get(userId) ?? [];
    this.chatMessages.set(userId, [...existing, msg]);
    return msg;
  }

  async clearChatHistory(userId: string): Promise<{ ok: boolean }> {
    this.chatMessages.delete(userId);
    return { ok: true };
  }

  async logAuditEvent(
    userId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const log: AuditLog = {
      id: globalThis.crypto.randomUUID(),
      userId,
      action,
      resourceType: resourceType ?? null,
      resourceId: resourceId ?? null,
      metadata,
      createdAt: new Date().toISOString(),
    };
    const existing = this.auditLogs.get(userId) ?? [];
    this.auditLogs.set(userId, [...existing, log]);
  }

  async listAuditLogs(userId: string, filters: AuditLogFilters = {}): Promise<AuditLogPage> {
    const { page = 1, limit = 50, action, from, to } = filters;
    let items = this.auditLogs.get(userId) ?? [];
    if (action) items = items.filter((l) => l.action === action);
    if (from) items = items.filter((l) => l.createdAt >= from);
    if (to) items = items.filter((l) => l.createdAt <= to);
    items = [...items].reverse();
    const total = items.length;
    const start = (page - 1) * limit;
    return { items: items.slice(start, start + limit), total, page, limit };
  }

  async createApiKey(userId: string, name: string, expiresAt?: string): Promise<ApiKeyWithSecret> {
    const rawKey = `cpiq_${globalThis.crypto.randomUUID().replace(/-/g, '')}`;
    const keyPrefix = rawKey.slice(0, 12);
    const key: ApiKey = {
      id: globalThis.crypto.randomUUID(),
      userId,
      name,
      keyPrefix,
      expiresAt: expiresAt ?? null,
      lastUsedAt: null,
      revokedAt: null,
      createdAt: new Date().toISOString(),
    };
    const existing = this.apiKeys.get(userId) ?? [];
    this.apiKeys.set(userId, [...existing, key]);
    return { ...key, fullKey: rawKey };
  }

  async listApiKeys(userId: string): Promise<ApiKey[]> {
    return this.apiKeys.get(userId) ?? [];
  }

  async revokeApiKey(id: string, userId: string): Promise<{ ok: boolean }> {
    const keys = this.apiKeys.get(userId) ?? [];
    this.apiKeys.set(
      userId,
      keys.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)),
    );
    return { ok: true };
  }

  async createWebhook(userId: string, input: WebhookInput): Promise<Webhook> {
    const wh: Webhook = {
      id: globalThis.crypto.randomUUID(),
      userId,
      url: input.url,
      events: input.events,
      secret: globalThis.crypto.randomUUID().replace(/-/g, ''),
      active: true,
      createdAt: new Date().toISOString(),
    };
    const existing = this.webhooks.get(userId) ?? [];
    this.webhooks.set(userId, [...existing, wh]);
    return wh;
  }

  async listWebhooks(userId: string): Promise<Webhook[]> {
    return this.webhooks.get(userId) ?? [];
  }

  async updateWebhook(
    id: string,
    userId: string,
    patch: Partial<WebhookInput> & { active?: boolean },
  ): Promise<Webhook> {
    const hooks = this.webhooks.get(userId) ?? [];
    let updated: Webhook | undefined;
    this.webhooks.set(
      userId,
      hooks.map((w) => {
        if (w.id !== id) return w;
        updated = { ...w, ...patch };
        return updated;
      }),
    );
    if (!updated) throw new Error(`Webhook ${id} not found`);
    return updated;
  }

  async deleteWebhook(id: string, userId: string): Promise<{ ok: boolean }> {
    const hooks = this.webhooks.get(userId) ?? [];
    this.webhooks.set(
      userId,
      hooks.filter((w) => w.id !== id),
    );
    return { ok: true };
  }

  async getRetentionPrefs(userId: string): Promise<RetentionPrefsPayload> {
    return this.retentionPrefs.get(userId) ?? { ...DEFAULT_RETENTION_PREFS };
  }

  async updateRetentionPrefs(
    userId: string,
    patch: Partial<RetentionPrefsPayload>,
  ): Promise<RetentionPrefsPayload> {
    const current = await this.getRetentionPrefs(userId);
    const updated = { ...current, ...patch };
    this.retentionPrefs.set(userId, updated);
    return updated;
  }

  async listReportTemplates(): Promise<ReportTemplate[]> {
    return this.reportTemplates;
  }

  async createReportTemplate(userId: string, input: ReportTemplateInput): Promise<ReportTemplate> {
    const tpl: ReportTemplate = {
      id: `tpl-${this.reportTemplates.length + 1}`,
      ...input,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };
    this.reportTemplates.push(tpl);
    return tpl;
  }

  async updateReportTemplate(
    id: string,
    patch: Partial<ReportTemplateInput>,
  ): Promise<ReportTemplate> {
    const existing = this.reportTemplates.find((t) => t.id === id);
    if (!existing) throw new Error(`ReportTemplate ${id} not found`);
    const updated: ReportTemplate = { ...existing, ...patch };
    this.reportTemplates = this.reportTemplates.map((t) => (t.id === id ? updated : t));
    return updated;
  }

  async deleteReportTemplate(id: string): Promise<{ ok: boolean }> {
    this.reportTemplates = this.reportTemplates.filter((t) => t.id !== id);
    return { ok: true };
  }

  logAiUsage(_entry: AiUsageLogEntry): void {
    // fire-and-forget stub — no-op in tests
  }

  async getAiUsageSummary(_since: string, _userId?: string): Promise<AiUsageSummaryRpc> {
    return {
      total_calls: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      success_count: 0,
      error_count: 0,
      by_provider: [],
      by_operation: [],
      by_key_source: [],
      by_user: [],
    };
  }

  async getAiUsageTimeseries(_since: string, _userId?: string): Promise<AiUsageTimeseriesPoint[]> {
    return [];
  }
}
