import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AiChatMessage,
  AiUsageLogEntry,
  AiUsageSummaryRpc,
  AiUsageTimeseriesPoint,
  Asset,
  AssetInput,
  AssetPatch,
  AuditLog,
  AuditLogFilters,
  AuditLogPage,
  ApiKey,
  ApiKeyWithSecret,
  DocumentStandard,
  Exception,
  ExceptionInput,
  ExceptionPatch,
  Framework,
  FrameworkControl,
  GapAnalysis,
  GapAnalysisResult,
  Issue,
  IssueInput,
  IssuePatch,
  NotesStrategy,
  Organization,
  OrganizationInput,
  PushSubscriptionPayload,
  ReportTemplate,
  ReportTemplateInput,
  RetentionPrefsPayload,
  Risk,
  RiskAssessment,
  RiskAssessmentInput,
  RiskAssessmentItem,
  RiskAssessmentItemInput,
  RiskAssessmentItemPatch,
  RiskAssessmentPatch,
  AssessmentType,
  AssessmentStatus,
  RiskImpact,
  RiskInput,
  RiskLikelihood,
  RiskPatch,
  StandardPatch,
  StandardsDocument,
  StandardsSnapshot,
  UserPrefsPayload,
  Webhook,
  WebhookInput,
  WorkflowTransition,
  Policy,
  PolicyInput,
  PolicyPatch,
  PolicyTemplate,
  PolicyControl,
  PolicyControlInput,
} from '@icore/shared';
import { DEFAULT_RETENTION_PREFS, DEFAULT_USER_PREFS, WORKFLOW_TRANSITIONS } from '@icore/shared';

function ok<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export class SupabaseNotesStrategy implements NotesStrategy {
  constructor(private readonly db: SupabaseClient) {}

  private computeRiskScore(likelihood: RiskLikelihood, impact: RiskImpact): number {
    const L: Record<RiskLikelihood, number> = {
      very_low: 1,
      low: 2,
      medium: 3,
      high: 4,
      very_high: 5,
    };
    const I: Record<RiskImpact, number> = { very_low: 1, low: 2, medium: 3, high: 4, very_high: 5 };
    return L[likelihood] * I[impact];
  }

  async listFrameworks(): Promise<Framework[]> {
    const { data, error } = await this.db
      .from('frameworks')
      .select('id, slug, name, description, version, category')
      .order('name');
    const rows = ok(data, error) as Array<{
      id: string;
      slug: string;
      name: string;
      description: string;
      version: string;
      category: string;
    }>;

    const counts = await Promise.all(
      rows.map(async (fw) => {
        const { count } = await this.db
          .from('controls')
          .select('id', { count: 'exact', head: true })
          .eq('framework_id', fw.id);
        return { id: fw.id, count: count ?? 0 };
      }),
    );
    const countMap = Object.fromEntries(counts.map((c) => [c.id, c.count]));

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      version: r.version,
      category: r.category as Framework['category'],
      controlCount: countMap[r.id] ?? 0,
    }));
  }

  async getFramework(id: string): Promise<Framework | null> {
    const { data, error } = await this.db
      .from('frameworks')
      .select('id, slug, name, description, version, category')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const r = data as {
      id: string;
      slug: string;
      name: string;
      description: string;
      version: string;
      category: string;
    };
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      version: r.version,
      category: r.category as Framework['category'],
    };
  }

  async listControlsByFramework(frameworkId: string): Promise<FrameworkControl[]> {
    const { data, error } = await this.db
      .from('controls')
      .select('id, framework_id, code, title, description, category')
      .eq('framework_id', frameworkId)
      .order('code');
    const rows = ok(data, error) as Array<{
      id: string;
      framework_id: string;
      code: string;
      title: string;
      description: string;
      category: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      frameworkId: r.framework_id,
      code: r.code,
      title: r.title,
      description: r.description,
      category: r.category,
    }));
  }

  async listOrganizations(userId: string): Promise<Organization[]> {
    const { data, error } = await this.db
      .from('org_profiles')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.mapOrg(r));
  }

  async createOrganization(userId: string, data: OrganizationInput): Promise<Organization> {
    const now = new Date().toISOString();
    const { data: row, error } = await this.db
      .from('org_profiles')
      .insert({
        user_id: userId,
        name: data.name,
        industry: data.industry,
        size: data.size,
        regions: data.regions,
        tech_stack: data.techStack,
        regulations: data.regulations,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    return this.mapOrg(ok(row, error));
  }

  async getOrganizationById(orgId: string): Promise<Organization | null> {
    const { data, error } = await this.db
      .from('org_profiles')
      .select()
      .eq('id', orgId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.mapOrg(data) : null;
  }

  async updateOrganization(orgId: string, data: OrganizationInput): Promise<Organization> {
    const { data: row, error } = await this.db
      .from('org_profiles')
      .update({
        name: data.name,
        industry: data.industry,
        size: data.size,
        regions: data.regions,
        tech_stack: data.techStack,
        regulations: data.regulations,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId)
      .select()
      .single();
    return this.mapOrg(ok(row, error));
  }

  async deleteOrganization(orgId: string): Promise<void> {
    const { error } = await this.db.from('org_profiles').delete().eq('id', orgId);
    if (error) throw new Error(error.message);
  }

  async createStandardsDocument(
    userId: string,
    orgId: string,
    frameworkIds: string[],
  ): Promise<{ id: string }> {
    const { data, error } = await this.db
      .from('generated_standards')
      .insert({
        user_id: userId,
        org_profile_id: orgId,
        framework_ids: frameworkIds,
        standards: [],
        status: 'pending',
        workflow_status: 'draft',
      })
      .select('id')
      .single();
    const r = ok(data, error) as { id: string };
    return { id: r.id };
  }

  async saveStandardsDocument(id: string, standards: DocumentStandard[]): Promise<void> {
    const { error } = await this.db
      .from('generated_standards')
      .update({ standards, status: 'completed' })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async failStandardsDocument(id: string, _reason?: string): Promise<void> {
    const { error } = await this.db
      .from('generated_standards')
      .update({ status: 'failed' })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async deleteStandardsDocument(id: string): Promise<void> {
    const { error } = await this.db.from('generated_standards').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async resetStandardsDocument(id: string): Promise<void> {
    const { error } = await this.db
      .from('generated_standards')
      .update({ status: 'pending', standards: [] })
      .eq('id', id);
    if (error) throw new Error(error.message);
  }

  async getStandardsDocument(id: string): Promise<StandardsDocument | null> {
    const { data, error } = await this.db
      .from('generated_standards')
      .select()
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.mapDoc(data) : null;
  }

  async listStandardsDocuments(orgId: string): Promise<StandardsDocument[]> {
    const { data, error } = await this.db
      .from('generated_standards')
      .select()
      .eq('org_profile_id', orgId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.mapDoc(r));
  }

  async transitionWorkflow(id: string, transition: WorkflowTransition): Promise<StandardsDocument> {
    const doc = await this.getStandardsDocument(id);
    if (!doc) throw new Error('doc_not_found');
    const { from, to } = WORKFLOW_TRANSITIONS[transition];
    if (doc.workflowStatus !== from) {
      throw new Error(`invalid_transition: ${doc.workflowStatus} → ${transition}`);
    }
    const { error } = await this.db
      .from('generated_standards')
      .update({ workflow_status: to })
      .eq('id', id);
    if (error) throw new Error(error.message);
    if (transition === 'approve') {
      const { count } = await this.db
        .from('standards_snapshots')
        .select('id', { count: 'exact', head: true })
        .eq('document_id', id);
      const version = (count ?? 0) + 1;
      const { error: snapErr } = await this.db.from('standards_snapshots').insert({
        document_id: id,
        version,
        workflow_status: to,
        standards: doc.standards,
      });
      if (snapErr) throw new Error(snapErr.message);
    }
    return { ...doc, workflowStatus: to };
  }

  async listSnapshots(documentId: string): Promise<StandardsSnapshot[]> {
    const { data, error } = await this.db
      .from('standards_snapshots')
      .select()
      .eq('document_id', documentId)
      .order('version', { ascending: false });
    return (ok(data, error) as unknown[]).map((r) => this.mapSnapshot(r));
  }

  async getSnapshot(snapshotId: string): Promise<StandardsSnapshot | null> {
    const { data, error } = await this.db
      .from('standards_snapshots')
      .select()
      .eq('id', snapshotId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.mapSnapshot(data) : null;
  }

  async updateStandard(
    docId: string,
    code: string,
    patch: StandardPatch,
  ): Promise<DocumentStandard> {
    const doc = await this.getStandardsDocument(docId);
    if (!doc) throw new Error('doc_not_found');
    const idx = doc.standards.findIndex((c) => c.code === code);
    if (idx === -1) throw new Error('standard_not_found');
    const updated = { ...doc.standards[idx], ...patch } as DocumentStandard;
    const standards = [...doc.standards];
    standards[idx] = updated;
    const { error } = await this.db
      .from('generated_standards')
      .update({ standards })
      .eq('id', docId);
    if (error) throw new Error(error.message);
    return updated;
  }

  async getUserPrefs(userId: string): Promise<UserPrefsPayload> {
    const { data } = await this.db
      .from('profiles')
      .select('theme, language, notification_prefs')
      .eq('id', userId)
      .single();

    if (!data) return { ...DEFAULT_USER_PREFS };

    return {
      theme: (data.theme as UserPrefsPayload['theme']) ?? 'system',
      language: (data.language as UserPrefsPayload['language']) ?? 'en',
      notificationPrefs: {
        ...DEFAULT_USER_PREFS.notificationPrefs,
        ...((data.notification_prefs as Partial<UserPrefsPayload['notificationPrefs']>) ?? {}),
      },
    };
  }

  async updateUserPrefs(
    userId: string,
    patch: Partial<UserPrefsPayload>,
  ): Promise<UserPrefsPayload> {
    const update: Record<string, unknown> = {};
    if (patch.theme !== undefined) update['theme'] = patch.theme;
    if (patch.language !== undefined) update['language'] = patch.language;
    if (patch.notificationPrefs !== undefined)
      update['notification_prefs'] = patch.notificationPrefs;

    const { error } = await this.db.from('profiles').update(update).eq('id', userId);

    if (error) throw new Error(error.message);
    return this.getUserPrefs(userId);
  }

  async savePushSubscription(
    userId: string,
    sub: PushSubscriptionPayload,
  ): Promise<{ ok: boolean }> {
    const { error } = await this.db
      .from('push_subscriptions')
      .upsert(
        { user_id: userId, endpoint: sub.endpoint, keys: sub.keys },
        { onConflict: 'endpoint' },
      );

    if (error) throw new Error(error.message);
    return { ok: true };
  }

  async removePushSubscription(userId: string, endpoint: string): Promise<{ ok: boolean }> {
    const { error } = await this.db
      .from('push_subscriptions')
      .delete()
      .eq('user_id', userId)
      .eq('endpoint', endpoint);

    if (error) throw new Error(error.message);
    return { ok: true };
  }

  async getChatHistory(userId: string, limit = 100): Promise<AiChatMessage[]> {
    const { data, error } = await this.db
      .from('ai_chat_messages')
      .select('id, role, content, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id as string,
      role: r.role as 'user' | 'assistant',
      content: r.content as string,
      createdAt: r.created_at as string,
    }));
  }

  async saveChatMessage(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
  ): Promise<AiChatMessage> {
    const { data, error } = await this.db
      .from('ai_chat_messages')
      .insert({ user_id: userId, role, content })
      .select('id, role, content, created_at')
      .single();

    if (error) throw new Error(error.message);
    const r = data as { id: string; role: string; content: string; created_at: string };
    return {
      id: r.id,
      role: r.role as 'user' | 'assistant',
      content: r.content,
      createdAt: r.created_at,
    };
  }

  async clearChatHistory(userId: string): Promise<{ ok: boolean }> {
    const { error } = await this.db.from('ai_chat_messages').delete().eq('user_id', userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  }

  // ─── Audit log ─────────────────────────────────────────────────────────────

  async logAuditEvent(
    userId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    metadata: Record<string, unknown> = {},
  ): Promise<void> {
    const { error } = await this.db.from('audit_logs').insert({
      user_id: userId,
      action,
      resource_type: resourceType ?? null,
      resource_id: resourceId ?? null,
      metadata,
    });
    if (error) throw new Error(error.message);
  }

  async listAuditLogs(userId: string, filters: AuditLogFilters = {}): Promise<AuditLogPage> {
    const { page = 1, limit = 50, action, from, to } = filters;
    const offset = (page - 1) * limit;

    let q = this.db
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (action) q = q.eq('action', action);
    if (from) q = q.gte('created_at', from);
    if (to) q = q.lte('created_at', to);

    const { data, count, error } = await q;
    if (error) throw new Error(error.message);

    const items: AuditLog[] = (data ?? []).map((r) => ({
      id: r.id as string,
      userId: r.user_id as string,
      action: r.action as string,
      resourceType: r.resource_type as string | null,
      resourceId: r.resource_id as string | null,
      metadata: r.metadata as Record<string, unknown>,
      createdAt: r.created_at as string,
    }));

    return { items, total: count ?? 0, page, limit };
  }

  // ─── API keys ──────────────────────────────────────────────────────────────

  async createApiKey(userId: string, name: string, expiresAt?: string): Promise<ApiKeyWithSecret> {
    const rawKey = `cpiq_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12);

    const { data, error } = await this.db
      .from('api_keys')
      .insert({
        user_id: userId,
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        expires_at: expiresAt ?? null,
      })
      .select('id, user_id, name, key_prefix, expires_at, last_used_at, revoked_at, created_at')
      .single();

    if (error) throw new Error(error.message);
    return { ...this.mapApiKey(data), fullKey: rawKey };
  }

  async listApiKeys(userId: string): Promise<ApiKey[]> {
    const { data, error } = await this.db
      .from('api_keys')
      .select('id, user_id, name, key_prefix, expires_at, last_used_at, revoked_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.mapApiKey(r));
  }

  async revokeApiKey(id: string, userId: string): Promise<{ ok: boolean }> {
    const { error } = await this.db
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  }

  private mapApiKey(r: unknown): ApiKey {
    const row = r as {
      id: string;
      user_id: string;
      name: string;
      key_prefix: string;
      expires_at: string | null;
      last_used_at: string | null;
      revoked_at: string | null;
      created_at: string;
    };
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      keyPrefix: row.key_prefix,
      expiresAt: row.expires_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    };
  }

  // ─── Webhooks ──────────────────────────────────────────────────────────────

  async createWebhook(userId: string, input: WebhookInput): Promise<Webhook> {
    const secret = randomBytes(20).toString('hex');
    const { data, error } = await this.db
      .from('webhooks')
      .insert({ user_id: userId, url: input.url, events: input.events, secret })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapWebhook(data);
  }

  async listWebhooks(userId: string): Promise<Webhook[]> {
    const { data, error } = await this.db
      .from('webhooks')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.mapWebhook(r));
  }

  async updateWebhook(
    id: string,
    userId: string,
    patch: Partial<WebhookInput> & { active?: boolean },
  ): Promise<Webhook> {
    const update: Record<string, unknown> = {};
    if (patch.url !== undefined) update['url'] = patch.url;
    if (patch.events !== undefined) update['events'] = patch.events;
    if (patch.active !== undefined) update['active'] = patch.active;

    const { data, error } = await this.db
      .from('webhooks')
      .update(update)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapWebhook(data);
  }

  async deleteWebhook(id: string, userId: string): Promise<{ ok: boolean }> {
    const { error } = await this.db.from('webhooks').delete().eq('id', id).eq('user_id', userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  }

  private mapWebhook(r: unknown): Webhook {
    const row = r as {
      id: string;
      user_id: string;
      url: string;
      events: string[];
      secret: string;
      active: boolean;
      created_at: string;
    };
    return {
      id: row.id,
      userId: row.user_id,
      url: row.url,
      events: row.events as Webhook['events'],
      secret: row.secret,
      active: row.active,
      createdAt: row.created_at,
    };
  }

  // ─── Report templates ──────────────────────────────────────────────────────

  async listReportTemplates(): Promise<ReportTemplate[]> {
    const { data, error } = await this.db
      .from('report_templates')
      .select()
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => this.mapReportTemplate(r));
  }

  async createReportTemplate(userId: string, input: ReportTemplateInput): Promise<ReportTemplate> {
    const { data, error } = await this.db
      .from('report_templates')
      .insert({
        name: input.name,
        scope: input.scope,
        brand_name: input.brandName,
        accent_color: input.accentColor,
        include_summary: input.includeSummary,
        include_details: input.includeDetails,
        include_recommendations: input.includeRecommendations,
        footer_note: input.footerNote,
        favorite_org_ids: input.favoriteOrgIds,
        created_by: userId,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapReportTemplate(data);
  }

  async updateReportTemplate(
    id: string,
    patch: Partial<ReportTemplateInput>,
  ): Promise<ReportTemplate> {
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update['name'] = patch.name;
    if (patch.scope !== undefined) update['scope'] = patch.scope;
    if (patch.brandName !== undefined) update['brand_name'] = patch.brandName;
    if (patch.accentColor !== undefined) update['accent_color'] = patch.accentColor;
    if (patch.includeSummary !== undefined) update['include_summary'] = patch.includeSummary;
    if (patch.includeDetails !== undefined) update['include_details'] = patch.includeDetails;
    if (patch.includeRecommendations !== undefined)
      update['include_recommendations'] = patch.includeRecommendations;
    if (patch.footerNote !== undefined) update['footer_note'] = patch.footerNote;
    if (patch.favoriteOrgIds !== undefined) update['favorite_org_ids'] = patch.favoriteOrgIds;

    const { data, error } = await this.db
      .from('report_templates')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return this.mapReportTemplate(data);
  }

  async deleteReportTemplate(id: string): Promise<{ ok: boolean }> {
    const { error } = await this.db.from('report_templates').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  }

  async addTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate> {
    const current = await this.getTemplateFavorites(id);
    const next = current.includes(orgId) ? current : [...current, orgId];
    return this.updateReportTemplate(id, { favoriteOrgIds: next });
  }

  async removeTemplateFavorite(id: string, orgId: string): Promise<ReportTemplate> {
    const current = await this.getTemplateFavorites(id);
    return this.updateReportTemplate(id, {
      favoriteOrgIds: current.filter((o) => o !== orgId),
    });
  }

  private async getTemplateFavorites(id: string): Promise<string[]> {
    const { data, error } = await this.db
      .from('report_templates')
      .select('favorite_org_ids')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    return ((data as { favorite_org_ids: string[] | null })?.favorite_org_ids ?? []) as string[];
  }

  private mapReportTemplate(r: unknown): ReportTemplate {
    const row = r as {
      id: string;
      name: string;
      scope: string;
      brand_name: string;
      accent_color: string;
      include_summary: boolean;
      include_details: boolean;
      include_recommendations: boolean;
      footer_note: string;
      favorite_org_ids: string[] | null;
      created_by: string | null;
      created_at: string;
    };
    return {
      id: row.id,
      name: row.name,
      scope: row.scope as ReportTemplate['scope'],
      brandName: row.brand_name,
      accentColor: row.accent_color,
      includeSummary: row.include_summary,
      includeDetails: row.include_details,
      includeRecommendations: row.include_recommendations,
      footerNote: row.footer_note,
      favoriteOrgIds: row.favorite_org_ids ?? [],
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }

  // ─── Retention ─────────────────────────────────────────────────────────────

  async getRetentionPrefs(userId: string): Promise<RetentionPrefsPayload> {
    const { data } = await this.db
      .from('profiles')
      .select('retention_prefs')
      .eq('id', userId)
      .single();

    if (!data) return { ...DEFAULT_RETENTION_PREFS };
    return {
      ...DEFAULT_RETENTION_PREFS,
      ...((data.retention_prefs as Partial<RetentionPrefsPayload>) ?? {}),
    };
  }

  async updateRetentionPrefs(
    userId: string,
    patch: Partial<RetentionPrefsPayload>,
  ): Promise<RetentionPrefsPayload> {
    const current = await this.getRetentionPrefs(userId);
    const updated = { ...current, ...patch };
    const { error } = await this.db
      .from('profiles')
      .update({ retention_prefs: updated })
      .eq('id', userId);

    if (error) throw new Error(error.message);
    return updated;
  }

  // ─── AI usage ──────────────────────────────────────────────────────────────

  logAiUsage(entry: AiUsageLogEntry): void {
    void Promise.resolve(
      this.db.from('ai_usage_log').insert({
        user_id: entry.user_id,
        provider: entry.provider,
        operation: entry.operation,
        model: entry.model,
        key_source: entry.key_source,
        input_tokens: entry.input_tokens ?? 0,
        output_tokens: entry.output_tokens ?? 0,
        success: entry.success,
        error_code: entry.error_code ?? null,
        latency_ms: entry.latency_ms ?? 0,
      }),
    )
      .then(({ error }) => {
        if (error) console.warn('ai_usage_log insert failed:', error.message);
      })
      .catch((err: unknown) => {
        console.warn(
          'ai_usage_log insert threw:',
          err instanceof Error ? err.message : String(err),
        );
      });
  }

  async getAiUsageSummary(since: string, userId?: string): Promise<AiUsageSummaryRpc> {
    const { data, error } = await this.db.rpc('ai_usage_summary', {
      p_since: since,
      p_user_id: userId ?? null,
    });
    if (error) throw new Error(error.message);
    return data as AiUsageSummaryRpc;
  }

  async getAiUsageTimeseries(since: string, userId?: string): Promise<AiUsageTimeseriesPoint[]> {
    const { data, error } = await this.db.rpc('ai_usage_timeseries', {
      p_since: since,
      p_user_id: userId ?? null,
    });
    if (error) throw new Error(error.message);
    return (data as AiUsageTimeseriesPoint[]) ?? [];
  }

  private mapOrg(r: unknown): Organization {
    const row = r as {
      id: string;
      user_id: string;
      name: string;
      industry: string;
      size: string;
      regions: string[];
      tech_stack: string[];
      regulations: string[];
      created_at: string;
      updated_at: string;
    };
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      industry: row.industry,
      size: row.size as Organization['size'],
      regions: row.regions,
      techStack: row.tech_stack,
      regulations: row.regulations,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapSnapshot(r: unknown): StandardsSnapshot {
    const row = r as {
      id: string;
      document_id: string;
      version: number;
      workflow_status: string;
      standards: DocumentStandard[];
      created_at: string;
      created_by?: string;
    };
    return {
      id: row.id,
      documentId: row.document_id,
      version: row.version,
      workflowStatus: row.workflow_status as StandardsSnapshot['workflowStatus'],
      standards: row.standards ?? [],
      createdAt: row.created_at,
      createdBy: row.created_by,
    };
  }

  async saveGapAnalysis(
    orgId: string,
    userId: string,
    docId: string | null,
    result: GapAnalysisResult,
  ): Promise<GapAnalysis> {
    const { data, error } = await this.db
      .from('gap_analyses')
      .insert({
        org_id: orgId,
        user_id: userId,
        doc_id: docId,
        result,
        risk_score: result.riskScore,
      })
      .select()
      .single();
    const row = ok(data, error) as {
      id: string;
      org_id: string;
      user_id: string;
      doc_id: string | null;
      result: GapAnalysisResult;
      risk_score: number;
      created_at: string;
    };
    return {
      id: row.id,
      orgId: row.org_id,
      userId: row.user_id,
      docId: row.doc_id,
      result: row.result,
      riskScore: row.risk_score,
      createdAt: row.created_at,
    };
  }

  async listGapAnalyses(orgId: string): Promise<GapAnalysis[]> {
    const { data, error } = await this.db
      .from('gap_analyses')
      .select()
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      orgId: r.org_id,
      userId: r.user_id,
      docId: r.doc_id,
      result: r.result as GapAnalysisResult,
      riskScore: r.risk_score,
      createdAt: r.created_at,
    }));
  }

  async getGapAnalysis(id: string): Promise<GapAnalysis | null> {
    const { data, error } = await this.db.from('gap_analyses').select().eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      id: data.id,
      orgId: data.org_id,
      userId: data.user_id,
      docId: data.doc_id,
      result: data.result as GapAnalysisResult,
      riskScore: data.risk_score,
      createdAt: data.created_at,
    };
  }

  private mapDoc(r: unknown): StandardsDocument {
    const row = r as {
      id: string;
      user_id: string;
      org_profile_id: string;
      framework_ids: string[];
      standards: DocumentStandard[];
      status: string;
      workflow_status: string | null;
      created_at: string;
    };
    return {
      id: row.id,
      userId: row.user_id,
      orgId: row.org_profile_id,
      frameworkIds: row.framework_ids,
      standards: row.standards ?? [],
      status: row.status as StandardsDocument['status'],
      workflowStatus: (row.workflow_status ?? 'draft') as StandardsDocument['workflowStatus'],
      createdAt: row.created_at,
    };
  }

  // ─── Exceptions ────────────────────────────────────────────────────────────

  async listExceptions(orgId: string): Promise<Exception[]> {
    const { data, error } = await this.db
      .from('exceptions')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return ok(data, error).map((row) => this.toException(row));
  }

  async createException(orgId: string, userId: string, data: ExceptionInput): Promise<Exception> {
    const { data: row, error } = await this.db
      .from('exceptions')
      .insert({
        org_id: orgId,
        user_id: userId,
        control_code: data.controlCode,
        standard_code: data.standardCode ?? null,
        framework_id: data.frameworkId,
        title: data.title,
        justification: data.justification,
        expires_at: data.expiresAt ?? null,
      })
      .select()
      .single();
    return this.toException(ok(row, error));
  }

  async getException(id: string): Promise<Exception | null> {
    const { data, error } = await this.db.from('exceptions').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toException(data) : null;
  }

  async updateException(id: string, patch: ExceptionPatch): Promise<Exception> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.justification !== undefined) update['justification'] = patch.justification;
    if ('expiresAt' in patch) update['expires_at'] = patch.expiresAt;
    const { data, error } = await this.db
      .from('exceptions')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toException(ok(data, error));
  }

  async approveException(id: string): Promise<Exception> {
    const { data, error } = await this.db
      .from('exceptions')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return this.toException(ok(data, error));
  }

  async rejectException(id: string): Promise<Exception> {
    const { data, error } = await this.db
      .from('exceptions')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return this.toException(ok(data, error));
  }

  async deleteException(id: string): Promise<void> {
    const { error } = await this.db.from('exceptions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private toException(row: Record<string, unknown>): Exception {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      controlCode: row['control_code'] as string,
      standardCode: row['standard_code'] as string | undefined,
      frameworkId: row['framework_id'] as string,
      title: row['title'] as string,
      justification: row['justification'] as string,
      status: row['status'] as Exception['status'],
      expiresAt: row['expires_at'] as string | null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  // ─── Issues ────────────────────────────────────────────────────────────────

  async listIssues(orgId: string): Promise<Issue[]> {
    const { data, error } = await this.db
      .from('issues')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return ok(data, error).map((row) => this.toIssue(row));
  }

  async createIssue(orgId: string, userId: string, data: IssueInput): Promise<Issue> {
    const { data: row, error } = await this.db
      .from('issues')
      .insert({
        org_id: orgId,
        user_id: userId,
        title: data.title,
        description: data.description,
        severity: data.severity,
        source: data.source ?? 'manual',
        source_id: data.sourceId ?? null,
        due_date: data.dueDate ?? null,
      })
      .select()
      .single();
    return this.toIssue(ok(row, error));
  }

  async getIssue(id: string): Promise<Issue | null> {
    const { data, error } = await this.db.from('issues').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toIssue(data) : null;
  }

  async updateIssue(id: string, patch: IssuePatch): Promise<Issue> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.severity !== undefined) update['severity'] = patch.severity;
    if (patch.status !== undefined) {
      update['status'] = patch.status;
      if (!('resolvedAt' in patch)) {
        update['resolved_at'] = patch.status === 'resolved' ? new Date().toISOString() : null;
      }
    }
    if ('resolvedAt' in patch) update['resolved_at'] = patch.resolvedAt;
    if ('dueDate' in patch) update['due_date'] = patch.dueDate;
    const { data, error } = await this.db
      .from('issues')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toIssue(ok(data, error));
  }

  async deleteIssue(id: string): Promise<void> {
    const { error } = await this.db.from('issues').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private toIssue(row: Record<string, unknown>): Issue {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      title: row['title'] as string,
      description: row['description'] as string,
      severity: row['severity'] as Issue['severity'],
      status: row['status'] as Issue['status'],
      source: row['source'] as Issue['source'],
      sourceId: row['source_id'] as string | null,
      dueDate: row['due_date'] as string | null,
      resolvedAt: row['resolved_at'] as string | null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  // ─── Assets ────────────────────────────────────────────────────────────────

  async listAssets(orgId: string): Promise<Asset[]> {
    const { data, error } = await this.db
      .from('assets')
      .select('*')
      .eq('org_id', orgId)
      .order('name');
    return ok(data, error).map((row) => this.toAsset(row));
  }

  async createAsset(orgId: string, userId: string, data: AssetInput): Promise<Asset> {
    const { data: row, error } = await this.db
      .from('assets')
      .insert({
        org_id: orgId,
        user_id: userId,
        name: data.name,
        type: data.type,
        criticality: data.criticality,
        description: data.description,
        owner: data.owner,
        tags: data.tags ?? [],
      })
      .select()
      .single();
    return this.toAsset(ok(row, error));
  }

  async getAsset(id: string): Promise<Asset | null> {
    const { data, error } = await this.db.from('assets').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toAsset(data) : null;
  }

  async updateAsset(id: string, patch: AssetPatch): Promise<Asset> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) update['name'] = patch.name;
    if (patch.type !== undefined) update['type'] = patch.type;
    if (patch.criticality !== undefined) update['criticality'] = patch.criticality;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.owner !== undefined) update['owner'] = patch.owner;
    if (patch.tags !== undefined) update['tags'] = patch.tags;
    const { data, error } = await this.db
      .from('assets')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toAsset(ok(data, error));
  }

  async deleteAsset(id: string): Promise<void> {
    const { error } = await this.db.from('assets').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private toAsset(row: Record<string, unknown>): Asset {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      name: row['name'] as string,
      type: row['type'] as Asset['type'],
      criticality: row['criticality'] as Asset['criticality'],
      description: row['description'] as string,
      owner: row['owner'] as string,
      tags: row['tags'] as string[],
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  // ─── Risks ─────────────────────────────────────────────────────────────────

  async listRisks(orgId: string): Promise<Risk[]> {
    const { data, error } = await this.db
      .from('risks')
      .select('*')
      .eq('org_id', orgId)
      .order('risk_score', { ascending: false });
    return ok(data, error).map((row) => this.toRisk(row));
  }

  async createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk> {
    const riskScore = this.computeRiskScore(data.likelihood, data.impact);
    const { data: row, error } = await this.db
      .from('risks')
      .insert({
        org_id: orgId,
        user_id: userId,
        title: data.title,
        description: data.description,
        category: data.category,
        likelihood: data.likelihood,
        impact: data.impact,
        risk_score: riskScore,
        treatment: data.treatment ?? 'mitigate',
        asset_id: data.assetId ?? null,
      })
      .select()
      .single();
    return this.toRisk(ok(row, error));
  }

  async getRisk(id: string): Promise<Risk | null> {
    const { data, error } = await this.db.from('risks').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toRisk(data) : null;
  }

  async updateRisk(id: string, patch: RiskPatch): Promise<Risk> {
    const current = await this.getRisk(id);
    if (!current) throw new Error('risk_not_found');
    const newLikelihood = patch.likelihood ?? current.likelihood;
    const newImpact = patch.impact ?? current.impact;
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      risk_score: this.computeRiskScore(newLikelihood, newImpact),
    };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.category !== undefined) update['category'] = patch.category;
    if (patch.likelihood !== undefined) update['likelihood'] = patch.likelihood;
    if (patch.impact !== undefined) update['impact'] = patch.impact;
    if (patch.treatment !== undefined) update['treatment'] = patch.treatment;
    if ('assetId' in patch) update['asset_id'] = patch.assetId;
    const { data, error } = await this.db
      .from('risks')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toRisk(ok(data, error));
  }

  async deleteRisk(id: string): Promise<void> {
    const { error } = await this.db.from('risks').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private toRisk(row: Record<string, unknown>): Risk {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      title: row['title'] as string,
      description: row['description'] as string,
      category: row['category'] as string,
      likelihood: row['likelihood'] as Risk['likelihood'],
      impact: row['impact'] as Risk['impact'],
      riskScore: row['risk_score'] as number,
      treatment: row['treatment'] as Risk['treatment'],
      assetId: row['asset_id'] as string | null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  // ─── Risk Assessments ──────────────────────────────────────────────────────

  async listAssessments(orgId: string): Promise<RiskAssessment[]> {
    const { data, error } = await this.db
      .from('risk_assessments')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return ok(data, error).map(this.toAssessment);
  }

  async createAssessment(
    orgId: string,
    userId: string,
    data: RiskAssessmentInput,
  ): Promise<RiskAssessment> {
    const { data: row, error } = await this.db
      .from('risk_assessments')
      .insert({
        org_id: orgId,
        user_id: userId,
        type: data.type,
        title: data.title,
        scope: data.scope,
      })
      .select()
      .single();
    return this.toAssessment(ok(row, error));
  }

  async getAssessment(id: string): Promise<RiskAssessment | null> {
    const { data, error } = await this.db
      .from('risk_assessments')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toAssessment(data) : null;
  }

  async updateAssessment(id: string, patch: RiskAssessmentPatch): Promise<RiskAssessment> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.scope !== undefined) update['scope'] = patch.scope;
    if (patch.status !== undefined) update['status'] = patch.status;
    const { data, error } = await this.db
      .from('risk_assessments')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toAssessment(ok(data, error));
  }

  async deleteAssessment(id: string): Promise<void> {
    const { error } = await this.db.from('risk_assessments').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async listAssessmentItems(assessmentId: string): Promise<RiskAssessmentItem[]> {
    const { data, error } = await this.db
      .from('risk_assessment_items')
      .select('*')
      .eq('assessment_id', assessmentId)
      .order('item_score', { ascending: false });
    return ok(data, error).map(this.toAssessmentItem);
  }

  async addAssessmentItem(
    assessmentId: string,
    data: RiskAssessmentItemInput,
  ): Promise<RiskAssessmentItem> {
    const itemScore = this.computeRiskScore(data.likelihood, data.impact);
    const { data: row, error } = await this.db
      .from('risk_assessment_items')
      .insert({
        assessment_id: assessmentId,
        subject: data.subject,
        description: data.description,
        likelihood: data.likelihood,
        impact: data.impact,
        item_score: itemScore,
        mitigations: data.mitigations ?? '',
      })
      .select()
      .single();
    const item = this.toAssessmentItem(ok(row, error));
    await this.recomputeAssessmentScore(assessmentId);
    return item;
  }

  async updateAssessmentItem(
    id: string,
    patch: RiskAssessmentItemPatch,
  ): Promise<RiskAssessmentItem> {
    const existing = await this.db
      .from('risk_assessment_items')
      .select('likelihood, impact, assessment_id')
      .eq('id', id)
      .single();
    if (existing.error) throw new Error(existing.error.message);
    const newLikelihood = patch.likelihood ?? (existing.data['likelihood'] as RiskLikelihood);
    const newImpact = patch.impact ?? (existing.data['impact'] as RiskImpact);
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      item_score: this.computeRiskScore(newLikelihood, newImpact),
    };
    if (patch.subject !== undefined) update['subject'] = patch.subject;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.likelihood !== undefined) update['likelihood'] = patch.likelihood;
    if (patch.impact !== undefined) update['impact'] = patch.impact;
    if (patch.mitigations !== undefined) update['mitigations'] = patch.mitigations;
    const { data: row, error } = await this.db
      .from('risk_assessment_items')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    const item = this.toAssessmentItem(ok(row, error));
    await this.recomputeAssessmentScore(existing.data['assessment_id'] as string);
    return item;
  }

  async deleteAssessmentItem(id: string): Promise<void> {
    const { data: existing } = await this.db
      .from('risk_assessment_items')
      .select('assessment_id')
      .eq('id', id)
      .single();
    const { error } = await this.db.from('risk_assessment_items').delete().eq('id', id);
    if (error) throw new Error(error.message);
    if (existing) await this.recomputeAssessmentScore(existing['assessment_id'] as string);
  }

  private async recomputeAssessmentScore(assessmentId: string): Promise<void> {
    const { data: items } = await this.db
      .from('risk_assessment_items')
      .select('item_score')
      .eq('assessment_id', assessmentId);
    const rows = items ?? [];
    const riskScore =
      rows.length > 0
        ? Math.round(
            rows.reduce(
              (s: number, r: Record<string, unknown>) => s + (r['item_score'] as number),
              0,
            ) / rows.length,
          )
        : 0;
    await this.db
      .from('risk_assessments')
      .update({
        risk_score: riskScore,
        item_count: rows.length,
        updated_at: new Date().toISOString(),
      })
      .eq('id', assessmentId);
  }

  private toAssessment(row: Record<string, unknown>): RiskAssessment {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      type: row['type'] as AssessmentType,
      title: row['title'] as string,
      scope: row['scope'] as string,
      status: row['status'] as AssessmentStatus,
      riskScore: row['risk_score'] as number,
      itemCount: row['item_count'] as number,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  private toAssessmentItem(row: Record<string, unknown>): RiskAssessmentItem {
    return {
      id: row['id'] as string,
      assessmentId: row['assessment_id'] as string,
      subject: row['subject'] as string,
      description: row['description'] as string,
      likelihood: row['likelihood'] as RiskAssessmentItem['likelihood'],
      impact: row['impact'] as RiskAssessmentItem['impact'],
      itemScore: row['item_score'] as number,
      mitigations: row['mitigations'] as string,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  // ─── Policies ──────────────────────────────────────────────────────────────

  async listPolicies(orgId: string): Promise<Policy[]> {
    const { data, error } = await this.db
      .from('policies')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return ok(data, error).map(this.toPolicy);
  }

  async createPolicy(orgId: string, userId: string, data: PolicyInput): Promise<Policy> {
    const { data: row, error } = await this.db
      .from('policies')
      .insert({
        org_id: orgId,
        user_id: userId,
        framework_id: data.frameworkId,
        title: data.title,
        content: data.content,
        template_id: data.templateId ?? null,
      })
      .select()
      .single();
    return this.toPolicy(ok(row, error));
  }

  async getPolicy(id: string): Promise<Policy | null> {
    const { data, error } = await this.db.from('policies').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toPolicy(data) : null;
  }

  async updatePolicy(id: string, patch: PolicyPatch): Promise<Policy> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.status !== undefined) update['status'] = patch.status;
    if (patch.content !== undefined) {
      update['content'] = patch.content;
      const cur = await this.db.from('policies').select('version').eq('id', id).single();
      update['version'] = ((cur.data?.['version'] as number) ?? 1) + 1;
    }
    const { data, error } = await this.db
      .from('policies')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toPolicy(ok(data, error));
  }

  async deletePolicy(id: string): Promise<void> {
    const { error } = await this.db.from('policies').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async cloneTemplate(orgId: string, userId: string, templateId: string): Promise<Policy> {
    const { data: tmpl, error } = await this.db
      .from('policy_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    if (error || !tmpl) throw new Error('template_not_found');
    return this.createPolicy(orgId, userId, {
      frameworkId: tmpl['framework_id'] as string,
      title: tmpl['title'] as string,
      content: tmpl['content'] as string,
      templateId,
    });
  }

  async listPolicyTemplates(frameworkId?: string): Promise<PolicyTemplate[]> {
    let q = this.db.from('policy_templates').select('*').order('title');
    if (frameworkId) q = q.eq('framework_id', frameworkId);
    const { data, error } = await q;
    return ok(data, error).map((r: Record<string, unknown>) => ({
      id: r['id'] as string,
      frameworkId: r['framework_id'] as string,
      title: r['title'] as string,
      content: r['content'] as string,
      createdAt: r['created_at'] as string,
    }));
  }

  async listPolicyControls(policyId: string): Promise<PolicyControl[]> {
    const { data, error } = await this.db
      .from('policy_controls')
      .select('*')
      .eq('policy_id', policyId)
      .order('created_at');
    return ok(data, error).map(this.toPolicyControl);
  }

  async addPolicyControl(policyId: string, data: PolicyControlInput): Promise<PolicyControl> {
    const { data: row, error } = await this.db
      .from('policy_controls')
      .upsert(
        { policy_id: policyId, control_code: data.controlCode, framework_id: data.frameworkId },
        { onConflict: 'policy_id,control_code,framework_id', ignoreDuplicates: false },
      )
      .select()
      .single();
    return this.toPolicyControl(ok(row, error));
  }

  async removePolicyControl(id: string): Promise<void> {
    const { error } = await this.db.from('policy_controls').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async listPoliciesForControl(controlCode: string, frameworkId: string): Promise<Policy[]> {
    const { data, error } = await this.db
      .from('policy_controls')
      .select('policy_id')
      .eq('control_code', controlCode)
      .eq('framework_id', frameworkId);
    const policyIds = ok(data, error).map((r: Record<string, unknown>) => r['policy_id'] as string);
    if (policyIds.length === 0) return [];
    const { data: policies, error: pErr } = await this.db
      .from('policies')
      .select('*')
      .in('id', policyIds);
    return ok(policies, pErr).map(this.toPolicy);
  }

  private toPolicy(row: Record<string, unknown>): Policy {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      frameworkId: row['framework_id'] as string,
      title: row['title'] as string,
      content: row['content'] as string,
      status: row['status'] as Policy['status'],
      version: row['version'] as number,
      templateId: row['template_id'] as string | null,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  private toPolicyControl(row: Record<string, unknown>): PolicyControl {
    return {
      id: row['id'] as string,
      policyId: row['policy_id'] as string,
      controlCode: row['control_code'] as string,
      frameworkId: row['framework_id'] as string,
      createdAt: row['created_at'] as string,
    };
  }
}
