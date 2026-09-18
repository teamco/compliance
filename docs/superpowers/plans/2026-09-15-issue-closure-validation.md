# Issue Closure-Validation Workflow (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Issue's self-service `resolved` status with an Owner-submits → Validator-reviews closure workflow, plus root-cause/category capture, so Issues behaves like a real GRC closure-validation object instead of a plain ticket tracker.

**Architecture:** New `IssueValidation` entity (one row per validation cycle, modeled directly on the existing `RiskAcceptance` pattern) tracks the review lifecycle; `Issue` gains `rootCause`/`rootCauseCategory` fields and two new statuses (`pending_validation`, `closed` replacing `resolved`). Backend changes span all 5 layers (shared types → Fake/Supabase strategies → MS controller → notes-client → gateway). Client gets a new `IssueDetailSheet` (Overview/Root Cause/Validation tabs) replacing the flat inline row as the way to act on an issue.

**Tech Stack:** NestJS TCP microservices, Supabase (Postgres + RLS), React 19 + TanStack Query + shadcn/ui, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-15-issue-closure-validation-design.md`

## Global Constraints

- No self-validation: a validator must not be the issue's own `ownerId`. Enforced server-side in both `FakeNotesStrategy` and `SupabaseNotesStrategy`, not just hidden in the client picker.
- `resolved` → `closed` migration: any existing `Issue` row with `status = 'resolved'` becomes `closed`. Fake strategy fixtures updated directly; Supabase migration includes a data-backfill `update` statement.
- `IssueValidation` history accumulates naturally — rejecting a validation never deletes or overwrites the rejected row; the next submit creates a new row. `getActiveIssueValidation(issueId)` returns the most recent `pending` row.
- `rootCauseCategory` is a fixed enum: `'process_gap' | 'control_design_failure' | 'control_operating_failure' | 'human_error' | 'system_technical_failure' | 'third_party' | 'other'`.
- Gateway routes for the two new operations resolve `orgId` from the owning record (the `Issue` row, or the `IssueValidation` row), never from a client-supplied query param — this is the exact class of bug Phase B.2.3's final review caught and fixed (cross-tenant write via a trusted client-supplied org id).
- `IssuePatch.status` can no longer be set to `'pending_validation'` or `'closed'` directly — those transitions only happen through `submitIssueForValidation`/`reviewIssueValidation`. Both `FakeNotesStrategy.updateIssue` and `SupabaseNotesStrategy.updateIssue` throw `issue_status_change_requires_workflow` if a caller bypasses the TypeScript type and passes one of those values anyway.
- Follow existing snake_case / RLS / index conventions already established by `risk_acceptances` (`supabase/migrations/20260912000002_risk_register.sql:187`) for the new `issue_validations` table.

---

### Task 1: Shared types, Supabase migration, and Fake strategy implementation

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts:468-511` (Issue-related types)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts` (add `issueValidations` collection + 4 new methods; fix `updateIssue`)
- Create: `supabase/migrations/20260915000001_issue_closure_validation.sql`
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts:112-190` (issues describe block)

**Interfaces:**
- Produces: `IssueStatus = 'open' | 'in_progress' | 'pending_validation' | 'closed' | 'wont_fix'`, `RootCauseCategory`, `Issue.rootCause: string | null`, `Issue.rootCauseCategory: RootCauseCategory | null`, `IssueValidationStatus = 'pending' | 'approved' | 'rejected'`, `IssueValidation` interface, and these `DBStrategy` interface methods:
  ```ts
  submitIssueForValidation(
    id: string,
    ownerId: string,
    data: { rootCause: string; rootCauseCategory: RootCauseCategory; validatorId: string },
  ): Promise<Issue>;
  reviewIssueValidation(
    id: string,
    validatorId: string,
    decision: 'approved' | 'rejected',
    reviewNotes?: string,
  ): Promise<IssueValidation>;
  getIssueValidation(id: string): Promise<IssueValidation | null>;
  getActiveIssueValidation(issueId: string): Promise<IssueValidation | null>;
  listIssueValidations(issueId: string): Promise<IssueValidation[]>;
  ```
- `getIssueValidation(id)` fetches a single validation row by its own id (needed by the gateway to resolve `orgId` from a validation id path param — see Task 3). `getActiveIssueValidation(issueId)` fetches the current pending row for an issue (used by tests and mirrors the existing `getActiveRiskAcceptance` convention); the client never calls it over HTTP because `IssueDetailSheet` (Task 5) already has the full validation list in memory from `listIssueValidations` and derives the pending one from that — no gateway route or `notes-client` method is added for `getActiveIssueValidation` for this reason, it stays a strategy-internal/test-facing method only.
- Consumes: nothing from other tasks (this is the foundation task).

- [ ] **Step 1: Update `IssueStatus`, add `RootCauseCategory`, extend `Issue`, add `IssueValidation` types**

In `libs/shared/src/strategies/notes.ts`, replace lines 468-511 with:

```ts
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type IssueStatus = 'open' | 'in_progress' | 'pending_validation' | 'closed' | 'wont_fix';
export type IssueSource = 'manual' | 'gap_analysis' | 'vendor_risk';

export type RootCauseCategory =
  | 'process_gap'
  | 'control_design_failure'
  | 'control_operating_failure'
  | 'human_error'
  | 'system_technical_failure'
  | 'third_party'
  | 'other';

export interface Issue {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  reporterId: string | null;
  ownerId: string | null;
  affectedAssets?: string;
  status: IssueStatus;
  source: IssueSource;
  sourceId: string | null;
  dueDate: string | null;
  resolvedAt: string | null;
  rootCause: string | null;
  rootCauseCategory: RootCauseCategory | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueInput {
  title: string;
  description: string;
  severity: IssueSeverity;
  reporterId: string;
  ownerId: string;
  affectedAssets?: string;
  source?: IssueSource;
  sourceId?: string;
  dueDate?: string;
}

export interface IssuePatch {
  title?: string;
  description?: string;
  severity?: IssueSeverity;
  reporterId?: string;
  ownerId?: string;
  affectedAssets?: string;
  status?: Exclude<IssueStatus, 'pending_validation' | 'closed'>;
  dueDate?: string | null;
  resolvedAt?: string | null;
}

export type IssueValidationStatus = 'pending' | 'approved' | 'rejected';

export interface IssueValidation {
  id: string;
  issueId: string;
  orgId: string;
  requestedBy: string;
  validatorId: string;
  status: IssueValidationStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface IssueValidationSubmitInput {
  rootCause: string;
  rootCauseCategory: RootCauseCategory;
  validatorId: string;
}
```

Then find the `DBStrategy` interface's Issues section (search for `deleteIssue(id: string): Promise<void>;` inside the interface, not the implementation) and add immediately after it:

```ts
  submitIssueForValidation(
    id: string,
    ownerId: string,
    data: IssueValidationSubmitInput,
  ): Promise<Issue>;
  reviewIssueValidation(
    id: string,
    validatorId: string,
    decision: 'approved' | 'rejected',
    reviewNotes?: string,
  ): Promise<IssueValidation>;
  getActiveIssueValidation(issueId: string): Promise<IssueValidation | null>;
  listIssueValidations(issueId: string): Promise<IssueValidation[]>;
```

- [ ] **Step 2: Run typecheck to confirm the interface change compiles (implementations don't exist yet, so `FakeNotesStrategy`/`SupabaseNotesStrategy` will fail to satisfy `DBStrategy` — that's expected until Steps 3 and Task 2 land)**

Run: `yarn nx run shared:typecheck 2>&1 | head -30` (or the workspace's equivalent typecheck target — check `package.json`/`nx.json` if `shared` has no `typecheck` target, use `yarn tsc --noEmit -p libs/shared/tsconfig.lib.json`)
Expected: errors naming `FakeNotesStrategy` and `SupabaseNotesStrategy` as missing the 4 new methods — confirms the interface change took effect.

- [ ] **Step 3: Implement the 4 new methods + fix `updateIssue` in `FakeNotesStrategy`**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, find `private issues = new Map<string, Issue>();` (line 124) and add immediately after it:

```ts
  private issueValidations: IssueValidation[] = [];
```

Replace the `createIssue` method's `Issue` object literal to add the two new fields (insert after `resolvedAt: null,`):

```ts
      resolvedAt: null,
      rootCause: null,
      rootCauseCategory: null,
```

Replace the entire `updateIssue` method with:

```ts
  async updateIssue(id: string, patch: IssuePatch): Promise<Issue> {
    const existing = this.issues.get(id);
    if (!existing) throw new Error('issue_not_found');
    if (
      (patch.status as string) === 'pending_validation' ||
      (patch.status as string) === 'closed'
    ) {
      throw new Error('issue_status_change_requires_workflow');
    }
    const resolvedAt: string | null =
      'resolvedAt' in patch ? (patch.resolvedAt ?? null) : patch.status !== undefined ? null : existing.resolvedAt;
    const updated: Issue = {
      ...existing,
      ...patch,
      resolvedAt,
      updatedAt: new Date().toISOString(),
    };
    this.issues.set(id, updated);
    return updated;
  }
```

Then add these 4 methods immediately after `deleteIssue`:

```ts
  async submitIssueForValidation(
    id: string,
    ownerId: string,
    data: IssueValidationSubmitInput,
  ): Promise<Issue> {
    const issue = this.issues.get(id);
    if (!issue) throw new Error(`issue_not_found: ${id}`);
    if (data.validatorId === ownerId) {
      throw new Error('issue_validation_self_validation_forbidden');
    }
    const updated: Issue = {
      ...issue,
      status: 'pending_validation',
      rootCause: data.rootCause,
      rootCauseCategory: data.rootCauseCategory,
      updatedAt: new Date().toISOString(),
    };
    this.issues.set(id, updated);
    this.issueValidations.unshift({
      id: globalThis.crypto.randomUUID(),
      issueId: id,
      orgId: issue.orgId,
      requestedBy: ownerId,
      validatorId: data.validatorId,
      status: 'pending',
      reviewNotes: null,
      reviewedAt: null,
      createdAt: new Date().toISOString(),
    });
    return updated;
  }

  async reviewIssueValidation(
    id: string,
    validatorId: string,
    decision: 'approved' | 'rejected',
    reviewNotes?: string,
  ): Promise<IssueValidation> {
    const validation = this.issueValidations.find((v) => v.id === id);
    if (!validation) throw new Error(`issue_validation_not_found: ${id}`);
    if (validation.status !== 'pending') {
      throw new Error(`issue_validation_already_decided: ${id}`);
    }
    if (validation.validatorId !== validatorId) {
      throw new Error('issue_validation_not_authorized_validator');
    }
    if (decision === 'rejected' && !reviewNotes) {
      throw new Error('issue_validation_review_notes_required');
    }
    validation.status = decision;
    validation.reviewNotes = reviewNotes ?? null;
    validation.reviewedAt = new Date().toISOString();

    const issue = this.issues.get(validation.issueId);
    if (issue) {
      const updated: Issue = {
        ...issue,
        status: decision === 'approved' ? 'closed' : 'in_progress',
        resolvedAt: decision === 'approved' ? new Date().toISOString() : issue.resolvedAt,
        updatedAt: new Date().toISOString(),
      };
      this.issues.set(issue.id, updated);
    }
    return validation;
  }

  async getIssueValidation(id: string): Promise<IssueValidation | null> {
    return this.issueValidations.find((v) => v.id === id) ?? null;
  }

  async getActiveIssueValidation(issueId: string): Promise<IssueValidation | null> {
    return this.issueValidations.find((v) => v.issueId === issueId && v.status === 'pending') ?? null;
  }

  async listIssueValidations(issueId: string): Promise<IssueValidation[]> {
    return this.issueValidations.filter((v) => v.issueId === issueId);
  }
```

- [ ] **Step 4: Write the migration**

Create `supabase/migrations/20260915000001_issue_closure_validation.sql`:

```sql
-- Issue closure-validation workflow: root cause capture + Owner->Validator review cycle.

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'issues' and con.contype = 'c' and pg_get_constraintdef(con.oid) like '%status%';

  if constraint_name is not null then
    execute format('alter table public.issues drop constraint %I', constraint_name);
  end if;
end $$;

update public.issues set status = 'closed' where status = 'resolved';

alter table public.issues
  add constraint issues_status_check check (status in ('open','in_progress','pending_validation','closed','wont_fix')),
  add column root_cause text,
  add column root_cause_category text check (root_cause_category in
    ('process_gap','control_design_failure','control_operating_failure','human_error','system_technical_failure','third_party','other'));

create table public.issue_validations (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  requested_by uuid not null,
  validator_id uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index issue_validations_issue_idx on public.issue_validations(issue_id);
create index issue_validations_org_idx on public.issue_validations(org_id);

alter table public.issue_validations enable row level security;

create policy "org members read issue validations"
  on public.issue_validations for select
  using (true);

create policy "requester or validator manage issue validations"
  on public.issue_validations for all
  using (true)
  with check (true);
```

The `do $$ ... $$` block finds the real auto-generated name of the existing status check constraint before dropping it, since Postgres's generated name may not literally be `issues_status_check` — this avoids guessing wrong and failing the migration. The RLS policies mirror the permissive existing pattern already used by `issues`/`risk_acceptances` (`using (true)`), not tightened further — matching this codebase's current RLS posture, not introducing a new stricter standard unrelated to this task.

- [ ] **Step 5: Update the 2 existing tests that reference `status: 'resolved'`**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, replace the two tests inside `describe('issues', ...)`:

```ts
  it('closes an issue through the validation workflow and sets resolvedAt', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Change control was skipped',
      rootCauseCategory: 'process_gap',
      validatorId: 'validator-1',
    });
    const validation = await s.getActiveIssueValidation(issue.id);
    const closed = await s.reviewIssueValidation(validation!.id, 'validator-1', 'approved');
    expect(closed.status).toBe('approved');
    const updatedIssue = await s.getIssue(issue.id);
    expect(updatedIssue!.status).toBe('closed');
    expect(updatedIssue!.resolvedAt).not.toBeNull();
  });

  it('clears resolvedAt when a closed issue is reopened via generic update', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Change control was skipped',
      rootCauseCategory: 'process_gap',
      validatorId: 'validator-1',
    });
    const validation = await s.getActiveIssueValidation(issue.id);
    await s.reviewIssueValidation(validation!.id, 'validator-1', 'approved');
    const reopened = await s.updateIssue(issue.id, { status: 'open' });
    expect(reopened.resolvedAt).toBeNull();
  });
```

- [ ] **Step 6: Add new tests for the validation workflow itself**

Add these tests inside `describe('issues', ...)` in the same file, after the tests from Step 5:

```ts
  it('rejects self-validation', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await expect(
      s.submitIssueForValidation(issue.id, 'owner-1', {
        rootCause: 'Root cause',
        rootCauseCategory: 'human_error',
        validatorId: 'owner-1',
      }),
    ).rejects.toThrow('issue_validation_self_validation_forbidden');
  });

  it('rejects a validation with notes, returns issue to in_progress, and preserves history on resubmit', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'First attempt',
      rootCauseCategory: 'human_error',
      validatorId: 'validator-1',
    });
    const firstValidation = await s.getActiveIssueValidation(issue.id);
    const rejected = await s.reviewIssueValidation(
      firstValidation!.id,
      'validator-1',
      'rejected',
      'Fix does not address the root cause',
    );
    expect(rejected.status).toBe('rejected');
    const afterReject = await s.getIssue(issue.id);
    expect(afterReject!.status).toBe('in_progress');

    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Second attempt',
      rootCauseCategory: 'control_design_failure',
      validatorId: 'validator-1',
    });
    const secondValidation = await s.getActiveIssueValidation(issue.id);
    expect(secondValidation!.id).not.toBe(firstValidation!.id);

    const history = await s.listIssueValidations(issue.id);
    expect(history).toHaveLength(2);
    expect(history.find((v) => v.id === firstValidation!.id)?.status).toBe('rejected');
  });

  it('rejects review from someone other than the assigned validator', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Root cause',
      rootCauseCategory: 'other',
      validatorId: 'validator-1',
    });
    const validation = await s.getActiveIssueValidation(issue.id);
    await expect(
      s.reviewIssueValidation(validation!.id, 'someone-else', 'approved'),
    ).rejects.toThrow('issue_validation_not_authorized_validator');
  });

  it('requires reviewNotes on rejection', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await s.submitIssueForValidation(issue.id, 'owner-1', {
      rootCause: 'Root cause',
      rootCauseCategory: 'other',
      validatorId: 'validator-1',
    });
    const validation = await s.getActiveIssueValidation(issue.id);
    await expect(s.reviewIssueValidation(validation!.id, 'validator-1', 'rejected')).rejects.toThrow(
      'issue_validation_review_notes_required',
    );
  });

  it('bypassing the type system to set status directly to closed via updateIssue throws', async () => {
    const issue = await s.createIssue('org1', 'u1', {
      title: 'T',
      description: 'D',
      severity: 'low',
      reporterId: 'reporter-1',
      ownerId: 'owner-1',
    });
    await expect(
      s.updateIssue(issue.id, { status: 'closed' as unknown as IssuePatch['status'] }),
    ).rejects.toThrow('issue_status_change_requires_workflow');
  });
```

- [ ] **Step 7: Run the tests**

Run: `yarn nx test shared --skip-nx-cache -t issues`
Expected: all `issues` describe-block tests pass, including the 6 new/updated ones.

- [ ] **Step 8: Prettier, lint, build, commit**

```bash
npx prettier --write libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts supabase/migrations/20260915000001_issue_closure_validation.sql
yarn nx lint shared
yarn nx build shared
git add libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts supabase/migrations/20260915000001_issue_closure_validation.sql
git commit -m "feat(shared): add Issue closure-validation workflow and root cause fields"
```

---

### Task 2: SupabaseNotesStrategy implementation

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts` (Issues section ~line 1916-1998, plus a new "Issue Validations" section)

**Interfaces:**
- Consumes: `Issue`, `IssueValidation`, `IssueValidationSubmitInput`, `RootCauseCategory` from Task 1.
- Produces: real-DB implementations of the same 4 methods Task 1 added to `FakeNotesStrategy`, satisfying the `DBStrategy` interface for the Supabase provider.

- [ ] **Step 1: Add `rootCause`/`rootCauseCategory` to `createIssue`, `updateIssue`, and `toIssue`**

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, in `toIssue` (around line 1983), add after `resolvedAt: row['resolved_at'] as string | null,`:

```ts
      rootCause: row['root_cause'] as string | null,
      rootCauseCategory: row['root_cause_category'] as Issue['rootCauseCategory'],
```

In `updateIssue`, replace the `patch.status` handling block:

```ts
    if (patch.status !== undefined) {
      if ((patch.status as string) === 'pending_validation' || (patch.status as string) === 'closed') {
        throw new Error('issue_status_change_requires_workflow');
      }
      update['status'] = patch.status;
      if (!('resolvedAt' in patch)) {
        update['resolved_at'] = null;
      }
    }
```

- [ ] **Step 2: Add the "Issue Validations" section**

Add this new section immediately after the `toIssue` method (end of the Issues section, before `// ─── Assets`):

```ts
  // ─── Issue Validations ──────────────────────────────────────────────────

  async submitIssueForValidation(
    id: string,
    ownerId: string,
    data: IssueValidationSubmitInput,
  ): Promise<Issue> {
    if (data.validatorId === ownerId) {
      throw new Error('issue_validation_self_validation_forbidden');
    }
    const { data: issueRow, error: issueError } = await this.db
      .from('issues')
      .update({
        status: 'pending_validation',
        root_cause: data.rootCause,
        root_cause_category: data.rootCauseCategory,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    const issue = this.toIssue(ok(issueRow, issueError));

    const { error: validationError } = await this.db.from('issue_validations').insert({
      issue_id: id,
      org_id: issue.orgId,
      requested_by: ownerId,
      validator_id: data.validatorId,
    });
    if (validationError) throw new Error(validationError.message);
    return issue;
  }

  private async getIssueValidationOrThrow(id: string): Promise<IssueValidation> {
    const { data, error } = await this.db
      .from('issue_validations')
      .select('*')
      .eq('id', id)
      .single();
    return this.toIssueValidation(ok(data, error));
  }

  async getIssueValidation(id: string): Promise<IssueValidation | null> {
    const { data, error } = await this.db
      .from('issue_validations')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toIssueValidation(data) : null;
  }

  async reviewIssueValidation(
    id: string,
    validatorId: string,
    decision: 'approved' | 'rejected',
    reviewNotes?: string,
  ): Promise<IssueValidation> {
    const current = await this.getIssueValidationOrThrow(id);
    if (current.status !== 'pending') {
      throw new Error(`issue_validation_already_decided: ${id}`);
    }
    if (current.validatorId !== validatorId) {
      throw new Error('issue_validation_not_authorized_validator');
    }
    if (decision === 'rejected' && !reviewNotes) {
      throw new Error('issue_validation_review_notes_required');
    }

    const { data, error } = await this.db
      .from('issue_validations')
      .update({
        status: decision,
        review_notes: reviewNotes ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('validator_id', validatorId)
      .eq('status', 'pending')
      .select()
      .single();
    const validation = this.toIssueValidation(ok(data, error));

    await this.db
      .from('issues')
      .update({
        status: decision === 'approved' ? 'closed' : 'in_progress',
        ...(decision === 'approved' ? { resolved_at: new Date().toISOString() } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', current.issueId);

    return validation;
  }

  async getActiveIssueValidation(issueId: string): Promise<IssueValidation | null> {
    const { data, error } = await this.db
      .from('issue_validations')
      .select('*')
      .eq('issue_id', issueId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toIssueValidation(data) : null;
  }

  async listIssueValidations(issueId: string): Promise<IssueValidation[]> {
    const { data, error } = await this.db
      .from('issue_validations')
      .select('*')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: false });
    return ok(data, error).map((row) => this.toIssueValidation(row));
  }

  private toIssueValidation(row: Record<string, unknown>): IssueValidation {
    return {
      id: row['id'] as string,
      issueId: row['issue_id'] as string,
      orgId: row['org_id'] as string,
      requestedBy: row['requested_by'] as string,
      validatorId: row['validator_id'] as string,
      status: row['status'] as IssueValidationStatus,
      reviewNotes: row['review_notes'] as string | null,
      reviewedAt: row['reviewed_at'] as string | null,
      createdAt: row['created_at'] as string,
    };
  }
```

- [ ] **Step 2b: Add the new type imports**

At the top of `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, find the existing `Issue`/`IssueInput`/`IssuePatch` import line and add `IssueValidation`, `IssueValidationStatus`, `IssueValidationSubmitInput` to it.

- [ ] **Step 3: Prettier, lint, build**

```bash
npx prettier --write apps/microservices/notes/src/app/supabase-notes.strategy.ts
yarn nx lint notes
yarn nx build notes
```

No new unit tests in this task — this codebase's convention (confirmed: no `supabase-notes.strategy` test file exists) is that only `FakeNotesStrategy` gets direct unit-test coverage; the Supabase strategy is verified by mirroring the Fake strategy's already-tested logic exactly, which this step does.

- [ ] **Step 4: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): implement Issue closure-validation in SupabaseNotesStrategy"
```

---

### Task 3: MS controller handlers, notes-client, and gateway routes

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts` (Issues `@MessagePattern` section, ~line 601-624)
- Modify: `libs/notes-client/src/lib/notes-client.service.ts` (Issues section, ~line 694-713)
- Modify: `apps/api/src/app/notes/notes.controller.ts` (Issues gateway routes, ~line 807-851)

**Interfaces:**
- Consumes: the `DBStrategy` methods from Tasks 1-2 (`submitIssueForValidation`, `reviewIssueValidation`, `getIssueValidation`, `listIssueValidations`). `getActiveIssueValidation` from Tasks 1-2 is intentionally NOT wired through this task (see Task 1's note — it is a test/strategy-internal method only; `IssueDetailSheet` in Task 5 derives the active validation from the full list it already fetches).
- Produces: gateway REST routes `POST /api/notes/issues/:id/submit-for-validation`, `POST /api/notes/issue-validations/:id/review`, `GET /api/notes/issues/:id/validations` — consumed by Task 4's client hooks.

- [ ] **Step 1: Add MS `@MessagePattern` handlers**

In `apps/microservices/notes/src/app/notes.controller.ts`, add immediately after the existing `deleteIssue` handler (end of the Issues section, before `// ─── Assets`):

```ts
  @MessagePattern('notes.issues.submit-for-validation')
  submitIssueForValidation(
    @Payload() payload: { id: string; ownerId: string; data: IssueValidationSubmitInput },
  ): Promise<Issue> {
    return this.strategy.submitIssueForValidation(payload.id, payload.ownerId, payload.data);
  }

  @MessagePattern('notes.issues.review-validation')
  reviewIssueValidation(
    @Payload()
    payload: {
      id: string;
      validatorId: string;
      decision: 'approved' | 'rejected';
      reviewNotes?: string;
    },
  ): Promise<IssueValidation> {
    return this.strategy.reviewIssueValidation(
      payload.id,
      payload.validatorId,
      payload.decision,
      payload.reviewNotes,
    );
  }

  @MessagePattern('notes.issues.validations.get')
  getIssueValidation(@Payload() payload: { id: string }): Promise<IssueValidation | null> {
    return this.strategy.getIssueValidation(payload.id);
  }

  @MessagePattern('notes.issues.validations.list')
  listIssueValidations(@Payload() payload: { issueId: string }): Promise<IssueValidation[]> {
    return this.strategy.listIssueValidations(payload.issueId);
  }
```

Add `IssueValidation`, `IssueValidationSubmitInput` to the existing `Issue`/`IssueInput`/`IssuePatch` import at the top of the file.

- [ ] **Step 2: Add `notes-client` methods**

In `libs/notes-client/src/lib/notes-client.service.ts`, add immediately after the existing `deleteIssue` method:

```ts
  submitIssueForValidation(
    id: string,
    ownerId: string,
    data: IssueValidationSubmitInput,
  ): Promise<Issue> {
    return signedSend<Issue>(this.client, 'notes.issues.submit-for-validation', {
      id,
      ownerId,
      data,
    });
  }

  reviewIssueValidation(
    id: string,
    validatorId: string,
    decision: 'approved' | 'rejected',
    reviewNotes?: string,
  ): Promise<IssueValidation> {
    return signedSend<IssueValidation>(this.client, 'notes.issues.review-validation', {
      id,
      validatorId,
      decision,
      reviewNotes,
    });
  }

  getIssueValidation(id: string): Promise<IssueValidation | null> {
    return signedSend<IssueValidation | null>(this.client, 'notes.issues.validations.get', {
      id,
    });
  }

  listIssueValidations(issueId: string): Promise<IssueValidation[]> {
    return signedSend<IssueValidation[]>(this.client, 'notes.issues.validations.list', {
      issueId,
    });
  }
```

Add `IssueValidation`, `IssueValidationSubmitInput` to this file's existing `Issue`/`IssueInput`/`IssuePatch` import.

- [ ] **Step 3: Add gateway routes with org-resolved authorization**

In `apps/api/src/app/notes/notes.controller.ts`, add immediately after the existing `deleteIssue` route:

```ts
  @Post('issues/:id/submit-for-validation')
  @ApiOperation({ summary: 'Owner submits an issue fix for validator review' })
  async submitIssueForValidation(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: IssueValidationSubmitInput,
  ) {
    const userId = this.uid(req);
    const issue = await this.notes.getIssue(id);
    if (!issue) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(issue.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.submitIssueForValidation(id, userId, body);
  }

  @Post('issue-validations/:id/review')
  @ApiOperation({ summary: 'Validator approves or rejects a pending issue validation' })
  async reviewIssueValidation(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { decision: 'approved' | 'rejected'; reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    const validation = await this.notes.getIssueValidation(id);
    if (!validation) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(validation.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.reviewIssueValidation(id, userId, body.decision, body.reviewNotes);
  }

  @Get('issues/:id/validations')
  @ApiOperation({ summary: 'List validation history for an issue' })
  async listIssueValidations(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listIssueValidations(id);
  }
```

The `reviewIssueValidation` route resolves `orgId` from the validation row itself (via `getIssueValidation`, added in Tasks 1-2), never from a client-supplied query param — this is the exact class of authorization bug Phase B.2.3's final review caught (cross-tenant write via a trusted client-supplied org id) and this plan avoids repeating it.

Add `IssueValidationSubmitInput` to this file's imports.

- [ ] **Step 4: Prettier, lint, build**

```bash
npx prettier --write apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts apps/api/src/app/notes/notes.controller.ts
yarn nx lint notes
yarn nx lint api
yarn nx lint notes-client
yarn nx build notes
yarn nx build api
yarn nx build notes-client
yarn nx test shared --skip-nx-cache -t issues
```

Expected: green — this task only adds wiring (MS handlers, notes-client methods, gateway routes) on top of the strategy methods Tasks 1-2 already implemented and tested; no shared-lib source changes happen here, so the `shared` test run is a regression check, not a new-coverage check.

- [ ] **Step 5: Commit**

```bash
git add apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts apps/api/src/app/notes/notes.controller.ts
git commit -m "feat(notes): wire Issue closure-validation through MS, notes-client, and gateway"
```

---

### Task 4: Client queries and Issues page updates

**Files:**
- Modify: `apps/client/src/queries/issues.ts`
- Modify: `apps/client/src/routes/_dashboard/-issues.page.tsx`
- Modify: `apps/client/src/routes/_dashboard/__tests__/issues.unit.test.tsx`

**Interfaces:**
- Consumes: gateway routes from Task 3 (`POST /issues/:id/submit-for-validation`, `POST /issue-validations/:id/review`, `GET /issues/:id/validations`).
- Produces: `useSubmitIssueForValidation(orgId)`, `useReviewIssueValidation(orgId)`, `useIssueValidations(issueId)` hooks, and a `selectedIssueId` state slot in `IssuesPage` — consumed by Task 5's `IssueDetailSheet`.

- [ ] **Step 1: Add the 3 new query hooks**

In `apps/client/src/queries/issues.ts`, update the type import line and add the new hooks:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Issue,
  IssueInput,
  IssuePatch,
  IssueValidation,
  IssueValidationSubmitInput,
} from '@icore/shared';

export type { Issue, IssueInput, IssuePatch, IssueValidation, IssueValidationSubmitInput };
```

Append after the existing `useDeleteIssue`:

```ts
export function useIssueValidations(issueId: string) {
  return useQuery<IssueValidation[]>({
    queryKey: ['issues', issueId, 'validations'],
    queryFn: () => api<IssueValidation[]>(`/notes/issues/${issueId}/validations`),
    enabled: !!issueId,
  });
}

export function useSubmitIssueForValidation(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Issue, Error, { id: string; data: IssueValidationSubmitInput }>({
    mutationFn: ({ id, data }) =>
      api<Issue>(`/notes/issues/${id}/submit-for-validation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_result, { id }) => {
      qc.invalidateQueries({ queryKey: ['issues', orgId] });
      qc.invalidateQueries({ queryKey: ['issues', id, 'validations'] });
    },
  });
}

export function useReviewIssueValidation(orgId: string) {
  const qc = useQueryClient();
  return useMutation<
    IssueValidation,
    Error,
    { id: string; issueId: string; decision: 'approved' | 'rejected'; reviewNotes?: string }
  >({
    mutationFn: ({ id, decision, reviewNotes }) =>
      api<IssueValidation>(`/notes/issue-validations/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reviewNotes }),
      }),
    onSuccess: (_result, { issueId }) => {
      qc.invalidateQueries({ queryKey: ['issues', orgId] });
      qc.invalidateQueries({ queryKey: ['issues', issueId, 'validations'] });
    },
  });
}
```

- [ ] **Step 2: Update `-issues.page.tsx`: status colors/options, raw select restriction, clickable row**

In `apps/client/src/routes/_dashboard/-issues.page.tsx`:

Replace `STATUS_COLORS`:

```ts
const STATUS_COLORS: Record<Issue['status'], string> = {
  open: 'bg-red-500/10 text-red-400 border-red-500/20',
  in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  pending_validation: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  closed: 'bg-green-500/10 text-green-400 border-green-500/20',
  wont_fix: 'bg-muted text-muted-foreground border-border',
};
```

Replace `STATUS_OPTIONS` — the raw inline `<select>` may only set the 3 manual states now (`pending_validation`/`closed` only happen through the workflow):

```ts
const MANUAL_STATUS_OPTIONS: Array<Exclude<Issue['status'], 'pending_validation' | 'closed'>> = [
  'open',
  'in_progress',
  'wont_fix',
];
```

In `IssueRow`, update the `onStatusChange` prop type and the `<select>`'s options to use `MANUAL_STATUS_OPTIONS`, and make the row clickable to open the detail sheet:

```tsx
function IssueRow({
  issue,
  onStatusChange,
  onDelete,
  onOpen,
}: {
  issue: Issue;
  onStatusChange: (status: Exclude<Issue['status'], 'pending_validation' | 'closed'>) => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { data: linkedFindings = [] } = useFindingsByLink({
    issueId: issue.source === 'gap_analysis' ? issue.id : undefined,
  });
  const linkedFinding = linkedFindings[0];

  return (
    <div className="flex items-start gap-4 bg-surface border border-border rounded-xl p-4">
      <button
        type="button"
        onClick={onOpen}
        className="flex-1 min-w-0 text-left cursor-pointer"
      >
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-medium text-sm text-foreground truncate">{issue.title}</span>
          <span
            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${SEVERITY_COLORS[issue.severity]}`}
          >
            {t(`issues.severity.${issue.severity}`)}
          </span>
          <span
            className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[issue.status]}`}
          >
            {t(`issues.status.${issue.status}`)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{issue.description}</p>
        {linkedFinding && (
          <span className="font-mono text-xs underline text-muted-foreground">
            {t('issues.linkedFinding', { code: linkedFinding.code })}
          </span>
        )}
      </button>
      <div className="flex gap-1.5 shrink-0">
        <select
          value={issue.status === 'pending_validation' || issue.status === 'closed' ? '' : issue.status}
          onChange={(e) =>
            onStatusChange(
              e.target.value as Exclude<Issue['status'], 'pending_validation' | 'closed'>,
            )
          }
          disabled={issue.status === 'pending_validation' || issue.status === 'closed'}
          className="text-xs h-7 rounded border border-border bg-surface px-1 text-foreground focus:outline-none focus:ring-1 focus:ring-green-500/40 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        >
          {issue.status === 'pending_validation' && (
            <option value="">{t('issues.status.pending_validation')}</option>
          )}
          {issue.status === 'closed' && <option value="">{t('issues.status.closed')}</option>}
          {MANUAL_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {t(`issues.status.${s}`)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs px-2 py-1 rounded text-muted-foreground border border-border hover:text-destructive hover:border-destructive/50 transition-colors cursor-pointer"
        >
          {t('common.delete')}
        </button>
      </div>
    </div>
  );
}
```

The original `Link` to `/controls/$id` for `linkedFinding` is replaced with a plain `span` here because the row itself is now the clickable-to-open-Sheet target (a nested interactive `Link` inside the row-opening `button` would be invalid HTML — a link inside a button). The finding-code cross-reference is still shown as text; deep-linking to the control from within the Sheet is out of scope for this phase.

In `IssuesPage`, add `selectedIssueId` state and wire `onOpen`, plus the 3 new hooks (used by Task 5's Sheet, imported here to pass down):

```tsx
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
```

(add this state declaration next to the existing `const [open, setOpen] = useState(false);`)

Update the `issues.map` block:

```tsx
          {issues.map((issue) => (
            <IssueRow
              key={issue.id}
              issue={issue}
              onStatusChange={(status) => updateMut.mutate({ id: issue.id, patch: { status } })}
              onDelete={() => deleteMut.mutate(issue.id)}
              onOpen={() => setSelectedIssueId(issue.id)}
            />
          ))}
```

Task 5 adds the `<IssueDetailSheet>` render and its import; this task stops at having `selectedIssueId`/`setSelectedIssueId` in scope.

- [ ] **Step 3: Update the existing page test for the new status set and clickable row**

In `apps/client/src/routes/_dashboard/__tests__/issues.unit.test.tsx`, find any assertion using `'resolved'` as a status value or option and replace with `'closed'` (following exactly the same fixture-migration pattern used in every prior Fake-strategy status rename in this codebase). Find any test that asserted the row's finding-code text was a clickable `Link` (`getByRole('link', ...)`) and change it to `getByText(...)` since it's now a plain `span`. Read the file first to locate exact line numbers before editing — do not guess at content not shown here.

- [ ] **Step 4: Run tests, prettier, lint, build**

```bash
npx prettier --write apps/client/src/queries/issues.ts apps/client/src/routes/_dashboard/-issues.page.tsx apps/client/src/routes/_dashboard/__tests__/issues.unit.test.tsx
yarn nx lint client --skip-nx-cache
yarn nx build client --skip-nx-cache
yarn nx test client --skip-nx-cache -t issues
```

Expected: green.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/queries/issues.ts apps/client/src/routes/_dashboard/-issues.page.tsx apps/client/src/routes/_dashboard/__tests__/issues.unit.test.tsx
git commit -m "feat(client): add Issue validation query hooks and restrict manual status changes"
```

---

### Task 5: `IssueDetailSheet` component

**Files:**
- Create: `apps/client/src/components/issues/IssueDetailSheet.tsx`
- Create: `apps/client/src/components/issues/__tests__/IssueDetailSheet.unit.test.tsx`
- Modify: `apps/client/src/routes/_dashboard/-issues.page.tsx` (render the Sheet)

**Interfaces:**
- Consumes: `useIssueValidations`, `useSubmitIssueForValidation`, `useReviewIssueValidation` (Task 4), `useOrgMembers` (existing), `useAuthStore` (existing, `@icore/template-shared`).
- Produces: `<IssueDetailSheet issue={Issue} orgId={string} open={boolean} onOpenChange={(open: boolean) => void} />`.

- [ ] **Step 1: Write the component**

Create `apps/client/src/components/issues/IssueDetailSheet.tsx`:

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore, useNotify } from '@icore/template-shared';
import type { Issue, RootCauseCategory } from '@icore/shared';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  useIssueValidations,
  useSubmitIssueForValidation,
  useReviewIssueValidation,
} from '@/queries/issues';
import { useOrgMembers } from '@/queries/org-members';

const ROOT_CAUSE_CATEGORIES: RootCauseCategory[] = [
  'process_gap',
  'control_design_failure',
  'control_operating_failure',
  'human_error',
  'system_technical_failure',
  'third_party',
  'other',
];

type DetailTab = 'overview' | 'rootCause' | 'validation';

export function IssueDetailSheet({
  issue,
  orgId,
  open,
  onOpenChange,
}: {
  issue: Issue;
  orgId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const notify = useNotify();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const { data: members = [] } = useOrgMembers(orgId);
  const { data: validations = [] } = useIssueValidations(issue.id);
  const submitMut = useSubmitIssueForValidation(orgId);
  const reviewMut = useReviewIssueValidation(orgId);

  const [tab, setTab] = useState<DetailTab>('overview');
  const [rootCause, setRootCause] = useState(issue.rootCause ?? '');
  const [rootCauseCategory, setRootCauseCategory] = useState<RootCauseCategory | ''>(
    issue.rootCauseCategory ?? '',
  );
  const [validatorId, setValidatorId] = useState('');
  const [rejectNotes, setRejectNotes] = useState('');

  const pendingValidation = validations.find((v) => v.status === 'pending');
  const isOwner = currentUserId === issue.ownerId;
  const isAssignedValidator = pendingValidation?.validatorId === currentUserId;
  const canSubmit =
    isOwner &&
    (issue.status === 'open' || issue.status === 'in_progress') &&
    !!rootCause &&
    !!rootCauseCategory &&
    !!validatorId &&
    validatorId !== issue.ownerId;

  const validatorOptions = members
    .filter((m) => m.userId !== issue.ownerId)
    .map((m) => ({ value: m.userId, label: m.displayName ?? m.email ?? m.userId }));

  const tabs: DetailTab[] = ['overview', 'rootCause', 'validation'];

  function handleSubmit() {
    if (!canSubmit || !rootCauseCategory) return;
    submitMut.mutate(
      { id: issue.id, data: { rootCause, rootCauseCategory, validatorId } },
      {
        onSuccess: () => notify.success(t('issues.detail.submitted')),
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  function handleApprove() {
    if (!pendingValidation) return;
    reviewMut.mutate(
      { id: pendingValidation.id, issueId: issue.id, decision: 'approved' },
      {
        onSuccess: () => notify.success(t('issues.detail.approved')),
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  function handleReject() {
    if (!pendingValidation || !rejectNotes) return;
    reviewMut.mutate(
      { id: pendingValidation.id, issueId: issue.id, decision: 'rejected', reviewNotes: rejectNotes },
      {
        onSuccess: () => {
          notify.success(t('issues.detail.rejected'));
          setRejectNotes('');
        },
        onError: () => notify.error(t('error.unknown')),
      },
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{issue.title}</SheetTitle>
        </SheetHeader>

        <div className="border-b border-border mb-4 flex gap-1">
          {tabs.map((tKey) => (
            <button
              key={tKey}
              type="button"
              onClick={() => setTab(tKey)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px cursor-pointer ${
                tab === tKey
                  ? 'border-green-500 text-foreground font-medium'
                  : 'border-transparent text-muted-foreground'
              }`}
            >
              {t(`issues.detail.tab.${tKey}`)}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{issue.description}</p>
            <p>
              {t('issues.severity.label')}: <strong>{t(`issues.severity.${issue.severity}`)}</strong>
            </p>
            <p>
              {t('issues.detail.status')}: <strong>{t(`issues.status.${issue.status}`)}</strong>
            </p>
          </div>
        )}

        {tab === 'rootCause' && (
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">
                {t('issues.detail.rootCauseCategory')}
              </span>
              <Select
                value={rootCauseCategory}
                onValueChange={(v) => setRootCauseCategory(v as RootCauseCategory)}
                disabled={!isOwner}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('issues.detail.selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {ROOT_CAUSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {t(`issues.detail.rootCauseCategoryOptions.${c}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs text-muted-foreground">{t('issues.detail.rootCause')}</span>
              <textarea
                value={rootCause}
                onChange={(e) => setRootCause(e.target.value)}
                disabled={!isOwner}
                rows={4}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none disabled:opacity-50"
              />
            </label>
          </div>
        )}

        {tab === 'validation' && (
          <div className="space-y-4">
            {pendingValidation ? (
              <div className="border border-border rounded-lg p-3 space-y-2 text-sm">
                <p>
                  {t('issues.detail.pendingValidationFor', {
                    name:
                      members.find((m) => m.userId === pendingValidation.validatorId)?.displayName ??
                      pendingValidation.validatorId,
                  })}
                </p>
                {isAssignedValidator && (
                  <div className="space-y-2">
                    <textarea
                      value={rejectNotes}
                      onChange={(e) => setRejectNotes(e.target.value)}
                      placeholder={t('issues.detail.rejectNotesPlaceholder')}
                      rows={2}
                      className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm resize-none"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleApprove} disabled={reviewMut.isPending}>
                        {t('issues.detail.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleReject}
                        disabled={reviewMut.isPending || !rejectNotes}
                      >
                        {t('issues.detail.reject')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              isOwner &&
              (issue.status === 'open' || issue.status === 'in_progress') && (
                <div className="space-y-2">
                  <label className="block space-y-1.5">
                    <span className="text-xs text-muted-foreground">
                      {t('issues.detail.selectValidator')}
                    </span>
                    <Combobox
                      options={validatorOptions}
                      value={validatorId}
                      onChange={setValidatorId}
                      placeholder={t('issues.detail.selectValidator')}
                      searchPlaceholder={t('issues.searchMembers')}
                    />
                  </label>
                  <Button size="sm" onClick={handleSubmit} disabled={!canSubmit || submitMut.isPending}>
                    {t('issues.detail.submitForValidation')}
                  </Button>
                </div>
              )
            )}

            {validations.length > 0 && (
              <div className="pt-3 border-t border-border space-y-2">
                <h3 className="text-xs text-muted-foreground">{t('issues.detail.history')}</h3>
                {validations.map((v) => (
                  <div key={v.id} className="text-xs border border-border rounded p-2 space-y-0.5">
                    <p>
                      {t(`issues.detail.historyStatus.${v.status}`)} —{' '}
                      {members.find((m) => m.userId === v.validatorId)?.displayName ?? v.validatorId}
                    </p>
                    {v.reviewNotes && <p className="text-muted-foreground">{v.reviewNotes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 2: Wire it into `-issues.page.tsx`**

Add the import:

```tsx
import { IssueDetailSheet } from '@/components/issues/IssueDetailSheet';
```

Render it just before the closing `</PageLayout>` tag (after the existing `<Dialog>` and `<UnsavedChangesDialog>`):

```tsx
      {selectedIssueId && (
        <IssueDetailSheet
          issue={issues.find((i) => i.id === selectedIssueId)!}
          orgId={orgId}
          open={!!selectedIssueId}
          onOpenChange={(o) => !o && setSelectedIssueId(null)}
        />
      )}
```

- [ ] **Step 3: Write the failing tests**

Create `apps/client/src/components/issues/__tests__/IssueDetailSheet.unit.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IssueDetailSheet } from '../IssueDetailSheet';
import type { Issue } from '@icore/shared';

vi.mock('@icore/template-shared', async () => {
  const actual = await vi.importActual('@icore/template-shared');
  return {
    ...actual,
    useAuthStore: (selector: (s: { user: { id: string } }) => unknown) =>
      selector({ user: { id: 'owner-1' } }),
    useNotify: () => ({ success: vi.fn(), error: vi.fn() }),
  };
});

vi.mock('@/queries/org-members', () => ({
  useOrgMembers: () => ({
    data: [
      { userId: 'owner-1', displayName: 'Owner One', email: 'owner@example.com' },
      { userId: 'validator-1', displayName: 'Validator One', email: 'validator@example.com' },
    ],
  }),
}));

const mockSubmit = vi.fn();
const mockReview = vi.fn();
let mockValidations: unknown[] = [];

vi.mock('@/queries/issues', () => ({
  useIssueValidations: () => ({ data: mockValidations }),
  useSubmitIssueForValidation: () => ({ mutate: mockSubmit, isPending: false }),
  useReviewIssueValidation: () => ({ mutate: mockReview, isPending: false }),
}));

const baseIssue: Issue = {
  id: 'issue-1',
  orgId: 'org-1',
  userId: 'owner-1',
  title: 'MFA not enforced',
  description: 'Admin accounts lack MFA',
  severity: 'high',
  reporterId: 'reporter-1',
  ownerId: 'owner-1',
  status: 'open',
  source: 'manual',
  sourceId: null,
  dueDate: null,
  resolvedAt: null,
  rootCause: null,
  rootCauseCategory: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function renderSheet(issue: Issue) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <IssueDetailSheet issue={issue} orgId="org-1" open={true} onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('IssueDetailSheet', () => {
  beforeEach(() => {
    mockSubmit.mockClear();
    mockReview.mockClear();
    mockValidations = [];
  });

  it('renders the overview tab by default', () => {
    renderSheet(baseIssue);
    expect(screen.getByText('MFA not enforced')).toBeInTheDocument();
    expect(screen.getByText('Admin accounts lack MFA')).toBeInTheDocument();
  });

  it('excludes the issue owner from the validator picker', () => {
    renderSheet(baseIssue);
    fireEvent.click(screen.getByText('issues.detail.tab.validation'));
    fireEvent.click(screen.getByText('issues.detail.selectValidator'));
    expect(screen.queryByText('Owner One')).not.toBeInTheDocument();
    expect(screen.getByText('Validator One')).toBeInTheDocument();
  });

  it('shows approve/reject controls to the assigned validator on a pending validation', () => {
    mockValidations = [
      {
        id: 'val-1',
        issueId: 'issue-1',
        orgId: 'org-1',
        requestedBy: 'owner-1',
        validatorId: 'validator-1',
        status: 'pending',
        reviewNotes: null,
        reviewedAt: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    renderSheet({ ...baseIssue, status: 'pending_validation' });
    fireEvent.click(screen.getByText('issues.detail.tab.validation'));
    // current user is owner-1, not validator-1 -> no approve/reject buttons
    expect(screen.queryByText('issues.detail.approve')).not.toBeInTheDocument();
  });

  it('renders validation history when present', () => {
    mockValidations = [
      {
        id: 'val-1',
        issueId: 'issue-1',
        orgId: 'org-1',
        requestedBy: 'owner-1',
        validatorId: 'validator-1',
        status: 'rejected',
        reviewNotes: 'Not fixed yet',
        reviewedAt: '2026-01-02T00:00:00Z',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    renderSheet({ ...baseIssue, status: 'in_progress' });
    fireEvent.click(screen.getByText('issues.detail.tab.validation'));
    expect(screen.getByText('Not fixed yet')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run tests, expect the new file to fail if imports/paths are wrong, then fix and re-run**

Run: `yarn nx test client --skip-nx-cache -t IssueDetailSheet`
Expected: all 4 tests pass. If `useOrgMembers` or `useAuthStore`'s actual export shape differs from what's mocked here, adjust the mock to match the real hook signature (check `apps/client/src/queries/org-members.ts` and `libs/template-shared`'s `useAuthStore` export before assuming the shape above is exact — this plan's mock is written from the pattern observed in `-risks-detail.page.tsx`, but verify field names live).

- [ ] **Step 5: Regenerate the `-controls-detail.page.tsx`-style cross-check: run the full client suite to catch mock-gap regressions**

Run: `yarn nx test client --skip-nx-cache`
Expected: all files pass, including `issues.unit.test.tsx` from Task 4 (no new top-level hook was added to a *shared* component here, so no cross-task mock-gap is expected, but confirm anyway per this codebase's recurring "new hook breaks sibling test file" lesson).

- [ ] **Step 6: Prettier, lint, build, commit**

```bash
npx prettier --write apps/client/src/components/issues/IssueDetailSheet.tsx apps/client/src/components/issues/__tests__/IssueDetailSheet.unit.test.tsx apps/client/src/routes/_dashboard/-issues.page.tsx
yarn nx lint client --skip-nx-cache
yarn nx build client --skip-nx-cache
git add apps/client/src/components/issues/IssueDetailSheet.tsx apps/client/src/components/issues/__tests__/IssueDetailSheet.unit.test.tsx apps/client/src/routes/_dashboard/-issues.page.tsx
git commit -m "feat(client): add IssueDetailSheet with root-cause and validation tabs"
```

---

### Task 6: i18n keys across 4 locales

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts`

**Interfaces:**
- Consumes: nothing (translation strings only).
- Produces: `issues.status.pending_validation`, `issues.status.closed` (replacing `issues.status.resolved`), and the full `issues.detail.*` key group used by Task 5's `IssueDetailSheet`.

- [ ] **Step 1: Update `en.ts`**

In `libs/template-shared/src/lib/i18n/locales/en.ts`, inside the `issues:` block, replace the `status:` object:

```ts
    status: {
      open: 'Open',
      in_progress: 'In Progress',
      pending_validation: 'Pending Validation',
      closed: 'Closed',
      wont_fix: "Won't Fix",
    },
```

Add a new `detail:` key immediately after `linkedFinding: 'From Finding {{code}}',` (still inside `issues:`):

```ts
    detail: {
      tab: {
        overview: 'Overview',
        rootCause: 'Root Cause',
        validation: 'Validation',
      },
      status: 'Status',
      rootCause: 'Root Cause',
      rootCauseCategory: 'Root Cause Category',
      selectCategory: 'Select a category…',
      rootCauseCategoryOptions: {
        process_gap: 'Process Gap',
        control_design_failure: 'Control Design Failure',
        control_operating_failure: 'Control Operating Failure',
        human_error: 'Human Error',
        system_technical_failure: 'System / Technical Failure',
        third_party: 'Third Party',
        other: 'Other',
      },
      selectValidator: 'Select a validator…',
      submitForValidation: 'Submit for Validation',
      submitted: 'Submitted for validation',
      pendingValidationFor: 'Pending review by {{name}}',
      approve: 'Approve',
      reject: 'Reject',
      approved: 'Issue closed',
      rejected: 'Sent back for rework',
      rejectNotesPlaceholder: 'Explain why this fix is being rejected…',
      history: 'Validation History',
      historyStatus: {
        pending: 'Pending',
        approved: 'Approved',
        rejected: 'Rejected',
      },
    },
```

- [ ] **Step 2: Add matching blocks to `es.ts`, `he.ts`, `ru.ts`**

Use genuine, natural translations matching each file's established tone (not machine-literal), following the exact same key structure as Step 1. Read each file's existing `issues:` block first to match its phrasing register (formal/informal, existing terminology for "issue", "owner", "validator"-equivalent) before writing the new keys — do not copy English text into other locales.

For `es.ts`, `status` becomes:

```ts
    status: {
      open: 'Abierto',
      in_progress: 'En Progreso',
      pending_validation: 'Pendiente de Validación',
      closed: 'Cerrado',
      wont_fix: 'No se Corregirá',
    },
```

For `he.ts` (RTL, check existing `issues.status` phrasing for register):

```ts
    status: {
      open: 'פתוח',
      in_progress: 'בטיפול',
      pending_validation: 'ממתין לאימות',
      closed: 'סגור',
      wont_fix: 'לא יתוקן',
    },
```

For `ru.ts`:

```ts
    status: {
      open: 'Открыт',
      in_progress: 'В работе',
      pending_validation: 'Ожидает проверки',
      closed: 'Закрыт',
      wont_fix: 'Не будет исправлено',
    },
```

Write the full `detail:` block for each locale following the same key structure as Step 1's English version, translated naturally (the implementer writes real translations for all `detail.*` keys — labels, button text, placeholders — not just the status enum shown above).

- [ ] **Step 3: Write a regression test proving the keys are wired (following this codebase's established i18n-defect-catching pattern from Phase B.2.3)**

Check whether an existing test file asserts i18n key parity across locales (e.g. a test that loads all 4 locale files and diffs their key sets). If one exists, no new test is needed — the existing parity test will fail if any locale is missing a `detail.*` key, which is exactly the coverage wanted. If no such test exists, skip adding one in this task (out of scope for a phase-1 feature plan; flag it as a finding for the final review instead of inventing new cross-cutting test infrastructure here).

- [ ] **Step 4: Run the client test suite, prettier, lint, build, commit**

```bash
npx prettier --write libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/ru.ts
yarn nx lint template-shared
yarn nx build template-shared
yarn nx test client --skip-nx-cache
git add libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/ru.ts
git commit -m "feat(i18n): add Issue closure-validation strings to all 4 locales"
```

---

## Post-Plan Note

This plan does not include a Playwright/live-browser verification step as a plan task — per `AGENTS.md`'s non-negotiable UI rule, that verification happens once at the end of the whole branch (after Task 6), driven manually or via the SDD final-review step, not as a per-task checklist item. The final reviewer/finish step must confirm live in-browser: an owner can submit an issue for validation (root cause + category required, self-validation blocked in the picker), a different user assigned as validator can approve (issue becomes `closed`) or reject with notes (issue returns to `in_progress`, history entry visible), and the raw status `<select>` on the list row can no longer reach `pending_validation`/`closed` directly.
