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
  StandardPatch,
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
  DocumentStandard,
  StandardsDocument,
  StandardsSnapshot,
  UserPrefsPayload,
  Webhook,
  WebhookInput,
  WorkflowTransition,
  Exception,
  ExceptionInput,
  ExceptionPatch,
  Issue,
  IssueInput,
  IssuePatch,
  Asset,
  AssetInput,
  AssetPatch,
  Risk,
  RiskInput,
  RiskPatch,
  RiskLikelihood,
  RiskImpact,
  RiskAssessment,
  RiskAssessmentInput,
  RiskAssessmentPatch,
  RiskAssessmentItem,
  RiskAssessmentItemInput,
  RiskAssessmentItemPatch,
  Policy,
  PolicyInput,
  PolicyPatch,
  PolicyTemplate,
  PolicyControl,
  PolicyControlInput,
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
  private exceptions = new Map<string, Exception>();
  private issues = new Map<string, Issue>();

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
      standards: [],
      status: 'pending',
      workflowStatus: 'draft',
      createdAt: new Date().toISOString(),
    });
    return { id };
  }

  async saveStandardsDocument(id: string, standards: DocumentStandard[]): Promise<void> {
    const existing = this.docs.get(id);
    if (!existing) throw new Error(`doc_not_found: ${id}`);
    this.docs.set(id, { ...existing, standards, status: 'completed' });
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
    this.docs.set(id, { ...existing, status: 'pending', standards: [] });
  }

  async getStandardsDocument(id: string): Promise<StandardsDocument | null> {
    return this.docs.get(id) ?? null;
  }

  async listStandardsDocuments(orgId: string): Promise<StandardsDocument[]> {
    return [...this.docs.values()].filter((d) => d.orgId === orgId);
  }

  async updateStandard(
    docId: string,
    code: string,
    patch: StandardPatch,
  ): Promise<DocumentStandard> {
    const doc = this.docs.get(docId);
    if (!doc) throw new Error(`doc_not_found: ${docId}`);
    const idx = doc.standards.findIndex((s) => s.code === code);
    if (idx === -1) throw new Error(`standard_not_found: ${code}`);
    const updated = { ...doc.standards[idx], ...patch } as DocumentStandard;
    const standards = [...doc.standards];
    standards[idx] = updated;
    this.docs.set(docId, { ...doc, standards });
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
        standards: [...doc.standards],
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

  async addTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate> {
    const tpl = this.reportTemplates.find((t) => t.id === id);
    if (!tpl) throw new Error(`ReportTemplate ${id} not found`);
    if (!tpl.favoriteOrgIds.includes(orgId)) {
      return this.updateReportTemplate(id, { favoriteOrgIds: [...tpl.favoriteOrgIds, orgId] });
    }
    return tpl;
  }

  async removeTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate> {
    const tpl = this.reportTemplates.find((t) => t.id === id);
    if (!tpl) throw new Error(`ReportTemplate ${id} not found`);
    return this.updateReportTemplate(id, {
      favoriteOrgIds: tpl.favoriteOrgIds.filter((o) => o !== orgId),
    });
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

  // ─── Exceptions ────────────────────────────────────────────────────────────

  async listExceptions(orgId: string): Promise<Exception[]> {
    return [...this.exceptions.values()].filter((e) => e.orgId === orgId);
  }

  async createException(orgId: string, userId: string, data: ExceptionInput): Promise<Exception> {
    const now = new Date().toISOString();
    const exc: Exception = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      controlCode: data.controlCode,
      standardCode: data.standardCode,
      frameworkId: data.frameworkId,
      title: data.title,
      statement: data.statement,
      justification: data.justification,
      ownerId: data.ownerId,
      compensatingControls: data.compensatingControls,
      status: 'pending',
      expiresAt: data.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.exceptions.set(exc.id, exc);
    return exc;
  }

  async getException(id: string): Promise<Exception | null> {
    return this.exceptions.get(id) ?? null;
  }

  async updateException(id: string, patch: ExceptionPatch): Promise<Exception> {
    const existing = this.exceptions.get(id);
    if (!existing) throw new Error(`exception_not_found: ${id}`);
    const updated: Exception = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.exceptions.set(id, updated);
    return updated;
  }

  async approveException(id: string): Promise<Exception> {
    const existing = this.exceptions.get(id);
    if (!existing) throw new Error('exception_not_found');
    const approved: Exception = {
      ...existing,
      status: 'approved',
      updatedAt: new Date().toISOString(),
    };
    this.exceptions.set(id, approved);
    return approved;
  }

  async rejectException(id: string): Promise<Exception> {
    const existing = this.exceptions.get(id);
    if (!existing) throw new Error(`exception_not_found: ${id}`);
    const rejected: Exception = {
      ...existing,
      status: 'rejected',
      updatedAt: new Date().toISOString(),
    };
    this.exceptions.set(id, rejected);
    return rejected;
  }

  async deleteException(id: string): Promise<void> {
    if (!this.exceptions.has(id)) throw new Error(`exception_not_found: ${id}`);
    this.exceptions.delete(id);
  }

  // ─── Issues ────────────────────────────────────────────────────────────────

  async listIssues(orgId: string): Promise<Issue[]> {
    return [...this.issues.values()].filter((i) => i.orgId === orgId);
  }

  async createIssue(orgId: string, userId: string, data: IssueInput): Promise<Issue> {
    const now = new Date().toISOString();
    const issue: Issue = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      title: data.title,
      description: data.description,
      severity: data.severity,
      status: 'open',
      source: data.source ?? 'manual',
      sourceId: data.sourceId ?? null,
      dueDate: data.dueDate ?? null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.issues.set(issue.id, issue);
    return issue;
  }

  async getIssue(id: string): Promise<Issue | null> {
    return this.issues.get(id) ?? null;
  }

  async updateIssue(id: string, patch: IssuePatch): Promise<Issue> {
    const existing = this.issues.get(id);
    if (!existing) throw new Error('issue_not_found');
    const resolvedAt: string | null =
      'resolvedAt' in patch
        ? (patch.resolvedAt ?? null)
        : patch.status === 'resolved'
          ? new Date().toISOString()
          : patch.status !== undefined
            ? null
            : existing.resolvedAt;
    const updated: Issue = {
      ...existing,
      ...patch,
      resolvedAt,
      updatedAt: new Date().toISOString(),
    };
    this.issues.set(id, updated);
    return updated;
  }

  async deleteIssue(id: string): Promise<void> {
    if (!this.issues.has(id)) throw new Error(`issue_not_found: ${id}`);
    this.issues.delete(id);
  }

  // ─── Assets ──────────────────────────────────────────────────────────────
  private assets: Asset[] = [];

  async listAssets(orgId: string): Promise<Asset[]> {
    return this.assets.filter((a) => a.orgId === orgId);
  }

  async createAsset(orgId: string, userId: string, data: AssetInput): Promise<Asset> {
    const asset: Asset = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      name: data.name,
      type: data.type,
      criticality: data.criticality,
      description: data.description,
      owner: data.owner,
      tags: data.tags ?? [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.assets.push(asset);
    return asset;
  }

  async getAsset(id: string): Promise<Asset | null> {
    return this.assets.find((a) => a.id === id) ?? null;
  }

  async updateAsset(id: string, patch: AssetPatch): Promise<Asset> {
    const idx = this.assets.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('asset_not_found');
    const updated: Asset = { ...this.assets[idx]!, ...patch, updatedAt: new Date().toISOString() };
    this.assets[idx] = updated;
    return updated;
  }

  async deleteAsset(id: string): Promise<void> {
    this.assets = this.assets.filter((a) => a.id !== id);
  }

  // ─── Risks ───────────────────────────────────────────────────────────────
  private risks: Risk[] = [];

  private computeRiskScore(likelihood: RiskLikelihood, impact: RiskImpact): number {
    const L: Record<RiskLikelihood, number> = {
      very_low: 1,
      low: 2,
      medium: 3,
      high: 4,
      very_high: 5,
    };
    const I: Record<RiskImpact, number> = {
      very_low: 1,
      low: 2,
      medium: 3,
      high: 4,
      very_high: 5,
    };
    return L[likelihood] * I[impact];
  }

  async listRisks(orgId: string): Promise<Risk[]> {
    return this.risks.filter((r) => r.orgId === orgId);
  }

  async createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk> {
    const risk: Risk = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      title: data.title,
      description: data.description,
      category: data.category,
      likelihood: data.likelihood,
      impact: data.impact,
      riskScore: this.computeRiskScore(data.likelihood, data.impact),
      treatment: data.treatment ?? 'mitigate',
      assetId: data.assetId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.risks.push(risk);
    return risk;
  }

  async getRisk(id: string): Promise<Risk | null> {
    return this.risks.find((r) => r.id === id) ?? null;
  }

  async updateRisk(id: string, patch: RiskPatch): Promise<Risk> {
    const idx = this.risks.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error('risk_not_found');
    const merged: Risk = { ...this.risks[idx]!, ...patch, updatedAt: new Date().toISOString() };
    if (patch.likelihood !== undefined || patch.impact !== undefined) {
      merged.riskScore = this.computeRiskScore(merged.likelihood, merged.impact);
    }
    this.risks[idx] = merged;
    return merged;
  }

  async deleteRisk(id: string): Promise<void> {
    this.risks = this.risks.filter((r) => r.id !== id);
  }

  // ─── Risk Assessments ────────────────────────────────────────────────────
  private assessments: RiskAssessment[] = [];
  private assessmentItems: RiskAssessmentItem[] = [];

  async listAssessments(orgId: string): Promise<RiskAssessment[]> {
    return this.assessments.filter((a) => a.orgId === orgId);
  }

  async createAssessment(
    orgId: string,
    userId: string,
    data: RiskAssessmentInput,
  ): Promise<RiskAssessment> {
    const now = new Date().toISOString();
    const assessment: RiskAssessment = {
      id: globalThis.crypto.randomUUID(),
      orgId,
      userId,
      type: data.type,
      title: data.title,
      scope: data.scope,
      status: 'draft',
      riskScore: 0,
      itemCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.assessments.push(assessment);
    return assessment;
  }

  async getAssessment(id: string): Promise<RiskAssessment | null> {
    return this.assessments.find((a) => a.id === id) ?? null;
  }

  async updateAssessment(id: string, patch: RiskAssessmentPatch): Promise<RiskAssessment> {
    const idx = this.assessments.findIndex((a) => a.id === id);
    if (idx === -1) throw new Error('assessment_not_found');
    const updated: RiskAssessment = {
      ...this.assessments[idx]!,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.assessments[idx] = updated;
    return updated;
  }

  async deleteAssessment(id: string): Promise<void> {
    this.assessments = this.assessments.filter((a) => a.id !== id);
    this.assessmentItems = this.assessmentItems.filter((i) => i.assessmentId !== id);
  }

  async listAssessmentItems(assessmentId: string): Promise<RiskAssessmentItem[]> {
    return this.assessmentItems.filter((i) => i.assessmentId === assessmentId);
  }

  async addAssessmentItem(
    assessmentId: string,
    data: RiskAssessmentItemInput,
  ): Promise<RiskAssessmentItem> {
    const now = new Date().toISOString();
    const item: RiskAssessmentItem = {
      id: globalThis.crypto.randomUUID(),
      assessmentId,
      subject: data.subject,
      description: data.description,
      likelihood: data.likelihood,
      impact: data.impact,
      itemScore: this.computeRiskScore(data.likelihood, data.impact),
      mitigations: data.mitigations ?? '',
      createdAt: now,
      updatedAt: now,
    };
    this.assessmentItems.push(item);
    this.recomputeAssessmentScore(assessmentId);
    return item;
  }

  async updateAssessmentItem(
    id: string,
    patch: RiskAssessmentItemPatch,
  ): Promise<RiskAssessmentItem> {
    const idx = this.assessmentItems.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error('assessment_item_not_found');
    const existing = this.assessmentItems[idx]!;
    const merged: RiskAssessmentItem = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (patch.likelihood !== undefined || patch.impact !== undefined) {
      merged.itemScore = this.computeRiskScore(merged.likelihood, merged.impact);
    }
    this.assessmentItems[idx] = merged;
    this.recomputeAssessmentScore(merged.assessmentId);
    return merged;
  }

  async deleteAssessmentItem(id: string): Promise<void> {
    const item = this.assessmentItems.find((i) => i.id === id);
    this.assessmentItems = this.assessmentItems.filter((i) => i.id !== id);
    if (item) this.recomputeAssessmentScore(item.assessmentId);
  }

  private recomputeAssessmentScore(assessmentId: string): void {
    const items = this.assessmentItems.filter((i) => i.assessmentId === assessmentId);
    const idx = this.assessments.findIndex((a) => a.id === assessmentId);
    if (idx === -1) return;
    const riskScore =
      items.length > 0
        ? Math.round(items.reduce((sum, i) => sum + i.itemScore, 0) / items.length)
        : 0;
    this.assessments[idx] = {
      ...this.assessments[idx]!,
      riskScore,
      itemCount: items.length,
      updatedAt: new Date().toISOString(),
    };
  }

  // ─── Policies ────────────────────────────────────────────────────────────
  private policies: Policy[] = [];
  private policyTemplates: PolicyTemplate[] = [
    {
      id: 'tmpl-1',
      frameworkId: 'fw-soc2',
      title: 'SOC 2 Policy Template',
      content: '# SOC 2 Policy\n\nThis policy covers SOC 2 Type II requirements.',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ];
  private policyControls: PolicyControl[] = [];

  async listPolicies(orgId: string): Promise<Policy[]> {
    return this.policies.filter((p) => p.orgId === orgId);
  }

  async createPolicy(orgId: string, userId: string, data: PolicyInput): Promise<Policy> {
    const policy: Policy = {
      id: crypto.randomUUID(),
      orgId,
      userId,
      frameworkId: data.frameworkId,
      title: data.title,
      content: data.content,
      status: 'draft',
      version: 1,
      templateId: data.templateId ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.policies.push(policy);
    return policy;
  }

  async getPolicy(id: string): Promise<Policy | null> {
    return this.policies.find((p) => p.id === id) ?? null;
  }

  async updatePolicy(id: string, patch: PolicyPatch): Promise<Policy> {
    const idx = this.policies.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('policy_not_found');
    const updated = { ...this.policies[idx], ...patch, updatedAt: new Date().toISOString() };
    if (patch.content !== undefined) updated.version = this.policies[idx]!.version + 1;
    this.policies[idx] = updated as Policy;
    return this.policies[idx]!;
  }

  async deletePolicy(id: string): Promise<void> {
    this.policyControls = this.policyControls.filter((c) => c.policyId !== id);
    this.policies = this.policies.filter((p) => p.id !== id);
  }

  async cloneTemplate(orgId: string, userId: string, templateId: string): Promise<Policy> {
    const tmpl = this.policyTemplates.find((t) => t.id === templateId);
    if (!tmpl) throw new Error('template_not_found');
    return this.createPolicy(orgId, userId, {
      frameworkId: tmpl.frameworkId,
      title: tmpl.title,
      content: tmpl.content,
      templateId: tmpl.id,
    });
  }

  async listPolicyTemplates(frameworkId?: string): Promise<PolicyTemplate[]> {
    if (frameworkId) return this.policyTemplates.filter((t) => t.frameworkId === frameworkId);
    return [...this.policyTemplates];
  }

  async listPolicyControls(policyId: string): Promise<PolicyControl[]> {
    return this.policyControls.filter((c) => c.policyId === policyId);
  }

  async addPolicyControl(policyId: string, data: PolicyControlInput): Promise<PolicyControl> {
    const existing = this.policyControls.find(
      (c) =>
        c.policyId === policyId &&
        c.controlCode === data.controlCode &&
        c.frameworkId === data.frameworkId,
    );
    if (existing) return existing;
    const pc: PolicyControl = {
      id: crypto.randomUUID(),
      policyId,
      controlCode: data.controlCode,
      frameworkId: data.frameworkId,
      createdAt: new Date().toISOString(),
    };
    this.policyControls.push(pc);
    return pc;
  }

  async removePolicyControl(id: string): Promise<void> {
    this.policyControls = this.policyControls.filter((c) => c.id !== id);
  }

  async listPoliciesForControl(controlCode: string, frameworkId: string): Promise<Policy[]> {
    const policyIds = this.policyControls
      .filter((c) => c.controlCode === controlCode && c.frameworkId === frameworkId)
      .map((c) => c.policyId);
    return this.policies.filter((p) => policyIds.includes(p.id));
  }
}
