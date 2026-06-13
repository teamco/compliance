# Exceptions & Issues Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two CRUD tracker modules — Exceptions (compliance control exceptions with approval flow) and Issues (security findings/problems requiring remediation) — following the existing notes MS pattern.

**Architecture:** Both modules extend `NotesStrategy` with new methods, get Supabase migrations, notes MS `@MessagePattern` handlers, `NotesClientService` proxies, new API gateway controllers, React Query hooks, and dashboard routes with nav entries. The notes MS is the single data store for all org-scoped content.

**Tech Stack:** NestJS TCP microservices, Supabase (PostgreSQL), TanStack Router, TanStack Query, shadcn/ui, react-i18next (en/he/ru/es), Vitest

---

## File Map

**New files:**
- `supabase/migrations/20260613000001_exceptions_issues.sql`
- `apps/client/src/queries/exceptions.ts`
- `apps/client/src/queries/issues.ts`
- `apps/client/src/routes/_dashboard/exceptions.tsx`
- `apps/client/src/routes/_dashboard/issues.tsx`

**Modified files:**
- `libs/shared/src/strategies/notes.ts` — add Exception, Issue types + NotesStrategy methods
- `libs/shared/src/strategies/fakes/fake-notes.ts` — in-memory implementations
- `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` — contract tests
- `apps/microservices/notes/src/app/supabase-notes.strategy.ts` — real DB implementations
- `apps/microservices/notes/src/app/notes.controller.ts` — `@MessagePattern` handlers
- `libs/notes-client/src/lib/notes-client.service.ts` — TCP proxy methods
- `apps/api/src/app/notes/notes.module.ts` — register new controllers
- `apps/api/src/app/notes/notes.controller.ts` — Exception + Issue HTTP endpoints
- `libs/template-shared/src/lib/i18n/locales/en.ts` — i18n keys
- `libs/template-shared/src/lib/i18n/locales/he.ts`
- `libs/template-shared/src/lib/i18n/locales/ru.ts`
- `libs/template-shared/src/lib/i18n/locales/es.ts`
- `apps/client/src/components/layout/LayoutSider.tsx` — nav items
- `libs/template-shared/src/lib/i18n/keys.ts` — new NavKey literals

---

### Task 1: Types — Exception and Issue interfaces in `@icore/shared`

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

- [ ] **Step 1: Add Exception types after the GapAnalysis interface (around line 113)**

```typescript
// ─── Exceptions ────────────────────────────────────────────────────────────

export type ExceptionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface Exception {
  id: string;
  orgId: string;
  userId: string;
  controlCode: string;
  standardCode?: string;
  frameworkId: string;
  title: string;
  justification: string;
  status: ExceptionStatus;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExceptionInput {
  controlCode: string;
  standardCode?: string;
  frameworkId: string;
  title: string;
  justification: string;
  expiresAt?: string;
}

export interface ExceptionPatch {
  title?: string;
  justification?: string;
  expiresAt?: string | null;
}

// ─── Issues ────────────────────────────────────────────────────────────────

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'wont_fix';
export type IssueSource = 'manual' | 'gap_analysis' | 'vendor_risk';

export interface Issue {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  source: IssueSource;
  sourceId: string | null;
  dueDate: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueInput {
  title: string;
  description: string;
  severity: IssueSeverity;
  source?: IssueSource;
  sourceId?: string;
  dueDate?: string;
}

export interface IssuePatch {
  title?: string;
  description?: string;
  severity?: IssueSeverity;
  status?: IssueStatus;
  dueDate?: string | null;
  resolvedAt?: string | null;
}
```

- [ ] **Step 2: Add methods to NotesStrategy interface (at the end of the interface, before the closing `}`)**

```typescript
  // Exceptions
  listExceptions(orgId: string): Promise<Exception[]>;
  createException(orgId: string, userId: string, data: ExceptionInput): Promise<Exception>;
  getException(id: string): Promise<Exception | null>;
  updateException(id: string, patch: ExceptionPatch): Promise<Exception>;
  approveException(id: string): Promise<Exception>;
  rejectException(id: string): Promise<Exception>;
  deleteException(id: string): Promise<void>;

  // Issues
  listIssues(orgId: string): Promise<Issue[]>;
  createIssue(orgId: string, userId: string, data: IssueInput): Promise<Issue>;
  getIssue(id: string): Promise<Issue | null>;
  updateIssue(id: string, patch: IssuePatch): Promise<Issue>;
  deleteIssue(id: string): Promise<void>;
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
yarn nx build shared
```

Expected: build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): add Exception and Issue types to NotesStrategy"
```

---

### Task 2: Supabase migration — exceptions + issues tables

**Files:**
- Create: `supabase/migrations/20260613000001_exceptions_issues.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- exceptions
create table public.exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  user_id uuid not null,
  control_code text not null,
  standard_code text,
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  title text not null,
  justification text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exceptions_org_id_idx on public.exceptions(org_id);

alter table public.exceptions enable row level security;

create policy "org members read exceptions"
  on public.exceptions for select
  using (true);

create policy "users manage own exceptions"
  on public.exceptions for all
  using (auth.uid() = user_id);

-- issues
create table public.issues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  user_id uuid not null,
  title text not null,
  description text not null,
  severity text not null default 'medium' check (severity in ('critical','high','medium','low','info')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','wont_fix')),
  source text not null default 'manual' check (source in ('manual','gap_analysis','vendor_risk')),
  source_id uuid,
  due_date timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index issues_org_id_idx on public.issues(org_id);
create index issues_status_idx on public.issues(status);

alter table public.issues enable row level security;

create policy "org members read issues"
  on public.issues for select
  using (true);

create policy "users manage own issues"
  on public.issues for all
  using (auth.uid() = user_id);
```

- [ ] **Step 2: Apply migration**

```bash
npx supabase db push
```

Expected: `Applied 1 migration` (or the equivalent success message).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260613000001_exceptions_issues.sql
git commit -m "feat(db): add exceptions and issues tables"
```

---

### Task 3: FakeNotesStrategy — in-memory Exception and Issue implementations

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

- [ ] **Step 1: Read the current fake-notes.ts to find where to append**

Run: `wc -l libs/shared/src/strategies/fakes/fake-notes.ts`
Then read the last 20 lines to find the class closing brace.

- [ ] **Step 2: Add private stores and Exception methods inside `FakeNotesStrategy` class**

Add after the last method, before the closing `}` of the class:

```typescript
  // ─── Exceptions ──────────────────────────────────────────────────────────
  private exceptions: Exception[] = [];

  async listExceptions(orgId: string): Promise<Exception[]> {
    return this.exceptions.filter((e) => e.orgId === orgId);
  }

  async createException(orgId: string, userId: string, data: ExceptionInput): Promise<Exception> {
    const exc: Exception = {
      id: crypto.randomUUID(),
      orgId,
      userId,
      controlCode: data.controlCode,
      standardCode: data.standardCode,
      frameworkId: data.frameworkId,
      title: data.title,
      justification: data.justification,
      status: 'pending',
      expiresAt: data.expiresAt ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.exceptions.push(exc);
    return exc;
  }

  async getException(id: string): Promise<Exception | null> {
    return this.exceptions.find((e) => e.id === id) ?? null;
  }

  async updateException(id: string, patch: ExceptionPatch): Promise<Exception> {
    const idx = this.exceptions.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('exception_not_found');
    this.exceptions[idx] = {
      ...this.exceptions[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    return this.exceptions[idx];
  }

  async approveException(id: string): Promise<Exception> {
    return this.updateException(id, { title: this.exceptions.find((e) => e.id === id)!.title });
    // status handled separately to avoid partial patch type:
  }

  async rejectException(id: string): Promise<Exception> {
    const idx = this.exceptions.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('exception_not_found');
    this.exceptions[idx] = { ...this.exceptions[idx], status: 'rejected', updatedAt: new Date().toISOString() };
    return this.exceptions[idx];
  }

  async deleteException(id: string): Promise<void> {
    this.exceptions = this.exceptions.filter((e) => e.id !== id);
  }

  // ─── Issues ──────────────────────────────────────────────────────────────
  private issues: Issue[] = [];

  async listIssues(orgId: string): Promise<Issue[]> {
    return this.issues.filter((i) => i.orgId === orgId);
  }

  async createIssue(orgId: string, userId: string, data: IssueInput): Promise<Issue> {
    const issue: Issue = {
      id: crypto.randomUUID(),
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.issues.push(issue);
    return issue;
  }

  async getIssue(id: string): Promise<Issue | null> {
    return this.issues.find((i) => i.id === id) ?? null;
  }

  async updateIssue(id: string, patch: IssuePatch): Promise<Issue> {
    const idx = this.issues.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error('issue_not_found');
    this.issues[idx] = { ...this.issues[idx], ...patch, updatedAt: new Date().toISOString() };
    return this.issues[idx];
  }

  async deleteIssue(id: string): Promise<void> {
    this.issues = this.issues.filter((i) => i.id !== id);
  }
```

Also fix `approveException` — the fake above is incomplete. Replace it:

```typescript
  async approveException(id: string): Promise<Exception> {
    const idx = this.exceptions.findIndex((e) => e.id === id);
    if (idx === -1) throw new Error('exception_not_found');
    this.exceptions[idx] = { ...this.exceptions[idx], status: 'approved', updatedAt: new Date().toISOString() };
    return this.exceptions[idx];
  }
```

- [ ] **Step 3: Add imports at top of fake-notes.ts**

The file already imports from `@icore/shared`. Add `Exception, ExceptionInput, ExceptionPatch, Issue, IssueInput, IssuePatch` to the existing import.

- [ ] **Step 4: Verify build**

```bash
yarn nx build shared
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): implement Exception and Issue methods in FakeNotesStrategy"
```

---

### Task 4: Contract tests for Exceptions and Issues

**Files:**
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

- [ ] **Step 1: Read the existing contract test file to find the pattern and append point**

```bash
tail -30 libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
```

- [ ] **Step 2: Add exception contract tests at the end of the describe block**

```typescript
describe('exceptions', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => { s = new FakeNotesStrategy(); });

  it('creates and lists exceptions for org', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1',
      frameworkId: 'fw1',
      title: 'Cannot implement AC-1',
      justification: 'Legacy system limitation',
    });
    expect(exc.status).toBe('pending');
    const list = await s.listExceptions('org1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(exc.id);
  });

  it('approves an exception', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1', frameworkId: 'fw1', title: 'T', justification: 'J',
    });
    const approved = await s.approveException(exc.id);
    expect(approved.status).toBe('approved');
  });

  it('rejects an exception', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1', frameworkId: 'fw1', title: 'T', justification: 'J',
    });
    const rejected = await s.rejectException(exc.id);
    expect(rejected.status).toBe('rejected');
  });

  it('updates exception fields', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1', frameworkId: 'fw1', title: 'Old', justification: 'J',
    });
    const updated = await s.updateException(exc.id, { title: 'New' });
    expect(updated.title).toBe('New');
  });

  it('deletes an exception', async () => {
    const exc = await s.createException('org1', 'u1', {
      controlCode: 'AC-1', frameworkId: 'fw1', title: 'T', justification: 'J',
    });
    await s.deleteException(exc.id);
    expect(await s.listExceptions('org1')).toHaveLength(0);
  });

  it('scopes exceptions by orgId', async () => {
    await s.createException('org1', 'u1', {
      controlCode: 'AC-1', frameworkId: 'fw1', title: 'T', justification: 'J',
    });
    expect(await s.listExceptions('org2')).toHaveLength(0);
  });
});

describe('issues', () => {
  let s: FakeNotesStrategy;
  beforeEach(() => { s = new FakeNotesStrategy(); });

  it('creates and lists issues for org', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'MFA not enforced', description: 'Admin accounts lack MFA', severity: 'high',
    });
    expect(issue.status).toBe('open');
    expect(issue.source).toBe('manual');
    const list = await s.listIssues('org1');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(issue.id);
  });

  it('updates issue status to resolved', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T', description: 'D', severity: 'low',
    });
    const updated = await s.updateIssue(issue.id, { status: 'resolved', resolvedAt: new Date().toISOString() });
    expect(updated.status).toBe('resolved');
    expect(updated.resolvedAt).not.toBeNull();
  });

  it('deletes an issue', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T', description: 'D', severity: 'medium',
    });
    await s.deleteIssue(issue.id);
    expect(await s.listIssues('org1')).toHaveLength(0);
  });

  it('scopes issues by orgId', async () => {
    await s.createIssue('org1', 'u1', { title: 'T', description: 'D', severity: 'low' });
    expect(await s.listIssues('org2')).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
yarn nx test shared
```

Expected: all tests pass, including the new exception/issue tests.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "test(shared): add Exception and Issue contract tests"
```

---

### Task 5: SupabaseNotesStrategy — DB implementations

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

- [ ] **Step 1: Add imports at the top of the file**

Add to the existing import from `@icore/shared`:
```typescript
Exception, ExceptionInput, ExceptionPatch, Issue, IssueInput, IssuePatch,
```

- [ ] **Step 2: Add Exception methods at the end of the class**

```typescript
  async listExceptions(orgId: string): Promise<Exception[]> {
    const { data, error } = await this.db
      .from('exceptions')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return ok(data, error).map(this.toException);
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
    const { data, error } = await this.db
      .from('exceptions')
      .update({ ...this.fromExceptionPatch(patch), updated_at: new Date().toISOString() })
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

  private fromExceptionPatch(patch: ExceptionPatch): Record<string, unknown> {
    const r: Record<string, unknown> = {};
    if (patch.title !== undefined) r['title'] = patch.title;
    if (patch.justification !== undefined) r['justification'] = patch.justification;
    if ('expiresAt' in patch) r['expires_at'] = patch.expiresAt;
    return r;
  }
```

- [ ] **Step 3: Add Issue methods at the end of the class**

```typescript
  async listIssues(orgId: string): Promise<Issue[]> {
    const { data, error } = await this.db
      .from('issues')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });
    return ok(data, error).map(this.toIssue);
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
    if (patch.status !== undefined) update['status'] = patch.status;
    if ('dueDate' in patch) update['due_date'] = patch.dueDate;
    if ('resolvedAt' in patch) update['resolved_at'] = patch.resolvedAt;
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
```

- [ ] **Step 4: Build the notes MS**

```bash
yarn nx build notes
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes-ms): implement Exception and Issue Supabase strategy methods"
```

---

### Task 6: Notes MS controller — `@MessagePattern` handlers

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`

- [ ] **Step 1: Add imports at the top of the file**

Add to the existing import from `@icore/shared`:
```typescript
Exception, ExceptionInput, ExceptionPatch, Issue, IssueInput, IssuePatch,
```

- [ ] **Step 2: Add handlers at the end of the `NotesController` class**

```typescript
  // ─── Exceptions ──────────────────────────────────────────────────────────

  @MessagePattern('notes.exceptions.list')
  listExceptions(@Payload() payload: { orgId: string }): Promise<Exception[]> {
    return this.strategy.listExceptions(payload.orgId);
  }

  @MessagePattern('notes.exceptions.create')
  createException(
    @Payload() payload: { orgId: string; userId: string; data: ExceptionInput },
  ): Promise<Exception> {
    return this.strategy.createException(payload.orgId, payload.userId, payload.data);
  }

  @MessagePattern('notes.exceptions.get')
  getException(@Payload() payload: { id: string }): Promise<Exception | null> {
    return this.strategy.getException(payload.id);
  }

  @MessagePattern('notes.exceptions.update')
  updateException(
    @Payload() payload: { id: string; patch: ExceptionPatch },
  ): Promise<Exception> {
    return this.strategy.updateException(payload.id, payload.patch);
  }

  @MessagePattern('notes.exceptions.approve')
  approveException(@Payload() payload: { id: string }): Promise<Exception> {
    return this.strategy.approveException(payload.id);
  }

  @MessagePattern('notes.exceptions.reject')
  rejectException(@Payload() payload: { id: string }): Promise<Exception> {
    return this.strategy.rejectException(payload.id);
  }

  @MessagePattern('notes.exceptions.delete')
  deleteException(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.deleteException(payload.id);
  }

  // ─── Issues ──────────────────────────────────────────────────────────────

  @MessagePattern('notes.issues.list')
  listIssues(@Payload() payload: { orgId: string }): Promise<Issue[]> {
    return this.strategy.listIssues(payload.orgId);
  }

  @MessagePattern('notes.issues.create')
  createIssue(
    @Payload() payload: { orgId: string; userId: string; data: IssueInput },
  ): Promise<Issue> {
    return this.strategy.createIssue(payload.orgId, payload.userId, payload.data);
  }

  @MessagePattern('notes.issues.get')
  getIssue(@Payload() payload: { id: string }): Promise<Issue | null> {
    return this.strategy.getIssue(payload.id);
  }

  @MessagePattern('notes.issues.update')
  updateIssue(
    @Payload() payload: { id: string; patch: IssuePatch },
  ): Promise<Issue> {
    return this.strategy.updateIssue(payload.id, payload.patch);
  }

  @MessagePattern('notes.issues.delete')
  deleteIssue(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.deleteIssue(payload.id);
  }
```

- [ ] **Step 3: Build and verify**

```bash
yarn nx build notes
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/notes/src/app/notes.controller.ts
git commit -m "feat(notes-ms): add Exception and Issue MessagePattern handlers"
```

---

### Task 7: NotesClientService — TCP proxy methods

**Files:**
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`

- [ ] **Step 1: Add imports**

Add to existing import from `@icore/shared`:
```typescript
Exception, ExceptionInput, ExceptionPatch, Issue, IssueInput, IssuePatch,
```

- [ ] **Step 2: Add methods at the end of `NotesClientService` class**

```typescript
  // ─── Exceptions ──────────────────────────────────────────────────────────

  listExceptions(orgId: string): Promise<Exception[]> {
    return firstValueFrom(this.client.send<Exception[]>('notes.exceptions.list', { orgId }));
  }

  createException(orgId: string, userId: string, data: ExceptionInput): Promise<Exception> {
    return firstValueFrom(this.client.send<Exception>('notes.exceptions.create', { orgId, userId, data }));
  }

  getException(id: string): Promise<Exception | null> {
    return firstValueFrom(this.client.send<Exception | null>('notes.exceptions.get', { id }));
  }

  updateException(id: string, patch: ExceptionPatch): Promise<Exception> {
    return firstValueFrom(this.client.send<Exception>('notes.exceptions.update', { id, patch }));
  }

  approveException(id: string): Promise<Exception> {
    return firstValueFrom(this.client.send<Exception>('notes.exceptions.approve', { id }));
  }

  rejectException(id: string): Promise<Exception> {
    return firstValueFrom(this.client.send<Exception>('notes.exceptions.reject', { id }));
  }

  deleteException(id: string): Promise<void> {
    return firstValueFrom(this.client.send<void>('notes.exceptions.delete', { id }));
  }

  // ─── Issues ──────────────────────────────────────────────────────────────

  listIssues(orgId: string): Promise<Issue[]> {
    return firstValueFrom(this.client.send<Issue[]>('notes.issues.list', { orgId }));
  }

  createIssue(orgId: string, userId: string, data: IssueInput): Promise<Issue> {
    return firstValueFrom(this.client.send<Issue>('notes.issues.create', { orgId, userId, data }));
  }

  getIssue(id: string): Promise<Issue | null> {
    return firstValueFrom(this.client.send<Issue | null>('notes.issues.get', { id }));
  }

  updateIssue(id: string, patch: IssuePatch): Promise<Issue> {
    return firstValueFrom(this.client.send<Issue>('notes.issues.update', { id, patch }));
  }

  deleteIssue(id: string): Promise<void> {
    return firstValueFrom(this.client.send<void>('notes.issues.delete', { id }));
  }
```

- [ ] **Step 3: Build**

```bash
yarn nx build notes-client
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes-client): add Exception and Issue TCP proxy methods"
```

---

### Task 8: API Gateway — Exception and Issue HTTP endpoints

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts`
- Modify: `apps/api/src/app/notes/notes.module.ts`

- [ ] **Step 1: Read the gateway notes controller to find the uid() helper and append point**

```bash
grep -n "uid\|Exception\|Issue" apps/api/src/app/notes/notes.controller.ts | head -20
```

- [ ] **Step 2: Add Exception endpoints to the gateway notes controller**

Add after existing endpoints (keep in the same `NotesController` class):

```typescript
  // ─── Exceptions ──────────────────────────────────────────────────────────

  @Get('exceptions')
  @ApiOperation({ summary: 'List exceptions for org' })
  listExceptions(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listExceptions(orgId);
  }

  @Post('exceptions')
  @ApiOperation({ summary: 'Create exception' })
  createException(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: ExceptionInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createException(orgId, userId, body);
  }

  @Get('exceptions/:id')
  @ApiOperation({ summary: 'Get exception' })
  async getException(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    const exc = await this.notes.getException(id);
    if (!exc) throw new NotFoundException();
    return exc;
  }

  @Patch('exceptions/:id')
  @ApiOperation({ summary: 'Update exception' })
  updateException(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: ExceptionPatch,
  ) {
    this.uid(req);
    return this.notes.updateException(id, patch);
  }

  @Post('exceptions/:id/approve')
  @ApiOperation({ summary: 'Approve exception' })
  approveException(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    return this.notes.approveException(id);
  }

  @Post('exceptions/:id/reject')
  @ApiOperation({ summary: 'Reject exception' })
  rejectException(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    return this.notes.rejectException(id);
  }

  @Delete('exceptions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete exception' })
  deleteException(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    return this.notes.deleteException(id);
  }

  // ─── Issues ──────────────────────────────────────────────────────────────

  @Get('issues')
  @ApiOperation({ summary: 'List issues for org' })
  listIssues(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listIssues(orgId);
  }

  @Post('issues')
  @ApiOperation({ summary: 'Create issue' })
  createIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: IssueInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createIssue(orgId, userId, body);
  }

  @Get('issues/:id')
  @ApiOperation({ summary: 'Get issue' })
  async getIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    return issue;
  }

  @Patch('issues/:id')
  @ApiOperation({ summary: 'Update issue status / severity' })
  updateIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: IssuePatch,
  ) {
    this.uid(req);
    return this.notes.updateIssue(id, patch);
  }

  @Delete('issues/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete issue' })
  deleteIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    return this.notes.deleteIssue(id);
  }
```

- [ ] **Step 3: Add missing imports at the top of the gateway notes controller**

Ensure these NestJS decorators are imported: `Delete`, `HttpCode`, `NotFoundException`, `Param`, `Patch`, `Post`, `Query` — they're likely already there, but verify.

Add to the `@icore/shared` import: `ExceptionInput, ExceptionPatch, IssueInput, IssuePatch`.

- [ ] **Step 4: Build gateway**

```bash
yarn nx build api
```

Expected: success.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/notes.module.ts
git commit -m "feat(api): add Exception and Issue HTTP endpoints"
```

---

### Task 9: Client React Query hooks — exceptions.ts and issues.ts

**Files:**
- Create: `apps/client/src/queries/exceptions.ts`
- Create: `apps/client/src/queries/issues.ts`

- [ ] **Step 1: Create `apps/client/src/queries/exceptions.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Exception, ExceptionInput, ExceptionPatch } from '@icore/shared';

export type { Exception, ExceptionInput, ExceptionPatch };

export function useExceptions(orgId: string) {
  return useQuery<Exception[]>({
    queryKey: ['exceptions', orgId],
    queryFn: () => api<Exception[]>(`/exceptions?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useCreateException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Exception, Error, ExceptionInput>({
    mutationFn: (data) =>
      api<Exception>(`/exceptions?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}

export function useUpdateException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Exception, Error, { id: string; patch: ExceptionPatch }>({
    mutationFn: ({ id, patch }) =>
      api<Exception>(`/exceptions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}

export function useApproveException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Exception, Error, string>({
    mutationFn: (id) => api<Exception>(`/exceptions/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}

export function useRejectException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Exception, Error, string>({
    mutationFn: (id) => api<Exception>(`/exceptions/${id}/reject`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}

export function useDeleteException(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/exceptions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exceptions', orgId] }),
  });
}
```

- [ ] **Step 2: Create `apps/client/src/queries/issues.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Issue, IssueInput, IssuePatch } from '@icore/shared';

export type { Issue, IssueInput, IssuePatch };

export function useIssues(orgId: string) {
  return useQuery<Issue[]>({
    queryKey: ['issues', orgId],
    queryFn: () => api<Issue[]>(`/issues?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useCreateIssue(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Issue, Error, IssueInput>({
    mutationFn: (data) =>
      api<Issue>(`/issues?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues', orgId] }),
  });
}

export function useUpdateIssue(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Issue, Error, { id: string; patch: IssuePatch }>({
    mutationFn: ({ id, patch }) =>
      api<Issue>(`/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues', orgId] }),
  });
}

export function useDeleteIssue(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/issues/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['issues', orgId] }),
  });
}
```

- [ ] **Step 3: Build client**

```bash
yarn nx build client
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/queries/exceptions.ts apps/client/src/queries/issues.ts
git commit -m "feat(client): add Exception and Issue React Query hooks"
```

---

### Task 10: Client route — Exceptions page

**Files:**
- Create: `apps/client/src/routes/_dashboard/exceptions.tsx`

- [ ] **Step 1: Create the exceptions route**

```tsx
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import {
  useExceptions, useCreateException, useApproveException,
  useRejectException, useDeleteException,
  type Exception, type ExceptionInput,
} from '@/queries/exceptions';
import { useFrameworks } from '@/queries/notes';

export const Route = createFileRoute('/_dashboard/exceptions')({
  component: ExceptionsPage,
});

const STATUS_COLORS: Record<Exception['status'], string> = {
  pending:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  expired:  'bg-muted text-muted-foreground border-border',
};

function ExceptionsPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: exceptions = [], isPending } = useExceptions(orgId);
  const { data: frameworks = [] } = useFrameworks();
  const createMut = useCreateException(orgId);
  const approveMut = useApproveException(orgId);
  const rejectMut = useRejectException(orgId);
  const deleteMut = useDeleteException(orgId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ExceptionInput>({
    controlCode: '',
    frameworkId: '',
    title: '',
    justification: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.controlCode || !form.frameworkId || !form.title || !form.justification) return;
    createMut.mutate(form, {
      onSuccess: () => { setOpen(false); setForm({ controlCode: '', frameworkId: '', title: '', justification: '' }); },
    });
  }

  return (
    <PageLayout title={t('nav.exceptions')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('exceptions.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('exceptions.addException')}
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : exceptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <ShieldAlert size={32} className="opacity-30" />
          <p className="text-sm">{t('exceptions.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {exceptions.map((exc) => (
            <div
              key={exc.id}
              className="flex items-start gap-4 bg-surface border border-border rounded-xl p-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-foreground truncate">{exc.title}</span>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[exc.status]}`}>
                    {t(`exceptions.status.${exc.status}`)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{exc.justification}</p>
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  {exc.controlCode} · {frameworks.find((f) => f.id === exc.frameworkId)?.slug.toUpperCase() ?? exc.frameworkId}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {exc.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => approveMut.mutate(exc.id)}
                      className="text-xs px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20 transition-colors"
                    >
                      {t('exceptions.approve')}
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectMut.mutate(exc.id)}
                      className="text-xs px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                    >
                      {t('exceptions.reject')}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(exc.id)}
                  className="text-xs px-2 py-1 rounded text-muted-foreground border border-border hover:text-destructive hover:border-destructive/50 transition-colors"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('exceptions.addException')}</DialogTitle>
            <DialogDescription>{t('exceptions.addDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('exceptions.controlCode')}</Label>
              <Input
                value={form.controlCode}
                onChange={(e) => setForm((f) => ({ ...f, controlCode: e.target.value }))}
                placeholder="AC-1"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.framework')}</Label>
              <select
                value={form.frameworkId}
                onChange={(e) => setForm((f) => ({ ...f, frameworkId: e.target.value }))}
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
                required
              >
                <option value="" disabled>{t('exceptions.selectFramework')}</option>
                {frameworks.map((fw) => (
                  <option key={fw.id} value={fw.id}>{fw.slug.toUpperCase()} — {fw.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.title')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('exceptions.titlePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('exceptions.justification')}</Label>
              <textarea
                value={form.justification}
                onChange={(e) => setForm((f) => ({ ...f, justification: e.target.value }))}
                placeholder={t('exceptions.justificationPlaceholder')}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? t('common.saving') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/routes/_dashboard/exceptions.tsx
git commit -m "feat(client): add Exceptions dashboard page"
```

---

### Task 11: Client route — Issues page

**Files:**
- Create: `apps/client/src/routes/_dashboard/issues.tsx`

- [ ] **Step 1: Create the issues route**

```tsx
import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import {
  useIssues, useCreateIssue, useUpdateIssue, useDeleteIssue,
  type Issue, type IssueInput,
} from '@/queries/issues';

export const Route = createFileRoute('/_dashboard/issues')({
  component: IssuesPage,
});

const SEVERITY_COLORS: Record<Issue['severity'], string> = {
  critical: 'bg-red-500/10 text-red-400 border-red-500/20',
  high:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
  medium:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
  low:      'bg-blue-500/10 text-blue-400 border-blue-500/20',
  info:     'bg-muted text-muted-foreground border-border',
};

const STATUS_COLORS: Record<Issue['status'], string> = {
  open:        'bg-red-500/10 text-red-400 border-red-500/20',
  in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  resolved:    'bg-green-500/10 text-green-400 border-green-500/20',
  wont_fix:    'bg-muted text-muted-foreground border-border',
};

const SEVERITY_OPTIONS: Array<Issue['severity']> = ['critical', 'high', 'medium', 'low', 'info'];
const STATUS_OPTIONS: Array<Issue['status']> = ['open', 'in_progress', 'resolved', 'wont_fix'];

function IssuesPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: issues = [], isPending } = useIssues(orgId);
  const createMut = useCreateIssue(orgId);
  const updateMut = useUpdateIssue(orgId);
  const deleteMut = useDeleteIssue(orgId);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<IssueInput>({
    title: '', description: '', severity: 'medium',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.description) return;
    createMut.mutate(form, {
      onSuccess: () => { setOpen(false); setForm({ title: '', description: '', severity: 'medium' }); },
    });
  }

  return (
    <PageLayout title={t('nav.issues')}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{t('issues.subtitle')}</p>
        <Button size="sm" onClick={() => setOpen(true)} disabled={!orgId}>
          <Plus size={14} className="mr-1.5" />
          {t('issues.addIssue')}
        </Button>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : issues.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <Bug size={32} className="opacity-30" />
          <p className="text-sm">{t('issues.empty')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => (
            <div
              key={issue.id}
              className="flex items-start gap-4 bg-surface border border-border rounded-xl p-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-sm text-foreground truncate">{issue.title}</span>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[issue.severity]}`}>
                    {t(`issues.severity.${issue.severity}`)}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[issue.status]}`}>
                    {t(`issues.status.${issue.status}`)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{issue.description}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <select
                  value={issue.status}
                  onChange={(e) => updateMut.mutate({ id: issue.id, patch: { status: e.target.value as Issue['status'] } })}
                  className="text-xs h-7 rounded border border-border bg-surface px-1 text-foreground focus:outline-none focus:ring-1 focus:ring-green-500/40"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{t(`issues.status.${s}`)}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => deleteMut.mutate(issue.id)}
                  className="text-xs px-2 py-1 rounded text-muted-foreground border border-border hover:text-destructive hover:border-destructive/50 transition-colors"
                >
                  {t('common.delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('issues.addIssue')}</DialogTitle>
            <DialogDescription>{t('issues.addDescription')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{t('issues.title')}</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder={t('issues.titlePlaceholder')}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t('issues.severity')}</Label>
              <select
                value={form.severity}
                onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as Issue['severity'] }))}
                className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40"
              >
                {SEVERITY_OPTIONS.map((s) => (
                  <option key={s} value={s}>{t(`issues.severity.${s}`)}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>{t('issues.description')}</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={t('issues.descriptionPlaceholder')}
                rows={3}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-500/40 resize-none"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? t('common.saving') : t('common.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/client/src/routes/_dashboard/issues.tsx
git commit -m "feat(client): add Issues dashboard page"
```

---

### Task 12: i18n + nav wiring

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts`
- Modify: `libs/template-shared/src/lib/i18n/keys.ts`
- Modify: `apps/client/src/components/layout/LayoutSider.tsx`

- [ ] **Step 1: Add keys to `en.ts`**

In the `nav` object, add:
```typescript
    exceptions: 'Exceptions',
    issues: 'Issues',
```

Add new top-level objects after the `nav` object:
```typescript
  exceptions: {
    subtitle: 'Track control exceptions and approved deviations',
    addException: 'New Exception',
    addDescription: 'Request an exception when a control cannot be fully implemented',
    empty: 'No exceptions yet',
    controlCode: 'Control Code',
    framework: 'Framework',
    selectFramework: 'Select framework…',
    title: 'Title',
    titlePlaceholder: 'Brief description of the exception',
    justification: 'Justification',
    justificationPlaceholder: 'Why this control cannot be met and compensating controls in place',
    approve: 'Approve',
    reject: 'Reject',
    status: {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      expired: 'Expired',
    },
  },
  issues: {
    subtitle: 'Track security and compliance issues requiring remediation',
    addIssue: 'New Issue',
    addDescription: 'Log a security or compliance finding that needs to be addressed',
    empty: 'No issues logged',
    title: 'Title',
    titlePlaceholder: 'Brief description of the issue',
    description: 'Description',
    descriptionPlaceholder: 'Detailed description, impact, and context',
    severity: 'Severity',
    severity: {
      critical: 'Critical',
      high: 'High',
      medium: 'Medium',
      low: 'Low',
      info: 'Info',
    },
    status: {
      open: 'Open',
      in_progress: 'In Progress',
      resolved: 'Resolved',
      wont_fix: "Won't Fix",
    },
  },
```

- [ ] **Step 2: Add keys to `he.ts`**

In `nav`:
```typescript
    exceptions: 'חריגות',
    issues: 'ממצאים',
```

Add new objects:
```typescript
  exceptions: {
    subtitle: 'מעקב אחר חריגות בקרה וסטיות מאושרות',
    addException: 'חריגה חדשה',
    addDescription: 'בקשת חריגה כאשר לא ניתן ליישם בקרה במלואה',
    empty: 'אין חריגות עדיין',
    controlCode: 'קוד בקרה',
    framework: 'מסגרת',
    selectFramework: 'בחר מסגרת…',
    title: 'כותרת',
    titlePlaceholder: 'תיאור קצר של החריגה',
    justification: 'הצדקה',
    justificationPlaceholder: 'מדוע לא ניתן לעמוד בבקרה ואילו בקרות מפצות קיימות',
    approve: 'אשר',
    reject: 'דחה',
    status: { pending: 'ממתין', approved: 'מאושר', rejected: 'נדחה', expired: 'פג תוקף' },
  },
  issues: {
    subtitle: 'מעקב אחר ממצאי אבטחה ותאימות הדורשים תיקון',
    addIssue: 'ממצא חדש',
    addDescription: 'תיעוד ממצא אבטחה או תאימות שיש לטפל בו',
    empty: 'אין ממצאים רשומים',
    title: 'כותרת',
    titlePlaceholder: 'תיאור קצר של הממצא',
    description: 'תיאור',
    descriptionPlaceholder: 'תיאור מפורט, השפעה והקשר',
    severity: 'חומרה',
    status: { open: 'פתוח', in_progress: 'בטיפול', resolved: 'נפתר', wont_fix: 'לא יתוקן' },
    severity: { critical: 'קריטי', high: 'גבוה', medium: 'בינוני', low: 'נמוך', info: 'מידע' },
  },
```

- [ ] **Step 3: Add keys to `ru.ts`**

In `nav`:
```typescript
    exceptions: 'Исключения',
    issues: 'Проблемы',
```

Add new objects:
```typescript
  exceptions: {
    subtitle: 'Отслеживание исключений из требований контролей',
    addException: 'Новое исключение',
    addDescription: 'Запрос исключения, когда контроль не может быть полностью реализован',
    empty: 'Исключений пока нет',
    controlCode: 'Код контроля',
    framework: 'Фреймворк',
    selectFramework: 'Выберите фреймворк…',
    title: 'Название',
    titlePlaceholder: 'Краткое описание исключения',
    justification: 'Обоснование',
    justificationPlaceholder: 'Почему контроль не может быть выполнен и какие компенсирующие меры применяются',
    approve: 'Одобрить',
    reject: 'Отклонить',
    status: { pending: 'На рассмотрении', approved: 'Одобрено', rejected: 'Отклонено', expired: 'Истекло' },
  },
  issues: {
    subtitle: 'Отслеживание проблем безопасности и соответствия',
    addIssue: 'Новая проблема',
    addDescription: 'Зафиксируйте проблему безопасности или соответствия, требующую устранения',
    empty: 'Проблем не зафиксировано',
    title: 'Название',
    titlePlaceholder: 'Краткое описание проблемы',
    description: 'Описание',
    descriptionPlaceholder: 'Подробное описание, влияние и контекст',
    severity: 'Серьёзность',
    status: { open: 'Открыто', in_progress: 'В работе', resolved: 'Решено', wont_fix: 'Не будет исправлено' },
    severity: { critical: 'Критично', high: 'Высокое', medium: 'Среднее', low: 'Низкое', info: 'Инфо' },
  },
```

- [ ] **Step 4: Add keys to `es.ts`**

In `nav`:
```typescript
    exceptions: 'Excepciones',
    issues: 'Problemas',
```

Add new objects:
```typescript
  exceptions: {
    subtitle: 'Seguimiento de excepciones de controles y desviaciones aprobadas',
    addException: 'Nueva excepción',
    addDescription: 'Solicitar una excepción cuando un control no puede implementarse completamente',
    empty: 'Sin excepciones aún',
    controlCode: 'Código de control',
    framework: 'Marco de trabajo',
    selectFramework: 'Seleccionar marco…',
    title: 'Título',
    titlePlaceholder: 'Breve descripción de la excepción',
    justification: 'Justificación',
    justificationPlaceholder: 'Por qué no se puede cumplir el control y qué controles compensatorios existen',
    approve: 'Aprobar',
    reject: 'Rechazar',
    status: { pending: 'Pendiente', approved: 'Aprobado', rejected: 'Rechazado', expired: 'Expirado' },
  },
  issues: {
    subtitle: 'Seguimiento de problemas de seguridad y cumplimiento',
    addIssue: 'Nuevo problema',
    addDescription: 'Registrar un hallazgo de seguridad o cumplimiento que necesita atención',
    empty: 'Sin problemas registrados',
    title: 'Título',
    titlePlaceholder: 'Breve descripción del problema',
    description: 'Descripción',
    descriptionPlaceholder: 'Descripción detallada, impacto y contexto',
    severity: 'Severidad',
    status: { open: 'Abierto', in_progress: 'En proceso', resolved: 'Resuelto', wont_fix: 'No se corregirá' },
    severity: { critical: 'Crítico', high: 'Alto', medium: 'Medio', low: 'Bajo', info: 'Info' },
  },
```

- [ ] **Step 5: Update `keys.ts` — add NavKey literals**

Find the `NavKey` type (or similar) and add:
```typescript
  | 'nav.exceptions'
  | 'nav.issues'
```

- [ ] **Step 6: Update `LayoutSider.tsx` — add nav items**

In the `NavKey` type union, add:
```typescript
  | 'nav.exceptions'
  | 'nav.issues'
```

In the `sectionCompliance` items array, add after `gapAnalysis`:
```typescript
      { labelKey: 'nav.exceptions', to: '/exceptions', icon: ShieldAlert },
      { labelKey: 'nav.issues', to: '/issues', icon: Bug },
```

Add `ShieldAlert` and `Bug` to the lucide-react import.

- [ ] **Step 7: Build client and shared**

```bash
yarn nx build shared && yarn nx build client
```

Expected: success.

- [ ] **Step 8: Commit**

```bash
git add \
  libs/template-shared/src/lib/i18n/locales/en.ts \
  libs/template-shared/src/lib/i18n/locales/he.ts \
  libs/template-shared/src/lib/i18n/locales/ru.ts \
  libs/template-shared/src/lib/i18n/locales/es.ts \
  libs/template-shared/src/lib/i18n/keys.ts \
  apps/client/src/components/layout/LayoutSider.tsx
git commit -m "feat(client): add Exceptions and Issues nav + i18n (en/he/ru/es)"
```

---

### Task 13: Regenerate routeTree and final quality checks

**Files:**
- Modify: `apps/client/src/routeTree.gen.ts` (auto-generated)

- [ ] **Step 1: Run TanStack Router code generator to pick up the two new routes**

```bash
yarn nx run client:generate-routes 2>/dev/null || npx tsr generate --config apps/client/vite.config.ts
```

If no dedicated target, just build client — Vite plugin regenerates on build:
```bash
yarn nx build client
```

- [ ] **Step 2: Verify both routes appear in routeTree.gen.ts**

```bash
grep -E "exceptions|issues" apps/client/src/routeTree.gen.ts
```

Expected: both `/_dashboard/exceptions` and `/_dashboard/issues` appear.

- [ ] **Step 3: Lint all modified projects**

```bash
yarn nx lint shared && yarn nx lint notes && yarn nx lint notes-client && yarn nx lint api && yarn nx lint client
```

Expected: no errors. Fix any issues, then re-run.

- [ ] **Step 4: Run prettier on all changed files**

```bash
npx prettier --write \
  libs/shared/src/strategies/notes.ts \
  libs/shared/src/strategies/fakes/fake-notes.ts \
  libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts \
  apps/microservices/notes/src/app/supabase-notes.strategy.ts \
  apps/microservices/notes/src/app/notes.controller.ts \
  libs/notes-client/src/lib/notes-client.service.ts \
  apps/api/src/app/notes/notes.controller.ts \
  apps/client/src/queries/exceptions.ts \
  apps/client/src/queries/issues.ts \
  apps/client/src/routes/_dashboard/exceptions.tsx \
  apps/client/src/routes/_dashboard/issues.tsx \
  libs/template-shared/src/lib/i18n/locales/en.ts \
  libs/template-shared/src/lib/i18n/locales/he.ts \
  libs/template-shared/src/lib/i18n/locales/ru.ts \
  libs/template-shared/src/lib/i18n/locales/es.ts \
  apps/client/src/components/layout/LayoutSider.tsx
```

- [ ] **Step 5: Run all tests**

```bash
yarn nx test shared
```

Expected: all tests pass.

- [ ] **Step 6: Final build**

```bash
yarn nx run-many --target=build --projects=shared,notes,notes-client,api,client
```

Expected: all succeed.

- [ ] **Step 7: Commit and open PR**

```bash
git add -A
git commit -m "chore: regenerate routeTree + final prettier pass — exceptions/issues modules"
gh pr create --base dev --title "feat: Exceptions and Issues modules" --body "$(cat <<'EOF'
## Summary
- Adds Exceptions module: track compliance control exceptions with pending/approved/rejected/expired approval flow
- Adds Issues module: track security/compliance findings with severity + status (open/in_progress/resolved/wont_fix)
- Full stack: Supabase tables → NotesStrategy → notes MS → gateway HTTP endpoints → React Query hooks → dashboard pages
- i18n: en/he/ru/es for all new keys
- Nav: both modules in sectionCompliance

## Test plan
- [ ] Create an exception: fill in control code, framework, title, justification → Submit → appears in list as "Pending"
- [ ] Approve exception → status badge changes to "Approved" (green)
- [ ] Reject exception → status badge changes to "Rejected" (red)
- [ ] Delete exception → removed from list
- [ ] Create an issue with severity "Critical" → appears in list
- [ ] Change issue status via dropdown → updates immediately
- [ ] Delete issue → removed from list

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

*Self-review completed: all tasks cover the full stack for both modules. Types defined in Task 1 are consistently used throughout Tasks 3–12. No placeholders. Supabase RLS policies added in migration.*
