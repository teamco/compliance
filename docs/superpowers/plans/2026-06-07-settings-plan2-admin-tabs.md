# Settings Plan 2 — Admin Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 6 admin settings tabs (Audit Log, API Keys, Webhooks, Export, Retention, AI Usage) across the full stack — DB → Notes MS → Gateway → Client.

**Architecture:** Each tab follows the established pattern: Supabase table → `NotesStrategy` interface method → Notes MS TCP controller → `NotesClientService` → Gateway REST controller → TanStack Query hook → React component. Export is gateway-only (aggregates existing data). AdminModule in gateway already exists and just needs new controllers wired in.

**Tech Stack:** Supabase (postgres + RLS), NestJS TCP microservices, TanStack Query v5, React 19, shadcn/ui, Vitest, TypeScript strict.

**Scope (in):** DB tables, CRUD endpoints, read-only audit UI, API key create/list/revoke, webhook CRUD, JSON export, retention config UI, audit event emission on workflow transitions.
**Scope (out):** API key authentication middleware, webhook delivery/retry jobs, scheduled enforcement of retention policies.

---

## File Map

| File | Action | What it does |
|------|--------|-------------|
| `supabase/migrations/20260607000003_admin_settings.sql` | Create | `audit_logs`, `api_keys`, `webhooks` tables + `retention_prefs` column on `profiles` |
| `libs/shared/src/strategies/notes.ts` | Modify | Add 10 method signatures + 5 type interfaces |
| `libs/shared/src/strategies/fakes/fake-notes.ts` | Modify | In-memory implementations of all new methods |
| `libs/shared/src/strategies/__tests__/fake-notes-admin.unit.test.ts` | Create | Contract tests for new fake methods |
| `apps/microservices/notes/src/app/supabase-notes.strategy.ts` | Modify | Supabase implementations |
| `apps/microservices/notes/src/app/admin.controller.ts` | Create | TCP message pattern handlers for all admin operations |
| `apps/microservices/notes/src/app/app.module.ts` | Modify | Register `AdminController` |
| `apps/microservices/notes/src/app/__tests__/admin.controller.unit.test.ts` | Create | Unit tests for admin controller |
| `libs/notes-client/src/lib/notes-client.service.ts` | Modify | Add 10 proxy methods |
| `apps/api/src/app/admin/audit-log.controller.ts` | Create | `GET /admin/audit-log` |
| `apps/api/src/app/admin/api-keys.controller.ts` | Create | `GET/POST/DELETE /admin/api-keys` |
| `apps/api/src/app/admin/webhooks.controller.ts` | Create | `GET/POST/PATCH/DELETE /admin/webhooks` |
| `apps/api/src/app/admin/export.controller.ts` | Create | `GET /admin/export` |
| `apps/api/src/app/admin/retention.controller.ts` | Create | `GET/PATCH /admin/retention` |
| `apps/api/src/app/admin/admin.module.ts` | Modify | Wire new controllers + `NotesClientModule` |
| `apps/api/src/app/notes/notes.controller.ts` | Modify | Emit audit event after `transitionWorkflow` |
| `apps/client/src/queries/admin.ts` | Create | All TanStack Query hooks for admin tabs |
| `apps/client/src/components/settings/AuditLogTab.tsx` | Create | Paginated log table with filters |
| `apps/client/src/components/settings/ApiKeysTab.tsx` | Create | List + create dialog + revoke |
| `apps/client/src/components/settings/WebhooksTab.tsx` | Create | List + create/edit dialog + toggle |
| `apps/client/src/components/settings/ExportTab.tsx` | Create | Type picker + download button |
| `apps/client/src/components/settings/RetentionTab.tsx` | Create | Three number inputs + save |
| `apps/client/src/components/settings/AiUsageTab.tsx` | Create | Read-only AI usage summary — calls existing `/admin/ai-usage/summary` endpoint |
| `apps/client/src/routes/_dashboard/settings.tsx` | Modify | Replace `t('common.soon')` with actual tab components |
| `libs/template-shared/src/lib/i18n/locales/en.ts` | Modify | Add all admin i18n keys |
| `libs/template-shared/src/lib/i18n/locales/ru.ts` | Modify | Russian translations |
| `libs/template-shared/src/lib/i18n/locales/he.ts` | Modify | Hebrew translations |
| `libs/template-shared/src/lib/i18n/locales/es.ts` | Modify | Spanish translations |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260607000003_admin_settings.sql`

- [ ] **Step 1: Create migration file**

```sql
-- audit_logs: immutable record of significant system events
create table public.audit_logs (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  action        text        not null,
  resource_type text,
  resource_id   text,
  metadata      jsonb       not null default '{}',
  created_at    timestamptz not null default now()
);
create index audit_logs_user_created on public.audit_logs(user_id, created_at desc);
create index audit_logs_action       on public.audit_logs(action);
alter table public.audit_logs enable row level security;
-- service role writes (MS uses service role key); users read own events only
create policy "audit_logs: own select"
  on public.audit_logs for select using (auth.uid() = user_id);

-- api_keys: named tokens for programmatic access
create table public.api_keys (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  name         text        not null,
  key_hash     text        not null unique,
  key_prefix   text        not null,
  expires_at   timestamptz,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.api_keys enable row level security;
create policy "api_keys: own all"
  on public.api_keys for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- webhooks: external HTTP endpoints for event delivery
create table public.webhooks (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  url        text        not null,
  events     text[]      not null default '{}',
  secret     text        not null,
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);
alter table public.webhooks enable row level security;
create policy "webhooks: own all"
  on public.webhooks for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- retention preferences stored on profiles
alter table public.profiles
  add column if not exists retention_prefs jsonb not null default '{}';
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: migration applied, schema cache refreshed.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260607000003_admin_settings.sql
git commit -m "feat(db): audit_logs, api_keys, webhooks tables + retention_prefs column"
```

---

## Task 2: Shared Types + NotesStrategy Interface + FakeNotesStrategy

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`
- Create: `libs/shared/src/strategies/__tests__/fake-notes-admin.unit.test.ts`

- [ ] **Step 1: Add types and method signatures to `notes.ts`**

Append to `libs/shared/src/strategies/notes.ts` after the existing `AiChatMessage` section:

```typescript
// ─── Admin types ───────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogFilters {
  page?: number;   // 1-based, default 1
  limit?: number;  // default 50
  action?: string;
  from?: string;   // ISO date string
  to?: string;     // ISO date string
}

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiKey {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeyWithSecret extends ApiKey {
  fullKey: string;
}

export type WebhookEvent =
  | 'workflow.submitted'
  | 'workflow.approved'
  | 'workflow.rejected'
  | 'workflow.published'
  | 'ai.standards.generated'
  | 'ai.gap.done';

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  'workflow.submitted',
  'workflow.approved',
  'workflow.rejected',
  'workflow.published',
  'ai.standards.generated',
  'ai.gap.done',
];

export interface Webhook {
  id: string;
  userId: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  createdAt: string;
}

export interface WebhookInput {
  url: string;
  events: WebhookEvent[];
}

export interface RetentionPrefsPayload {
  auditLogDays: number;
  chatHistoryDays: number;
  notificationDays: number;
}

export const DEFAULT_RETENTION_PREFS: RetentionPrefsPayload = {
  auditLogDays: 90,
  chatHistoryDays: 365,
  notificationDays: 30,
};
```

Add to the `NotesStrategy` interface (after `clearChatHistory`):

```typescript
  // Audit log
  logAuditEvent(
    userId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  listAuditLogs(userId: string, filters?: AuditLogFilters): Promise<AuditLogPage>;

  // API keys
  createApiKey(userId: string, name: string, expiresAt?: string): Promise<ApiKeyWithSecret>;
  listApiKeys(userId: string): Promise<ApiKey[]>;
  revokeApiKey(id: string, userId: string): Promise<{ ok: boolean }>;

  // Webhooks
  createWebhook(userId: string, input: WebhookInput): Promise<Webhook>;
  listWebhooks(userId: string): Promise<Webhook[]>;
  updateWebhook(id: string, userId: string, patch: Partial<WebhookInput> & { active?: boolean }): Promise<Webhook>;
  deleteWebhook(id: string, userId: string): Promise<{ ok: boolean }>;

  // Retention
  getRetentionPrefs(userId: string): Promise<RetentionPrefsPayload>;
  updateRetentionPrefs(userId: string, patch: Partial<RetentionPrefsPayload>): Promise<RetentionPrefsPayload>;
```

- [ ] **Step 2: Write failing tests for FakeNotesStrategy**

Create `libs/shared/src/strategies/__tests__/fake-notes-admin.unit.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeNotesStrategy } from '../fakes/fake-notes';
import { DEFAULT_RETENTION_PREFS } from '../notes';

describe('FakeNotesStrategy — admin', () => {
  let fake: FakeNotesStrategy;
  const uid = 'user-1';

  beforeEach(() => { fake = new FakeNotesStrategy(); });

  it('logAuditEvent + listAuditLogs round-trip', async () => {
    await fake.logAuditEvent(uid, 'workflow.approved', 'standards_document', 'doc-1');
    const page = await fake.listAuditLogs(uid);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].action).toBe('workflow.approved');
    expect(page.total).toBe(1);
  });

  it('listAuditLogs filters by action', async () => {
    await fake.logAuditEvent(uid, 'workflow.approved');
    await fake.logAuditEvent(uid, 'workflow.rejected');
    const page = await fake.listAuditLogs(uid, { action: 'workflow.approved' });
    expect(page.items).toHaveLength(1);
  });

  it('createApiKey returns fullKey once, listApiKeys hides it', async () => {
    const created = await fake.createApiKey(uid, 'CI key');
    expect(created.fullKey).toBeTruthy();
    expect(created.keyPrefix).toBe(created.fullKey.slice(0, 12));
    const list = await fake.listApiKeys(uid);
    expect(list[0]).not.toHaveProperty('fullKey');
  });

  it('revokeApiKey sets revokedAt', async () => {
    const key = await fake.createApiKey(uid, 'test');
    await fake.revokeApiKey(key.id, uid);
    const list = await fake.listApiKeys(uid);
    expect(list[0].revokedAt).toBeTruthy();
  });

  it('createWebhook + listWebhooks + deleteWebhook', async () => {
    const wh = await fake.createWebhook(uid, { url: 'https://example.com/hook', events: ['workflow.approved'] });
    expect(wh.secret).toBeTruthy();
    expect(wh.active).toBe(true);
    let list = await fake.listWebhooks(uid);
    expect(list).toHaveLength(1);
    await fake.deleteWebhook(wh.id, uid);
    list = await fake.listWebhooks(uid);
    expect(list).toHaveLength(0);
  });

  it('updateWebhook patches active', async () => {
    const wh = await fake.createWebhook(uid, { url: 'https://x.com', events: ['workflow.submitted'] });
    await fake.updateWebhook(wh.id, uid, { active: false });
    const list = await fake.listWebhooks(uid);
    expect(list[0].active).toBe(false);
  });

  it('getRetentionPrefs returns defaults', async () => {
    const prefs = await fake.getRetentionPrefs(uid);
    expect(prefs).toEqual(DEFAULT_RETENTION_PREFS);
  });

  it('updateRetentionPrefs persists', async () => {
    await fake.updateRetentionPrefs(uid, { auditLogDays: 30 });
    const prefs = await fake.getRetentionPrefs(uid);
    expect(prefs.auditLogDays).toBe(30);
    expect(prefs.chatHistoryDays).toBe(DEFAULT_RETENTION_PREFS.chatHistoryDays);
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
yarn nx test shared --testPathPattern=fake-notes-admin
```

Expected: FAIL — methods not implemented on FakeNotesStrategy.

- [ ] **Step 4: Add imports to `fake-notes.ts`**

Add to imports at top of `libs/shared/src/strategies/fakes/fake-notes.ts`:

```typescript
import type {
  AiChatMessage,
  ApiKey,
  ApiKeyWithSecret,
  AuditLog,
  AuditLogFilters,
  AuditLogPage,
  ControlPatch,
  Framework,
  FrameworkControl,
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
} from '../notes';
import { DEFAULT_RETENTION_PREFS, DEFAULT_USER_PREFS, WORKFLOW_TRANSITIONS } from '../notes';
```

- [ ] **Step 5: Add in-memory state + implement methods in `FakeNotesStrategy`**

Add to the class fields:

```typescript
  private auditLogs = new Map<string, AuditLog[]>();          // key = userId
  private apiKeys = new Map<string, ApiKey[]>();               // key = userId
  private webhooks = new Map<string, Webhook[]>();             // key = userId
  private retentionPrefs = new Map<string, RetentionPrefsPayload>();
```

Add the method implementations (append before closing `}`):

```typescript
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
    if (from)   items = items.filter((l) => l.createdAt >= from);
    if (to)     items = items.filter((l) => l.createdAt <= to);
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
    this.webhooks.set(userId, hooks.filter((w) => w.id !== id));
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
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
yarn nx test shared --testPathPattern=fake-notes-admin
```

Expected: 8 tests pass.

- [ ] **Step 7: Commit**

```bash
git add libs/shared/src/strategies/notes.ts \
        libs/shared/src/strategies/fakes/fake-notes.ts \
        libs/shared/src/strategies/__tests__/fake-notes-admin.unit.test.ts
git commit -m "feat(shared): admin types + NotesStrategy interface + FakeNotesStrategy"
```

---

## Task 3: SupabaseNotesStrategy — Admin Methods

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

- [ ] **Step 1: Add import for crypto at top of file**

The file already imports from `@supabase/supabase-js`. Add:

```typescript
import { createHash, randomBytes } from 'node:crypto';
```

Add to the `import type` from `@icore/shared`:

```typescript
import type {
  AiChatMessage,
  ApiKey,
  ApiKeyWithSecret,
  AuditLog,
  AuditLogFilters,
  AuditLogPage,
  ControlPatch,
  Framework,
  FrameworkControl,
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
```

- [ ] **Step 2: Add helper methods and implement all admin methods**

Add the following inside the `SupabaseNotesStrategy` class, before `private mapOrg`:

```typescript
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
    if (from)   q = q.gte('created_at', from);
    if (to)     q = q.lte('created_at', to);

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
      id: string; user_id: string; name: string; key_prefix: string;
      expires_at: string | null; last_used_at: string | null;
      revoked_at: string | null; created_at: string;
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
    if (patch.url !== undefined)    update['url']    = patch.url;
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
    const { error } = await this.db
      .from('webhooks')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  }

  private mapWebhook(r: unknown): Webhook {
    const row = r as {
      id: string; user_id: string; url: string; events: string[];
      secret: string; active: boolean; created_at: string;
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
    return { ...DEFAULT_RETENTION_PREFS, ...(data.retention_prefs as Partial<RetentionPrefsPayload> ?? {}) };
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
```

- [ ] **Step 3: Build notes MS to verify no TS errors**

```bash
npx nx run notes:build
```

Expected: `webpack compiled successfully`.

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes-ms): admin strategy methods — audit log, api keys, webhooks, retention"
```

---

## Task 4: Notes MS Admin Controller

**Files:**
- Create: `apps/microservices/notes/src/app/admin.controller.ts`
- Modify: `apps/microservices/notes/src/app/app.module.ts`
- Create: `apps/microservices/notes/src/app/__tests__/admin.controller.unit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/microservices/notes/src/app/__tests__/admin.controller.unit.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { FakeNotesStrategy } from '@icore/shared';
import { AdminController } from '../admin.controller';

describe('AdminController', () => {
  let ctrl: AdminController;
  let fake: FakeNotesStrategy;
  const uid = 'user-1';

  beforeEach(() => {
    fake = new FakeNotesStrategy();
    ctrl = new AdminController(fake);
  });

  it('logAuditEvent delegates to strategy', async () => {
    await ctrl.logAuditEvent({ userId: uid, action: 'test', resourceType: undefined, resourceId: undefined, metadata: {} });
    const page = await ctrl.listAuditLogs({ userId: uid });
    expect(page.items).toHaveLength(1);
  });

  it('createApiKey returns fullKey', async () => {
    const result = await ctrl.createApiKey({ userId: uid, name: 'ci', expiresAt: undefined });
    expect(result.fullKey).toMatch(/^cpiq_/);
  });

  it('createWebhook + deleteWebhook', async () => {
    const wh = await ctrl.createWebhook({ userId: uid, input: { url: 'https://x.com', events: ['workflow.approved'] } });
    await ctrl.deleteWebhook({ id: wh.id, userId: uid });
    const list = await ctrl.listWebhooks({ userId: uid });
    expect(list).toHaveLength(0);
  });

  it('getRetentionPrefs returns defaults', async () => {
    const prefs = await ctrl.getRetentionPrefs({ userId: uid });
    expect(prefs.auditLogDays).toBe(90);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
yarn nx test notes --testPathPattern=admin.controller.unit
```

Expected: FAIL — AdminController not found.

- [ ] **Step 3: Create `admin.controller.ts`**

Create `apps/microservices/notes/src/app/admin.controller.ts`:

```typescript
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
  revokeApiKey(
    @Payload() payload: { id: string; userId: string },
  ): Promise<{ ok: boolean }> {
    return this.strategy.revokeApiKey(payload.id, payload.userId);
  }

  @MessagePattern('admin.webhooks.create')
  createWebhook(
    @Payload() payload: { userId: string; input: WebhookInput },
  ): Promise<Webhook> {
    return this.strategy.createWebhook(payload.userId, payload.input);
  }

  @MessagePattern('admin.webhooks.list')
  listWebhooks(@Payload() payload: { userId: string }): Promise<Webhook[]> {
    return this.strategy.listWebhooks(payload.userId);
  }

  @MessagePattern('admin.webhooks.update')
  updateWebhook(
    @Payload()
    payload: { id: string; userId: string; patch: Partial<WebhookInput> & { active?: boolean } },
  ): Promise<Webhook> {
    return this.strategy.updateWebhook(payload.id, payload.userId, payload.patch);
  }

  @MessagePattern('admin.webhooks.delete')
  deleteWebhook(
    @Payload() payload: { id: string; userId: string },
  ): Promise<{ ok: boolean }> {
    return this.strategy.deleteWebhook(payload.id, payload.userId);
  }

  @MessagePattern('admin.retention.get')
  getRetentionPrefs(
    @Payload() payload: { userId: string },
  ): Promise<RetentionPrefsPayload> {
    return this.strategy.getRetentionPrefs(payload.userId);
  }

  @MessagePattern('admin.retention.update')
  updateRetentionPrefs(
    @Payload() payload: { userId: string; patch: Partial<RetentionPrefsPayload> },
  ): Promise<RetentionPrefsPayload> {
    return this.strategy.updateRetentionPrefs(payload.userId, payload.patch);
  }
}
```

- [ ] **Step 4: Register in `app.module.ts`**

In `apps/microservices/notes/src/app/app.module.ts`, add import and controller:

```typescript
import { AdminController } from './admin.controller';
// ... existing imports ...

// In @Module:
controllers: [NotesController, SettingsController, ChatHistoryController, AdminController],
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
yarn nx test notes --testPathPattern=admin.controller.unit
```

Expected: 4 tests pass.

- [ ] **Step 6: Build**

```bash
npx nx run notes:build
```

Expected: `webpack compiled successfully`.

- [ ] **Step 7: Commit**

```bash
git add apps/microservices/notes/src/app/admin.controller.ts \
        apps/microservices/notes/src/app/app.module.ts \
        apps/microservices/notes/src/app/__tests__/admin.controller.unit.test.ts
git commit -m "feat(notes-ms): AdminController — TCP handlers for audit, api-keys, webhooks, retention"
```

---

## Task 5: Notes Client Service — Admin Methods

**Files:**
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`

- [ ] **Step 1: Add imports**

Add to the `import type` block at the top of `libs/notes-client/src/lib/notes-client.service.ts`:

```typescript
import type {
  AiChatMessage,
  ApiKey,
  ApiKeyWithSecret,
  AuditLogFilters,
  AuditLogPage,
  ControlPatch,
  Framework,
  FrameworkControl,
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
```

- [ ] **Step 2: Add methods**

Append to the class (before closing `}`):

```typescript
  // ─── Admin ─────────────────────────────────────────────────────────────────

  logAuditEvent(
    userId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return firstValueFrom(
      this.client.send<void>('admin.audit.log', { userId, action, resourceType, resourceId, metadata }),
    );
  }

  listAuditLogs(userId: string, filters?: AuditLogFilters): Promise<AuditLogPage> {
    return firstValueFrom(
      this.client.send<AuditLogPage>('admin.audit.list', { userId, filters }),
    );
  }

  createApiKey(userId: string, name: string, expiresAt?: string): Promise<ApiKeyWithSecret> {
    return firstValueFrom(
      this.client.send<ApiKeyWithSecret>('admin.apikeys.create', { userId, name, expiresAt }),
    );
  }

  listApiKeys(userId: string): Promise<ApiKey[]> {
    return firstValueFrom(
      this.client.send<ApiKey[]>('admin.apikeys.list', { userId }),
    );
  }

  revokeApiKey(id: string, userId: string): Promise<{ ok: boolean }> {
    return firstValueFrom(
      this.client.send<{ ok: boolean }>('admin.apikeys.revoke', { id, userId }),
    );
  }

  createWebhook(userId: string, input: WebhookInput): Promise<Webhook> {
    return firstValueFrom(
      this.client.send<Webhook>('admin.webhooks.create', { userId, input }),
    );
  }

  listWebhooks(userId: string): Promise<Webhook[]> {
    return firstValueFrom(
      this.client.send<Webhook[]>('admin.webhooks.list', { userId }),
    );
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

  updateRetentionPrefs(userId: string, patch: Partial<RetentionPrefsPayload>): Promise<RetentionPrefsPayload> {
    return firstValueFrom(
      this.client.send<RetentionPrefsPayload>('admin.retention.update', { userId, patch }),
    );
  }
```

- [ ] **Step 3: Build**

```bash
npx nx run notes:build
```

Expected: successful (notes-client is a dependency).

- [ ] **Step 4: Commit**

```bash
git add libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes-client): admin proxy methods — audit, api-keys, webhooks, retention"
```

---

## Task 6: Gateway Admin Controllers

**Files:**
- Modify: `apps/api/src/app/admin/admin.module.ts`
- Create: `apps/api/src/app/admin/audit-log.controller.ts`
- Create: `apps/api/src/app/admin/api-keys.controller.ts`
- Create: `apps/api/src/app/admin/webhooks.controller.ts`
- Create: `apps/api/src/app/admin/export.controller.ts`
- Create: `apps/api/src/app/admin/retention.controller.ts`

- [ ] **Step 1: Create `audit-log.controller.ts`**

```typescript
import { Controller, Get, Query, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { AuditLogFilters, AuditLogPage, VerifiedToken } from '@icore/shared';

interface AuthedRequest extends Request { user?: VerifiedToken; }

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/audit-log')
export class AuditLogController {
  constructor(private readonly notes: NotesClientService) {}

  @Get()
  @ApiOperation({ summary: 'List audit log events (paginated)' })
  list(
    @Req() req: AuthedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<AuditLogPage> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    const filters: AuditLogFilters = {
      page:   page   ? Number(page)  : 1,
      limit:  limit  ? Number(limit) : 50,
      action: action || undefined,
      from:   from   || undefined,
      to:     to     || undefined,
    };
    return this.notes.listAuditLogs(uid, filters);
  }
}
```

- [ ] **Step 2: Create `api-keys.controller.ts`**

```typescript
import { Body, Controller, Delete, Get, Param, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { ApiKey, ApiKeyWithSecret, VerifiedToken } from '@icore/shared';

interface AuthedRequest extends Request { user?: VerifiedToken; }

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/api-keys')
export class ApiKeysController {
  constructor(private readonly notes: NotesClientService) {}

  @Get()
  @ApiOperation({ summary: 'List API keys' })
  list(@Req() req: AuthedRequest): Promise<ApiKey[]> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.listApiKeys(uid);
  }

  @Post()
  @ApiOperation({ summary: 'Create API key — full key returned once' })
  create(
    @Req() req: AuthedRequest,
    @Body() body: { name: string; expiresAt?: string },
  ): Promise<ApiKeyWithSecret> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.createApiKey(uid, body.name, body.expiresAt);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Revoke API key' })
  revoke(@Req() req: AuthedRequest, @Param('id') id: string): Promise<{ ok: boolean }> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.revokeApiKey(id, uid);
  }
}
```

- [ ] **Step 3: Create `webhooks.controller.ts`**

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { VerifiedToken, Webhook, WebhookInput } from '@icore/shared';

interface AuthedRequest extends Request { user?: VerifiedToken; }

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/webhooks')
export class WebhooksController {
  constructor(private readonly notes: NotesClientService) {}

  @Get()
  @ApiOperation({ summary: 'List webhooks' })
  list(@Req() req: AuthedRequest): Promise<Webhook[]> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.listWebhooks(uid);
  }

  @Post()
  @ApiOperation({ summary: 'Create webhook' })
  create(@Req() req: AuthedRequest, @Body() body: WebhookInput): Promise<Webhook> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.createWebhook(uid, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update webhook (url, events, active)' })
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: Partial<WebhookInput> & { active?: boolean },
  ): Promise<Webhook> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.updateWebhook(id, uid, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete webhook' })
  remove(@Req() req: AuthedRequest, @Param('id') id: string): Promise<{ ok: boolean }> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.deleteWebhook(id, uid);
  }
}
```

- [ ] **Step 4: Create `export.controller.ts`**

```typescript
import { Controller, Get, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { VerifiedToken } from '@icore/shared';

interface AuthedRequest extends Request { user?: VerifiedToken; }

type ExportType = 'standards' | 'organization' | 'audit-log';

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/export')
export class ExportController {
  constructor(private readonly notes: NotesClientService) {}

  @Get()
  @ApiOperation({ summary: 'Export data as JSON download' })
  async export(
    @Req() req: AuthedRequest,
    @Query('type') type: ExportType = 'standards',
    @Res() res: Response,
  ): Promise<void> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();

    let data: unknown;
    const filename = `${type}-${new Date().toISOString().slice(0, 10)}.json`;

    if (type === 'standards') {
      data = await this.notes.listStandardsDocuments(uid);
    } else if (type === 'organization') {
      data = await this.notes.getOrganization(uid);
    } else {
      const page = await this.notes.listAuditLogs(uid, { limit: 1000 });
      data = page.items;
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(data, null, 2));
  }
}
```

- [ ] **Step 5: Create `retention.controller.ts`**

```typescript
import { Body, Controller, Get, Patch, Req, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { NotesClientService } from '@icore/notes-client';
import type { RetentionPrefsPayload, VerifiedToken } from '@icore/shared';

interface AuthedRequest extends Request { user?: VerifiedToken; }

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin/retention')
export class RetentionController {
  constructor(private readonly notes: NotesClientService) {}

  @Get()
  @ApiOperation({ summary: 'Get retention preferences' })
  get(@Req() req: AuthedRequest): Promise<RetentionPrefsPayload> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.getRetentionPrefs(uid);
  }

  @Patch()
  @ApiOperation({ summary: 'Update retention preferences' })
  update(
    @Req() req: AuthedRequest,
    @Body() body: Partial<RetentionPrefsPayload>,
  ): Promise<RetentionPrefsPayload> {
    const uid = req.user?.uid;
    if (!uid) throw new UnauthorizedException();
    return this.notes.updateRetentionPrefs(uid, body);
  }
}
```

- [ ] **Step 6: Update `admin.module.ts`**

Replace `apps/api/src/app/admin/admin.module.ts` with:

```typescript
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
```

- [ ] **Step 7: Build API**

```bash
npx nx run api:build
```

Expected: `webpack compiled successfully`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/app/admin/
git commit -m "feat(api): admin controllers — audit-log, api-keys, webhooks, export, retention"
```

---

## Task 7: Client Queries

**Files:**
- Create: `apps/client/src/queries/admin.ts`

- [ ] **Step 1: Create `admin.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../main';

// ─── Types (mirror shared) ──────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogPage {
  items: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface ApiKeyWithSecret extends ApiKey {
  fullKey: string;
}

export type WebhookEvent =
  | 'workflow.submitted'
  | 'workflow.approved'
  | 'workflow.rejected'
  | 'workflow.published'
  | 'ai.standards.generated'
  | 'ai.gap.done';

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'workflow.submitted':    'Workflow Submitted',
  'workflow.approved':     'Workflow Approved',
  'workflow.rejected':     'Workflow Rejected',
  'workflow.published':    'Workflow Published',
  'ai.standards.generated': 'Standards Generated',
  'ai.gap.done':           'Gap Analysis Done',
};

export interface Webhook {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  active: boolean;
  createdAt: string;
}

export interface RetentionPrefsPayload {
  auditLogDays: number;
  chatHistoryDays: number;
  notificationDays: number;
}

// ─── Audit log ──────────────────────────────────────────────────────────────

export function useAuditLog(page: number, action?: string) {
  const params = new URLSearchParams({ page: String(page), limit: '50' });
  if (action) params.set('action', action);
  return useQuery<AuditLogPage>({
    queryKey: ['admin', 'audit-log', page, action],
    queryFn: () => api<AuditLogPage>(`/admin/audit-log?${params}`),
  });
}

// ─── API keys ───────────────────────────────────────────────────────────────

export function useApiKeys() {
  return useQuery<ApiKey[]>({
    queryKey: ['admin', 'api-keys'],
    queryFn: () => api<ApiKey[]>('/admin/api-keys'),
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; expiresAt?: string }) =>
      api<ApiKeyWithSecret>('/admin/api-keys', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] }),
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean }>(`/admin/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'api-keys'] }),
  });
}

// ─── Webhooks ───────────────────────────────────────────────────────────────

export function useWebhooks() {
  return useQuery<Webhook[]>({
    queryKey: ['admin', 'webhooks'],
    queryFn: () => api<Webhook[]>('/admin/webhooks'),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url: string; events: WebhookEvent[] }) =>
      api<Webhook>('/admin/webhooks', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'webhooks'] }),
  });
}

export function useUpdateWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<{ url: string; events: WebhookEvent[]; active: boolean }> }) =>
      api<Webhook>(`/admin/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'webhooks'] }),
  });
}

export function useDeleteWebhook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<{ ok: boolean }>(`/admin/webhooks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'webhooks'] }),
  });
}

// ─── Retention ──────────────────────────────────────────────────────────────

export function useRetentionPrefs() {
  return useQuery<RetentionPrefsPayload>({
    queryKey: ['admin', 'retention'],
    queryFn: () => api<RetentionPrefsPayload>('/admin/retention'),
  });
}

export function useUpdateRetentionPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<RetentionPrefsPayload>) =>
      api<RetentionPrefsPayload>('/admin/retention', { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: (data) => qc.setQueryData(['admin', 'retention'], data),
  });
}
```

- [ ] **Step 2: Build client**

```bash
cd apps/client && npx vite build 2>&1 | tail -5
```

Expected: `✓ built in`.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/queries/admin.ts
git commit -m "feat(client): admin TanStack Query hooks — audit, api-keys, webhooks, retention"
```

---

## Task 8: AuditLogTab Component

**Files:**
- Create: `apps/client/src/components/settings/AuditLogTab.tsx`

- [ ] **Step 1: Create `AuditLogTab.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuditLog } from '../../queries/admin';

const ACTION_OPTIONS = [
  '',
  'workflow.submitted',
  'workflow.approved',
  'workflow.rejected',
  'workflow.published',
  'ai.standards.generated',
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export function AuditLogTab() {
  const { t } = useTranslation();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const { data, isPending } = useAuditLog(page, action || undefined);

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  if (isPending) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t('settings.auditLog.title')}</h2>
        <select
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          className="ml-auto rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          <option value="">{t('settings.auditLog.allActions')}</option>
          {ACTION_OPTIONS.filter(Boolean).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {data?.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.auditLog.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">{t('settings.auditLog.time')}</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">{t('settings.auditLog.action')}</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">{t('settings.auditLog.resource')}</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{formatDate(log.createdAt)}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{log.action}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {log.resourceType && <span>{log.resourceType}</span>}
                    {log.resourceId && <span className="ml-1 text-muted-foreground/60 font-mono">{log.resourceId.slice(0, 8)}…</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t('settings.auditLog.total', { count: data?.total ?? 0 })}</span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40 cursor-pointer"
            >
              ‹
            </button>
            <span className="px-2 py-1">{page} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40 cursor-pointer"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/components/settings/AuditLogTab.tsx
git commit -m "feat(client): AuditLogTab — paginated log with action filter"
```

---

## Task 9: ApiKeysTab Component

**Files:**
- Create: `apps/client/src/components/settings/ApiKeysTab.tsx`

- [ ] **Step 1: Create `ApiKeysTab.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Key, Plus, Trash2 } from 'lucide-react';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '../../queries/admin';
import type { ApiKeyWithSecret } from '../../queries/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString();
}

export function ApiKeysTab() {
  const { t } = useTranslation();
  const { data: keys, isPending } = useApiKeys();
  const { mutate: createKey, isPending: creating } = useCreateApiKey();
  const { mutate: revokeKey } = useRevokeApiKey();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [newKey, setNewKey] = useState<ApiKeyWithSecret | null>(null);

  function handleCreate() {
    if (!name.trim()) return;
    createKey(
      { name: name.trim(), expiresAt: expiresAt || undefined },
      {
        onSuccess: (key) => {
          setNewKey(key);
          setName('');
          setExpiresAt('');
          setShowForm(false);
        },
      },
    );
  }

  if (isPending) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="max-w-2xl space-y-6">
      {newKey && (
        <div className="rounded-md border border-green-500/30 bg-green-500/5 px-4 py-3">
          <p className="mb-1 text-xs font-semibold text-green-500">{t('settings.apiKeys.copyWarning')}</p>
          <code className="block break-all rounded bg-background px-2 py-1.5 text-xs font-mono text-foreground border border-border">
            {newKey.fullKey}
          </code>
          <button
            type="button"
            onClick={() => { void navigator.clipboard.writeText(newKey.fullKey); }}
            className="mt-2 text-xs text-green-500 hover:text-green-400 cursor-pointer"
          >
            {t('common.copy')}
          </button>
          <button
            type="button"
            onClick={() => setNewKey(null)}
            className="ml-4 mt-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {t('common.dismiss')}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t('settings.apiKeys.title')}</h2>
        <Button size="sm" onClick={() => setShowForm((v) => !v)} className="gap-1.5">
          <Plus size={13} />
          {t('settings.apiKeys.create')}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-md border border-border p-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">{t('settings.apiKeys.name')}</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('settings.apiKeys.namePlaceholder')}
              className="text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">{t('settings.apiKeys.expiresAt')}</label>
            <Input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={!name.trim() || creating}>
              {creating ? t('common.saving') : t('common.create')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {keys?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.apiKeys.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          {keys?.map((key) => (
            <div
              key={key.id}
              className={[
                'flex items-center gap-3 px-4 py-3 border-b border-border last:border-0',
                key.revokedAt ? 'opacity-50' : '',
              ].join(' ')}
            >
              <Key size={14} className="shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{key.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{key.keyPrefix}••••••••</p>
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0">
                <p>{t('settings.apiKeys.created')} {formatDate(key.createdAt)}</p>
                {key.expiresAt && <p>{t('settings.apiKeys.expires')} {formatDate(key.expiresAt)}</p>}
                {key.revokedAt && <p className="text-red-400">{t('settings.apiKeys.revoked')}</p>}
              </div>
              {!key.revokedAt && (
                <button
                  type="button"
                  onClick={() => revokeKey(key.id)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground/50 hover:text-red-400 transition-colors cursor-pointer"
                  title={t('settings.apiKeys.revoke')}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/components/settings/ApiKeysTab.tsx
git commit -m "feat(client): ApiKeysTab — create/list/revoke with one-time key display"
```

---

## Task 10: WebhooksTab Component

**Files:**
- Create: `apps/client/src/components/settings/WebhooksTab.tsx`

- [ ] **Step 1: Create `WebhooksTab.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Zap } from 'lucide-react';
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  WEBHOOK_EVENT_LABELS,
} from '../../queries/admin';
import type { WebhookEvent } from '../../queries/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const ALL_EVENTS = Object.keys(WEBHOOK_EVENT_LABELS) as WebhookEvent[];

export function WebhooksTab() {
  const { t } = useTranslation();
  const { data: webhooks, isPending } = useWebhooks();
  const { mutate: createWebhook, isPending: creating } = useCreateWebhook();
  const { mutate: updateWebhook } = useUpdateWebhook();
  const { mutate: deleteWebhook } = useDeleteWebhook();

  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>([]);

  function toggleEvent(ev: WebhookEvent) {
    setSelectedEvents((prev) =>
      prev.includes(ev) ? prev.filter((e) => e !== ev) : [...prev, ev],
    );
  }

  function handleCreate() {
    if (!url.trim() || selectedEvents.length === 0) return;
    createWebhook(
      { url: url.trim(), events: selectedEvents },
      {
        onSuccess: () => {
          setUrl('');
          setSelectedEvents([]);
          setShowForm(false);
        },
      },
    );
  }

  if (isPending) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t('settings.webhooks.title')}</h2>
        <Button size="sm" onClick={() => setShowForm((v) => !v)} className="gap-1.5">
          <Plus size={13} />
          {t('settings.webhooks.add')}
        </Button>
      </div>

      {showForm && (
        <div className="rounded-md border border-border p-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground">{t('settings.webhooks.url')}</label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhook"
              className="text-xs font-mono"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-foreground">{t('settings.webhooks.events')}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedEvents.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="h-3.5 w-3.5 accent-green-500"
                  />
                  {WEBHOOK_EVENT_LABELS[ev]}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={!url.trim() || selectedEvents.length === 0 || creating}
            >
              {creating ? t('common.saving') : t('common.create')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {webhooks?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('settings.webhooks.empty')}</p>
      ) : (
        <div className="space-y-2">
          {webhooks?.map((wh) => (
            <div key={wh.id} className="rounded-md border border-border px-4 py-3">
              <div className="flex items-start gap-3">
                <Zap size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-foreground break-all">{wh.url}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {wh.events.map((ev) => (
                      <span
                        key={ev}
                        className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono"
                      >
                        {ev}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground/60 font-mono">
                    secret: {wh.secret.slice(0, 8)}••••
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={wh.active}
                    onClick={() => updateWebhook({ id: wh.id, patch: { active: !wh.active } })}
                    className={[
                      'relative h-5 w-9 rounded-full transition-colors cursor-pointer',
                      wh.active ? 'bg-green-500' : 'bg-muted',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'absolute left-0 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                        wh.active ? 'translate-x-[18px]' : 'translate-x-0.5',
                      ].join(' ')}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteWebhook(wh.id)}
                    className="rounded-md p-1 text-muted-foreground/50 hover:text-red-400 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/components/settings/WebhooksTab.tsx
git commit -m "feat(client): WebhooksTab — create/list/toggle/delete with event selector"
```

---

## Task 11: ExportTab + RetentionTab Components

**Files:**
- Create: `apps/client/src/components/settings/ExportTab.tsx`
- Create: `apps/client/src/components/settings/RetentionTab.tsx`

- [ ] **Step 1: Create `ExportTab.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@icore/template-shared';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

type ExportType = 'standards' | 'organization' | 'audit-log';

const EXPORT_OPTIONS: { value: ExportType; labelKey: string; descKey: string }[] = [
  { value: 'standards',     labelKey: 'settings.export.standards',    descKey: 'settings.export.standardsDesc' },
  { value: 'organization',  labelKey: 'settings.export.organization', descKey: 'settings.export.organizationDesc' },
  { value: 'audit-log',     labelKey: 'settings.export.auditLog',     descKey: 'settings.export.auditLogDesc' },
];

export function ExportTab() {
  const { t } = useTranslation();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [selected, setSelected] = useState<ExportType>('standards');
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/export?type=${selected}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      if (!res.ok) throw new Error('export_failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selected}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="mb-1 text-sm font-semibold text-foreground">{t('settings.export.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('settings.export.subtitle')}</p>
      </div>

      <div className="space-y-2">
        {EXPORT_OPTIONS.map(({ value, labelKey, descKey }) => (
          <label
            key={value}
            className={[
              'flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-colors',
              selected === value ? 'border-green-500/50 bg-green-500/5' : 'border-border hover:border-border/80',
            ].join(' ')}
          >
            <input
              type="radio"
              name="export-type"
              value={value}
              checked={selected === value}
              onChange={() => setSelected(value)}
              className="mt-0.5 accent-green-500"
            />
            <div>
              <p className="text-sm font-medium text-foreground">{t(labelKey)}</p>
              <p className="text-xs text-muted-foreground">{t(descKey)}</p>
            </div>
          </label>
        ))}
      </div>

      <Button onClick={() => void handleExport()} disabled={loading} className="gap-2">
        <Download size={14} />
        {loading ? t('common.loading') : t('settings.export.download')}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Create `RetentionTab.tsx`**

```tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRetentionPrefs, useUpdateRetentionPrefs } from '../../queries/admin';
import type { RetentionPrefsPayload } from '../../queries/admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function RetentionTab() {
  const { t } = useTranslation();
  const { data: prefs, isPending } = useRetentionPrefs();
  const { mutate: updatePrefs, isPending: saving } = useUpdateRetentionPrefs();

  const [form, setForm] = useState<RetentionPrefsPayload>({
    auditLogDays: 90,
    chatHistoryDays: 365,
    notificationDays: 30,
  });

  useEffect(() => {
    if (prefs) setForm(prefs);
  }, [prefs]);

  function handleChange(key: keyof RetentionPrefsPayload, value: string) {
    const num = Math.max(1, parseInt(value, 10) || 1);
    setForm((prev) => ({ ...prev, [key]: num }));
  }

  function handleSave() {
    updatePrefs(form);
  }

  if (isPending) return <div className="text-sm text-muted-foreground">{t('common.loading')}</div>;

  const fields: { key: keyof RetentionPrefsPayload; labelKey: string; descKey: string }[] = [
    { key: 'auditLogDays',      labelKey: 'settings.retention.auditLog',      descKey: 'settings.retention.auditLogDesc' },
    { key: 'chatHistoryDays',   labelKey: 'settings.retention.chatHistory',   descKey: 'settings.retention.chatHistoryDesc' },
    { key: 'notificationDays',  labelKey: 'settings.retention.notifications', descKey: 'settings.retention.notificationsDesc' },
  ];

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h2 className="mb-1 text-sm font-semibold text-foreground">{t('settings.retention.title')}</h2>
        <p className="text-xs text-muted-foreground">{t('settings.retention.subtitle')}</p>
      </div>

      <div className="space-y-4">
        {fields.map(({ key, labelKey, descKey }) => (
          <div key={key} className="flex items-center justify-between rounded-md border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium text-foreground">{t(labelKey)}</p>
              <p className="text-xs text-muted-foreground">{t(descKey)}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Input
                type="number"
                min={1}
                value={form[key]}
                onChange={(e) => handleChange(key, e.target.value)}
                className="w-20 text-xs text-right"
              />
              <span className="text-xs text-muted-foreground">{t('settings.retention.days')}</span>
            </div>
          </div>
        ))}
      </div>

      <Button onClick={handleSave} disabled={saving}>
        {saving ? t('common.saving') : t('common.save')}
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Build client**

```bash
cd apps/client && npx vite build 2>&1 | tail -5
```

Expected: `✓ built in`.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/components/settings/ExportTab.tsx \
        apps/client/src/components/settings/RetentionTab.tsx
git commit -m "feat(client): ExportTab + RetentionTab components"
```

---

## Task 12: AiUsageTab Component

**Files:**
- Create: `apps/client/src/components/settings/AiUsageTab.tsx`

Gateway endpoint `GET /admin/ai-usage/summary` already exists (`AdminAiUsageController`). No new backend. Tab is read-only — just fetches and displays the summary.

- [ ] **Step 1: Add `useAiUsageSummary` hook to `admin.ts`**

Append to `apps/client/src/queries/admin.ts`:

```typescript
// ─── AI Usage ───────────────────────────────────────────────────────────────

export interface AiUsageSummary {
  total_calls: number;
  total_tokens: number;
  total_cost_usd: number;
  by_operation: { operation: string; calls: number; tokens: number }[];
  users: { userId: string; calls: number; tokens: number }[];
}

export type AiUsageRange = '24h' | '7d' | '30d' | '90d';

export function useAiUsageSummary(range: AiUsageRange = '7d') {
  return useQuery<AiUsageSummary>({
    queryKey: ['admin', 'ai-usage', range],
    queryFn: () => api<AiUsageSummary>(`/admin/ai-usage/summary?range=${range}`),
  });
}
```

- [ ] **Step 2: Create `AiUsageTab.tsx`**

Create `apps/client/src/components/settings/AiUsageTab.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAiUsageSummary } from '../../queries/admin';
import type { AiUsageRange } from '../../queries/admin';

const RANGES: { value: AiUsageRange; label: string }[] = [
  { value: '24h', label: '24h' },
  { value: '7d',  label: '7d' },
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
];

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}

export function AiUsageTab() {
  const { t } = useTranslation();
  const [range, setRange] = useState<AiUsageRange>('7d');
  const { data, isPending } = useAiUsageSummary(range);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{t('settings.aiUsage.title')}</h2>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              className={[
                'rounded px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer',
                range === r.value
                  ? 'bg-green-500 text-white'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {isPending ? (
        <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t('settings.aiUsage.calls')}  value={data?.total_calls ?? 0} />
            <StatCard label={t('settings.aiUsage.tokens')} value={(data?.total_tokens ?? 0).toLocaleString()} />
            <StatCard label={t('settings.aiUsage.cost')}   value={`$${(data?.total_cost_usd ?? 0).toFixed(4)}`} />
          </div>

          {(data?.by_operation?.length ?? 0) > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-foreground">{t('settings.aiUsage.byOperation')}</p>
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground uppercase tracking-wider">{t('settings.aiUsage.operation')}</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wider">{t('settings.aiUsage.calls')}</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground uppercase tracking-wider">{t('settings.aiUsage.tokens')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.by_operation.map((row) => (
                      <tr key={row.operation} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-mono text-foreground">{row.operation}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.calls}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{row.tokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(data?.by_operation?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">{t('settings.aiUsage.empty')}</p>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build client**

```bash
cd apps/client && npx vite build 2>&1 | tail -5
```

Expected: `✓ built in`.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/queries/admin.ts \
        apps/client/src/components/settings/AiUsageTab.tsx
git commit -m "feat(client): AiUsageTab — read-only AI usage summary with range picker"
```

---

## Task 13: Wire Settings Route + i18n Keys

**Files:**
- Modify: `apps/client/src/routes/_dashboard/settings.tsx`
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts`

- [ ] **Step 1: Update `settings.tsx` — replace placeholder with actual components**

In `apps/client/src/routes/_dashboard/settings.tsx`, replace the full file with:

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@icore/template-shared';
import { AppearanceTab } from '../../components/settings/AppearanceTab';
import { NotificationTab } from '../../components/settings/NotificationTab';
import { AuditLogTab } from '../../components/settings/AuditLogTab';
import { ApiKeysTab } from '../../components/settings/ApiKeysTab';
import { WebhooksTab } from '../../components/settings/WebhooksTab';
import { ExportTab } from '../../components/settings/ExportTab';
import { RetentionTab } from '../../components/settings/RetentionTab';
import { AiUsageTab } from '../../components/settings/AiUsageTab';

function SettingsPage() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();

  const [activeTab, setActiveTab] = useState<string>(() => {
    const hash = window.location.hash.slice(1);
    return hash || 'appearance';
  });

  function switchTab(tab: string) {
    setActiveTab(tab);
    history.replaceState(null, '', `/settings#${tab}`);
  }

  const tabs = [
    { id: 'appearance',   label: t('settings.tabs.appearance') },
    { id: 'notification', label: t('settings.tabs.notification') },
    ...(isAdmin
      ? [
          { id: 'audit-log', label: t('settings.tabs.auditLog') },
          { id: 'api-keys',  label: t('settings.tabs.apiKeys') },
          { id: 'webhooks',  label: t('settings.tabs.webhooks') },
          { id: 'export',    label: t('settings.tabs.export') },
          { id: 'retention', label: t('settings.tabs.retention') },
          { id: 'ai-usage',  label: t('settings.tabs.aiUsage') },
        ]
      : []),
  ];

  return (
    <div className="p-4 md:p-6">
      <h1 className="mb-6 text-2xl font-bold text-foreground">{t('settings.title')}</h1>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchTab(tab.id)}
            className={[
              '-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors cursor-pointer',
              activeTab === tab.id
                ? 'border-green-500 text-green-500'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'appearance'   && <AppearanceTab />}
      {activeTab === 'notification' && <NotificationTab />}
      {activeTab === 'audit-log'    && <AuditLogTab />}
      {activeTab === 'api-keys'     && <ApiKeysTab />}
      {activeTab === 'webhooks'     && <WebhooksTab />}
      {activeTab === 'export'       && <ExportTab />}
      {activeTab === 'retention'    && <RetentionTab />}
      {activeTab === 'ai-usage'     && <AiUsageTab />}
    </div>
  );
}

export const Route = createFileRoute('/_dashboard/settings')({
  component: SettingsPage,
});
```

- [ ] **Step 2: Add i18n keys to `en.ts`**

In `libs/template-shared/src/lib/i18n/locales/en.ts`, find the `settings:` block and add the following sections after `notifications`:

```typescript
    auditLog: {
      title: 'Audit Log',
      allActions: 'All Actions',
      empty: 'No events recorded yet.',
      time: 'Time',
      action: 'Action',
      resource: 'Resource',
      total: '{{count}} events',
    },
    apiKeys: {
      title: 'API Keys',
      create: 'New Key',
      name: 'Key name',
      namePlaceholder: 'e.g. CI / CD pipeline',
      expiresAt: 'Expires (optional)',
      empty: 'No API keys yet.',
      created: 'Created',
      expires: 'Expires',
      revoked: 'Revoked',
      revoke: 'Revoke',
      copyWarning: 'Copy this key — it will not be shown again.',
    },
    webhooks: {
      title: 'Webhooks',
      add: 'Add Webhook',
      url: 'Endpoint URL',
      events: 'Subscribe to events',
      empty: 'No webhooks configured.',
    },
    export: {
      title: 'Export Data',
      subtitle: 'Download your data as JSON.',
      standards: 'Standards Documents',
      standardsDesc: 'All generated standards and controls.',
      organization: 'Organization Profile',
      organizationDesc: 'Your organization details.',
      auditLog: 'Audit Log',
      auditLogDesc: 'Last 1000 audit events.',
      download: 'Download JSON',
    },
    retention: {
      title: 'Data Retention',
      subtitle: 'Configure how long data is kept. Enforcement requires a scheduled job (not yet active).',
      auditLog: 'Audit log',
      auditLogDesc: 'How long to retain audit events.',
      chatHistory: 'Chat history',
      chatHistoryDesc: 'How long to retain AI assistant messages.',
      notifications: 'Notifications',
      notificationsDesc: 'How long to retain in-app notifications.',
      days: 'days',
    },
    aiUsage: {
      title: 'AI Usage',
      calls: 'Calls',
      tokens: 'Tokens',
      cost: 'Est. Cost',
      byOperation: 'By Operation',
      operation: 'Operation',
      empty: 'No AI usage data for this period.',
    },
```

Also ensure `common` has these keys (add if missing):

```typescript
    copy: 'Copy',
    dismiss: 'Dismiss',
    create: 'Create',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
```

- [ ] **Step 3: Add same keys to `ru.ts`**

In `libs/template-shared/src/lib/i18n/locales/ru.ts`, add Russian translations:

```typescript
    auditLog: {
      title: 'Журнал аудита',
      allActions: 'Все действия',
      empty: 'Событий ещё нет.',
      time: 'Время',
      action: 'Действие',
      resource: 'Ресурс',
      total: '{{count}} событий',
    },
    apiKeys: {
      title: 'API ключи',
      create: 'Новый ключ',
      name: 'Название',
      namePlaceholder: 'например, CI/CD pipeline',
      expiresAt: 'Истекает (необязательно)',
      empty: 'API ключей пока нет.',
      created: 'Создан',
      expires: 'Истекает',
      revoked: 'Отозван',
      revoke: 'Отозвать',
      copyWarning: 'Скопируйте ключ — он больше не будет показан.',
    },
    webhooks: {
      title: 'Вебхуки',
      add: 'Добавить вебхук',
      url: 'URL эндпоинта',
      events: 'Подписаться на события',
      empty: 'Вебхуки не настроены.',
    },
    export: {
      title: 'Экспорт данных',
      subtitle: 'Скачать данные в формате JSON.',
      standards: 'Документы стандартов',
      standardsDesc: 'Все сгенерированные стандарты и контроли.',
      organization: 'Профиль организации',
      organizationDesc: 'Данные вашей организации.',
      auditLog: 'Журнал аудита',
      auditLogDesc: 'Последние 1000 событий аудита.',
      download: 'Скачать JSON',
    },
    retention: {
      title: 'Хранение данных',
      subtitle: 'Настройте срок хранения данных.',
      auditLog: 'Журнал аудита',
      auditLogDesc: 'Срок хранения событий аудита.',
      chatHistory: 'История чата',
      chatHistoryDesc: 'Срок хранения сообщений ИИ-ассистента.',
      notifications: 'Уведомления',
      notificationsDesc: 'Срок хранения внутренних уведомлений.',
      days: 'дней',
    },
```

- [ ] **Step 4: Add same keys to `he.ts`**

In `libs/template-shared/src/lib/i18n/locales/he.ts`, add Hebrew translations:

```typescript
    auditLog: {
      title: 'יומן ביקורת',
      allActions: 'כל הפעולות',
      empty: 'אין אירועים עדיין.',
      time: 'זמן',
      action: 'פעולה',
      resource: 'משאב',
      total: '{{count}} אירועים',
    },
    apiKeys: {
      title: 'מפתחות API',
      create: 'מפתח חדש',
      name: 'שם המפתח',
      namePlaceholder: 'למשל, CI/CD pipeline',
      expiresAt: 'תפוגה (אופציונלי)',
      empty: 'אין מפתחות API עדיין.',
      created: 'נוצר',
      expires: 'תפוגה',
      revoked: 'בוטל',
      revoke: 'בטל',
      copyWarning: 'העתק את המפתח — הוא לא יוצג שוב.',
    },
    webhooks: {
      title: 'ווב-הוקים',
      add: 'הוסף ווב-הוק',
      url: 'כתובת URL',
      events: 'הירשם לאירועים',
      empty: 'לא הוגדרו ווב-הוקים.',
    },
    export: {
      title: 'ייצוא נתונים',
      subtitle: 'הורד נתונים כ-JSON.',
      standards: 'מסמכי תקנים',
      standardsDesc: 'כל התקנים שנוצרו.',
      organization: 'פרופיל ארגון',
      organizationDesc: 'פרטי הארגון שלך.',
      auditLog: 'יומן ביקורת',
      auditLogDesc: '1000 האירועים האחרונים.',
      download: 'הורד JSON',
    },
    retention: {
      title: 'שמירת נתונים',
      subtitle: 'הגדר כמה זמן לשמור נתונים.',
      auditLog: 'יומן ביקורת',
      auditLogDesc: 'משך שמירת אירועי ביקורת.',
      chatHistory: 'היסטוריית צ\'אט',
      chatHistoryDesc: 'משך שמירת הודעות.',
      notifications: 'התראות',
      notificationsDesc: 'משך שמירת התראות.',
      days: 'ימים',
    },
```

- [ ] **Step 5: Add same keys to `es.ts`**

In `libs/template-shared/src/lib/i18n/locales/es.ts`, add Spanish translations:

```typescript
    auditLog: {
      title: 'Registro de auditoría',
      allActions: 'Todas las acciones',
      empty: 'Aún no hay eventos.',
      time: 'Hora',
      action: 'Acción',
      resource: 'Recurso',
      total: '{{count}} eventos',
    },
    apiKeys: {
      title: 'Claves API',
      create: 'Nueva clave',
      name: 'Nombre',
      namePlaceholder: 'p.ej. CI/CD pipeline',
      expiresAt: 'Expira (opcional)',
      empty: 'No hay claves API aún.',
      created: 'Creada',
      expires: 'Expira',
      revoked: 'Revocada',
      revoke: 'Revocar',
      copyWarning: 'Copia la clave — no se mostrará de nuevo.',
    },
    webhooks: {
      title: 'Webhooks',
      add: 'Agregar webhook',
      url: 'URL del endpoint',
      events: 'Suscribirse a eventos',
      empty: 'No hay webhooks configurados.',
    },
    export: {
      title: 'Exportar datos',
      subtitle: 'Descarga tus datos en JSON.',
      standards: 'Documentos de estándares',
      standardsDesc: 'Todos los estándares generados.',
      organization: 'Perfil de organización',
      organizationDesc: 'Detalles de tu organización.',
      auditLog: 'Registro de auditoría',
      auditLogDesc: 'Últimos 1000 eventos.',
      download: 'Descargar JSON',
    },
    retention: {
      title: 'Retención de datos',
      subtitle: 'Configura cuánto tiempo se conservan los datos.',
      auditLog: 'Registro de auditoría',
      auditLogDesc: 'Duración de retención de eventos.',
      chatHistory: 'Historial de chat',
      chatHistoryDesc: 'Duración de retención de mensajes.',
      notifications: 'Notificaciones',
      notificationsDesc: 'Duración de retención de notificaciones.',
      days: 'días',
    },
```

- [ ] **Step 6: Build client**

```bash
cd apps/client && npx vite build 2>&1 | tail -5
```

Expected: `✓ built in`.

- [ ] **Step 7: Commit**

```bash
git add apps/client/src/routes/_dashboard/settings.tsx \
        libs/template-shared/src/lib/i18n/locales/en.ts \
        libs/template-shared/src/lib/i18n/locales/ru.ts \
        libs/template-shared/src/lib/i18n/locales/he.ts \
        libs/template-shared/src/lib/i18n/locales/es.ts
git commit -m "feat(client): wire admin settings tabs + i18n keys for all 4 locales"
```

---

## Task 14: Audit Event Emission at Workflow Transitions

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts`

- [ ] **Step 1: Make `transitionWorkflow` async and emit audit event**

In `apps/api/src/app/notes/notes.controller.ts`, find the `transitionWorkflow` method and replace it:

```typescript
  @Patch('standards/:id/workflow')
  // ... existing decorators stay ...
  async transitionWorkflow(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { transition: WorkflowTransition },
  ): Promise<StandardsDocument> {
    const uid = req.user?.uid;
    const result = await this.notes.transitionWorkflow(id, body.transition);
    if (uid) {
      void this.notes.logAuditEvent(
        uid,
        `workflow.${body.transition}`,
        'standards_document',
        id,
      );
    }
    return result;
  }
```

Note: the existing signature does not take `@Req()`. You need to add it. Also add `VerifiedToken` to the imports from `@icore/shared` if not already there.

- [ ] **Step 2: Build API**

```bash
npx nx run api:build
```

Expected: `webpack compiled successfully`.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts
git commit -m "feat(api): emit audit event on workflow transitions"
```

---

## Self-Review

**Spec coverage:**
- ✅ Audit Log: migration, strategy, controller, gateway, client component, i18n
- ✅ API Keys: migration, strategy (with crypto hash), controller, gateway, client component, i18n
- ✅ Webhooks: migration, strategy, controller, gateway, client component, i18n
- ✅ Export: gateway controller, client component, i18n (no new DB)
- ✅ Retention: migration (profile column), strategy, controller, gateway, client component, i18n
- ✅ Audit emission: workflow transitions
- ✅ AI Usage: client component + hook — reads existing `GET /admin/ai-usage/summary`, no new backend

**Placeholder scan:** No TBD/TODO present.

**Type consistency:**
- `WebhookEvent` type used consistently across `notes.ts`, `fake-notes.ts`, `supabase-notes.strategy.ts`, `notes-client.service.ts`, `webhooks.controller.ts`, `admin.ts (client)`, `WebhooksTab.tsx`
- `ApiKeyWithSecret extends ApiKey` — consistent in all layers
- `AuditLogPage` shape `{ items, total, page, limit }` — consistent in all layers
- `RetentionPrefsPayload` keys `auditLogDays / chatHistoryDays / notificationDays` — consistent in all layers
