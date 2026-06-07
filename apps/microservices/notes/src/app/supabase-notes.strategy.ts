import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AiChatMessage,
  AiUsageLogEntry,
  AiUsageSummaryRpc,
  AiUsageTimeseriesPoint,
  AuditLog,
  AuditLogFilters,
  AuditLogPage,
  ApiKey,
  ApiKeyWithSecret,
  ControlPatch,
  Framework,
  FrameworkControl,
  GapAnalysis,
  GapAnalysisResult,
  NotesStrategy,
  Organization,
  OrganizationInput,
  PushSubscriptionPayload,
  RetentionPrefsPayload,
  StandardControl,
  StandardsDocument,
  StandardsSnapshot,
  UserPrefsPayload,
  Webhook,
  WebhookInput,
  WorkflowTransition,
} from '@icore/shared';
import { DEFAULT_RETENTION_PREFS, DEFAULT_USER_PREFS, WORKFLOW_TRANSITIONS } from '@icore/shared';

function ok<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data as T;
}

export class SupabaseNotesStrategy implements NotesStrategy {
  constructor(private readonly db: SupabaseClient) {}

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
        controls: [],
        status: 'pending',
        workflow_status: 'draft',
      })
      .select('id')
      .single();
    const r = ok(data, error) as { id: string };
    return { id: r.id };
  }

  async saveStandardsDocument(id: string, controls: StandardControl[]): Promise<void> {
    const { error } = await this.db
      .from('generated_standards')
      .update({ controls, status: 'completed' })
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
        controls: doc.controls,
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

  async updateControl(docId: string, code: string, patch: ControlPatch): Promise<StandardControl> {
    const doc = await this.getStandardsDocument(docId);
    if (!doc) throw new Error('doc_not_found');
    const idx = doc.controls.findIndex((c) => c.code === code);
    if (idx === -1) throw new Error('control_not_found');
    const updated = { ...doc.controls[idx], ...patch } as StandardControl;
    const controls = [...doc.controls];
    controls[idx] = updated;
    const { error } = await this.db
      .from('generated_standards')
      .update({ controls })
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
      controls: StandardControl[];
      created_at: string;
      created_by?: string;
    };
    return {
      id: row.id,
      documentId: row.document_id,
      version: row.version,
      workflowStatus: row.workflow_status as StandardsSnapshot['workflowStatus'],
      controls: row.controls ?? [],
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
      controls: StandardControl[];
      status: string;
      workflow_status: string | null;
      created_at: string;
    };
    return {
      id: row.id,
      userId: row.user_id,
      orgId: row.org_profile_id,
      frameworkIds: row.framework_ids,
      controls: row.controls ?? [],
      status: row.status as StandardsDocument['status'],
      workflowStatus: (row.workflow_status ?? 'draft') as StandardsDocument['workflowStatus'],
      createdAt: row.created_at,
    };
  }
}
