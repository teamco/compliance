import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ControlPatch,
  Framework,
  FrameworkControl,
  NotesStrategy,
  Organization,
  OrganizationInput,
  PushSubscriptionPayload,
  StandardControl,
  StandardsDocument,
  StandardsSnapshot,
  UserPrefsPayload,
  WorkflowTransition,
} from '@icore/shared';
import { DEFAULT_USER_PREFS, WORKFLOW_TRANSITIONS } from '@icore/shared';

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

  async upsertOrganization(userId: string, data: OrganizationInput): Promise<Organization> {
    const now = new Date().toISOString();
    const { data: row, error } = await this.db
      .from('org_profiles')
      .upsert(
        {
          user_id: userId,
          name: data.name,
          industry: data.industry,
          size: data.size,
          regions: data.regions,
          tech_stack: data.techStack,
          regulations: data.regulations,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      )
      .select()
      .single();
    return this.mapOrg(ok(row, error));
  }

  async getOrganization(userId: string): Promise<Organization | null> {
    const { data, error } = await this.db
      .from('org_profiles')
      .select()
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.mapOrg(data) : null;
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

  async listStandardsDocuments(userId: string): Promise<StandardsDocument[]> {
    const { data, error } = await this.db
      .from('generated_standards')
      .select()
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return (ok(data, error) as unknown[]).map((r) => this.mapDoc(r));
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
        ...(data.notification_prefs as Partial<UserPrefsPayload['notificationPrefs']> ?? {}),
      },
    };
  }

  async updateUserPrefs(userId: string, patch: Partial<UserPrefsPayload>): Promise<UserPrefsPayload> {
    const update: Record<string, unknown> = {};
    if (patch.theme !== undefined)             update['theme'] = patch.theme;
    if (patch.language !== undefined)          update['language'] = patch.language;
    if (patch.notificationPrefs !== undefined) update['notification_prefs'] = patch.notificationPrefs;

    const { error } = await this.db
      .from('profiles')
      .update(update)
      .eq('id', userId);

    if (error) throw new Error(error.message);
    return this.getUserPrefs(userId);
  }

  async savePushSubscription(userId: string, sub: PushSubscriptionPayload): Promise<{ ok: boolean }> {
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
