# Policy Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Policy the same 5-state governance lifecycle (Draft → Review → Approved → Published → Superseded) that Standards already has (minus `superseded`), by widening the shared `WorkflowStatus`/`WorkflowTransition` machinery and adding a real per-transition history via the existing `framework_activities` pattern.

**Architecture:** Widen shared types in `libs/shared/src/strategies/notes.ts` (used today only by Standards) to 5 states. Give Policy its own `transitionPolicyWorkflow` strategy method (separate from Standards' `transitionWorkflow` — different table, adds a self-approval guard Standards doesn't have) that writes to `framework_activities` (widened a 5th time with a `policy_id` column, mirroring the Asset widening from PR #60). New gateway routes are org-scoped from day one. Client gets Policy-local `WorkflowBadge`/`WorkflowBar` components (own copies, not shared with Standards' — see spec's "Why two copies").

**Tech Stack:** NestJS gateway (`apps/api`) + notes microservice (`apps/microservices/notes`, TCP transport) + Supabase Postgres + React/Vite client (`apps/client`) + shadcn UI + Vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-policy-lifecycle-design.md`

## Global Constraints

- `WorkflowStatus`/`WorkflowTransition`/`WORKFLOW_TRANSITIONS`/`ADMIN_TRANSITIONS` are shared types/constants reused by both Standards and Policy — widened once, not duplicated.
- Policy gets its **own** `transitionPolicyWorkflow` method, separate from Standards' `transitionWorkflow`. No generic cross-resource dispatcher.
- Self-approval guard (`policy.userId === callerId` on `approve`/`publish`/`supersede` → `policy_self_approval_forbidden`) applies **only** to Policy's new method. Standards' existing `transitionWorkflow` is not touched — it keeps its current behavior exactly, including its existing `logAuditEvent` call.
- History is recorded via `framework_activities` (5th nullable FK column: `policy_id`), exact same widening pattern as PR #60's `asset_id` column — not a new table, not the global `audit_logs` table.
- New gateway routes get `checkOrgAccess` from day one (Policy's other 10 existing routes stay unguarded — out of scope, tracked separately as Phase 2 hardening).
- `PolicyPatch` loses its `status` field entirely — workflow state can only change through the new transition endpoint, never through the generic PATCH.
- No shared `WorkflowBadge`/`WorkflowBar` component extraction — Policy gets its own local copies in `policies.tsx`/`policies_.$id.tsx`, own i18n namespace (`policies.workflow.*`), following the exact visual/structural shape of Standards' local copies but not importing them.
- Widening `WorkflowStatus`/`WorkflowTransition` to 5 members breaks TypeScript compilation on every existing `Record<WorkflowStatus, ...>` / `Record<WorkflowTransition, ...>` in Standards' own client code (they must list every union member) — these need a minimal `superseded`/`supersede` entry added so they compile, **without** adding any new UI affordance to Standards (per spec, Standards' UI stays as-is). Confirmed exhaustive list (grepped, no others exist): `standards.tsx:WORKFLOW_COLOR`, `standards.$id.tsx:WORKFLOW_STEP_COLOR`, `standards.$id.tsx:TRANSITION_FOR_STATUS`, `standards.$id.tsx:SNAPSHOT_WORKFLOW_COLOR`.
- Post-coding routine before every commit: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>`.

---

### Task 1: Widen shared workflow types + fix Standards' exhaustive Records + Standards DB constraint

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts:379-392` (types/constants)
- Modify: `apps/client/src/routes/_dashboard/standards.tsx:42-47` (`WORKFLOW_COLOR`)
- Modify: `apps/client/src/routes/_dashboard/standards.$id.tsx:38-51,169-174` (`WORKFLOW_STEP_COLOR`, `TRANSITION_FOR_STATUS`, `SNAPSHOT_WORKFLOW_COLOR`)
- Create: `supabase/migrations/20260916000004_workflow_superseded.sql`

**Interfaces:**
- Produces: `WorkflowStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'superseded'`, `WorkflowTransition = 'submit' | 'approve' | 'reject' | 'publish' | 'supersede'`, `WORKFLOW_TRANSITIONS` (5 entries), `ADMIN_TRANSITIONS` (4 entries) — all later tasks import these.

- [ ] **Step 1: Widen the shared types**

In `libs/shared/src/strategies/notes.ts`, replace lines 379-392:

```ts
export type WorkflowStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'superseded';
export type WorkflowTransition = 'submit' | 'approve' | 'reject' | 'publish' | 'supersede';

export const WORKFLOW_TRANSITIONS: Record<
  WorkflowTransition,
  { from: WorkflowStatus; to: WorkflowStatus }
> = {
  submit: { from: 'draft', to: 'in_review' },
  approve: { from: 'in_review', to: 'approved' },
  reject: { from: 'in_review', to: 'draft' },
  publish: { from: 'approved', to: 'published' },
  supersede: { from: 'published', to: 'superseded' },
};

export const ADMIN_TRANSITIONS: WorkflowTransition[] = ['approve', 'reject', 'publish', 'supersede'];
```

- [ ] **Step 2: Run the build to find every compile break from the widened union**

```bash
yarn nx build shared
yarn nx build client
```

Expected: `client` build fails with "Property 'superseded' is missing" (or similar) on the 4 Records listed in Global Constraints above. `shared` build should pass (nothing else in `libs/shared` has an exhaustive Record over these types).

- [ ] **Step 3: Fix `standards.tsx`'s `WORKFLOW_COLOR`**

In `apps/client/src/routes/_dashboard/standards.tsx`, change:

```ts
const WORKFLOW_COLOR: Record<WorkflowStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  in_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  published: 'bg-green-500/10 text-green-500 border-green-500/20',
};
```

to (adding one line, everything else unchanged):

```ts
const WORKFLOW_COLOR: Record<WorkflowStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  in_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  published: 'bg-green-500/10 text-green-500 border-green-500/20',
  superseded: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};
```

- [ ] **Step 4: Fix `standards.$id.tsx`'s three exhaustive Records**

In `apps/client/src/routes/_dashboard/standards.$id.tsx`, change:

```ts
const WORKFLOW_STEP_COLOR: Record<WorkflowStatus, string> = {
  draft: 'text-muted-foreground',
  in_review: 'text-amber-400',
  approved: 'text-blue-400',
  published: 'text-green-500',
};
```

to:

```ts
const WORKFLOW_STEP_COLOR: Record<WorkflowStatus, string> = {
  draft: 'text-muted-foreground',
  in_review: 'text-amber-400',
  approved: 'text-blue-400',
  published: 'text-green-500',
  superseded: 'text-slate-400',
};
```

Change:

```ts
const TRANSITION_FOR_STATUS: Record<WorkflowStatus, WorkflowTransition | null> = {
  draft: 'submit',
  in_review: 'approve',
  approved: 'publish',
  published: null,
};
```

to (Standards' UI does not expose a way to reach `superseded` — this keeps `published` terminal exactly as before, and marks `superseded` terminal too; no new button appears anywhere in Standards' UI):

```ts
const TRANSITION_FOR_STATUS: Record<WorkflowStatus, WorkflowTransition | null> = {
  draft: 'submit',
  in_review: 'approve',
  approved: 'publish',
  published: null,
  superseded: null,
};
```

Change:

```ts
const SNAPSHOT_WORKFLOW_COLOR: Record<WorkflowStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  in_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  published: 'bg-green-500/10 text-green-500 border-green-500/20',
};
```

to:

```ts
const SNAPSHOT_WORKFLOW_COLOR: Record<WorkflowStatus, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  in_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  published: 'bg-green-500/10 text-green-500 border-green-500/20',
  superseded: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};
```

Do **not** add `'superseded'` to the `WORKFLOW_STEPS: WorkflowStatus[]` array (line 34, `['draft', 'in_review', 'approved', 'published']`) — that array drives the visible stepper UI and is a plain array, not a Record, so it does not need every union member. Leaving it at 4 entries is the correct way to keep Standards' UI unchanged per the spec.

- [ ] **Step 5: Re-run the build to confirm the fix**

```bash
yarn nx build shared
yarn nx build client
```

Expected: both pass.

- [ ] **Step 6: Write the Standards DB migration**

Create `supabase/migrations/20260916000004_workflow_superseded.sql`:

```sql
-- Widen the workflow_status check constraint on generated_standards and
-- standards_snapshots to include 'superseded', added as part of the Policy
-- lifecycle feature (Policy reuses this same WorkflowStatus type).
alter table public.generated_standards drop constraint if exists generated_standards_workflow_status_check;
alter table public.generated_standards
  add constraint generated_standards_workflow_status_check
  check (workflow_status in ('draft','in_review','approved','published','superseded'));

alter table public.standards_snapshots drop constraint if exists standards_snapshots_workflow_status_check;
alter table public.standards_snapshots
  add constraint standards_snapshots_workflow_status_check
  check (workflow_status in ('draft','in_review','approved','published','superseded'));
```

Before writing this, confirm the exact existing constraint names by reading `supabase/migrations/20260606000003_workflow_and_snapshots.sql` — if the constraint was created inline without an explicit name (Postgres auto-names it `<table>_<column>_check`), use that auto-generated name in the `drop constraint if exists` line (matches the names used above, but verify against the actual file before committing).

- [ ] **Step 7: Run lint and full build**

```bash
npx prettier --write libs/shared/src/strategies/notes.ts apps/client/src/routes/_dashboard/standards.tsx "apps/client/src/routes/_dashboard/standards.\$id.tsx"
yarn nx lint shared
yarn nx lint client
yarn nx build shared
yarn nx build client
```

- [ ] **Step 8: Commit**

```bash
git add libs/shared/src/strategies/notes.ts apps/client/src/routes/_dashboard/standards.tsx "apps/client/src/routes/_dashboard/standards.\$id.tsx" supabase/migrations/20260916000004_workflow_superseded.sql
git commit -m "feat(workflow): widen shared WorkflowStatus/WorkflowTransition to 5 states"
```

---

### Task 2: Rename Policy's status field to workflowStatus

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts:1045-1072` (types)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts:4774-4801` (`createPolicy`, `updatePolicy`)
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts:3662-3699,3776-3789` (`createPolicy`, `updatePolicy`, `toPolicy`)
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts:1549-1611` (existing Policy tests)
- Create: `supabase/migrations/20260916000005_policy_workflow_status.sql`

**Interfaces:**
- Consumes: `WorkflowStatus` from Task 1.
- Produces: `Policy.workflowStatus: WorkflowStatus` (renamed from `status: PolicyStatus`), `PolicyPatch` with `status` removed. `PolicyStatus` type deleted.

- [ ] **Step 1: Update the type definitions**

In `libs/shared/src/strategies/notes.ts`, replace lines 1045-1072:

```ts
// ─── Policies ──────────────────────────────────────────────────────────────

export interface Policy {
  id: string;
  orgId: string;
  userId: string;
  frameworkId: string;
  title: string;
  content: string;
  workflowStatus: WorkflowStatus;
  version: number;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyInput {
  frameworkId: string;
  title: string;
  content: string;
  templateId?: string;
}

export interface PolicyPatch {
  title?: string;
  content?: string;
}
```

(`PolicyStatus` type is deleted entirely — it's no longer referenced.)

- [ ] **Step 2: Update the Fake strategy's `createPolicy`/`updatePolicy`**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, in `createPolicy` (around line 4774), change:

```ts
      status: 'draft',
```

to:

```ts
      workflowStatus: 'draft',
```

`updatePolicy` (around line 4796) needs no changes — it already does `{ ...this.policies[idx], ...patch, updatedAt: ... }` and `patch` no longer has a `status` field to spread, so nothing extra to do there; the generic spread already stops touching workflow state automatically once `PolicyPatch` no longer has that field.

- [ ] **Step 3: Update the Supabase strategy**

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, `createPolicy` (around line 3662) currently does not set a status column on insert at all (DB default `'draft'` handles it) — no change needed there, but the column name itself changes because of the migration in Step 5 below, so **no code change is needed in `createPolicy`'s insert** (it never referenced `status` explicitly).

`updatePolicy` (around line 3684) currently has:

```ts
  async updatePolicy(id: string, patch: PolicyPatch): Promise<Policy> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.status !== undefined) update['status'] = patch.status;
    if (patch.content !== undefined) {
```

Remove the `patch.status` line entirely:

```ts
  async updatePolicy(id: string, patch: PolicyPatch): Promise<Policy> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.content !== undefined) {
```

`toPolicy` (around line 3776) currently has:

```ts
      status: row['status'] as Policy['status'],
```

Change to:

```ts
      workflowStatus: row['workflow_status'] as Policy['workflowStatus'],
```

- [ ] **Step 4: Update the existing contract tests**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, in the `describe('policies', ...)` block:

Change:

```ts
  it('creates policy with draft status', async () => {
    const p = await s.createPolicy('org1', 'u1', {
      frameworkId: 'fw1',
      title: 'Access Control Policy',
      content: '# Access Control\n\nAll systems require MFA.',
    });
    expect(p.status).toBe('draft');
    expect(p.version).toBe(1);
  });

  it('approves policy', async () => {
    const p = await s.createPolicy('org1', 'u1', {
      frameworkId: 'fw1',
      title: 'T',
      content: 'C',
    });
    const approved = await s.updatePolicy(p.id, { status: 'approved' });
    expect(approved.status).toBe('approved');
  });
```

to:

```ts
  it('creates policy in draft workflow status', async () => {
    const p = await s.createPolicy('org1', 'u1', {
      frameworkId: 'fw1',
      title: 'Access Control Policy',
      content: '# Access Control\n\nAll systems require MFA.',
    });
    expect(p.workflowStatus).toBe('draft');
    expect(p.version).toBe(1);
  });
```

(The old "approves policy" test moves to Task 4, rewritten to use the new `transitionPolicyWorkflow` method instead of the removed `updatePolicy({ status: ... })` path — do not leave a test calling `updatePolicy` with a `status` field, it will no longer compile since `PolicyPatch` has no such field.)

Change:

```ts
  it('clones template into a new draft policy', async () => {
    const cloned = await s.cloneTemplate('org1', 'u1', 'tmpl-1');
    expect(cloned.templateId).toBe('tmpl-1');
    expect(cloned.status).toBe('draft');
    expect(cloned.content).toContain('SOC 2');
  });
```

to:

```ts
  it('clones template into a new draft policy', async () => {
    const cloned = await s.cloneTemplate('org1', 'u1', 'tmpl-1');
    expect(cloned.templateId).toBe('tmpl-1');
    expect(cloned.workflowStatus).toBe('draft');
    expect(cloned.content).toContain('SOC 2');
  });
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
yarn nx test shared
```

Expected: all pass (the "approves policy" test was removed here, not left broken — it's rewritten in Task 4 against the new method).

- [ ] **Step 6: Write the migration**

Create `supabase/migrations/20260916000005_policy_workflow_status.sql`:

```sql
-- Policy gains the same 5-state WorkflowStatus lifecycle Standards already
-- has, instead of its previous ad-hoc 2-value status column.
alter table public.policies rename column status to workflow_status;
alter table public.policies drop constraint if exists policies_status_check;
alter table public.policies
  add constraint policies_workflow_status_check
  check (workflow_status in ('draft','in_review','approved','published','superseded'));
-- Existing 'draft'/'approved' rows remain valid under the widened constraint; no backfill needed.
```

Before writing this, confirm the exact existing constraint name by reading `supabase/migrations/20260613000004_policies_templates.sql:40` — if unnamed inline, Postgres auto-names it `policies_status_check` (matches above), but verify.

- [ ] **Step 7: Run lint and build**

```bash
npx prettier --write libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
yarn nx lint shared
yarn nx lint notes
yarn nx build shared
yarn nx build notes
```

Expected: `apps/client` will **not** build yet — `policies.tsx`/`policies_.$id.tsx` still reference the old `Policy['status']`/`policy.status`. That's expected and fixed in Task 6; do not attempt to fix client code in this task.

- [ ] **Step 8: Commit**

```bash
git add libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts supabase/migrations/20260916000005_policy_workflow_status.sql
git commit -m "feat(policy): rename status to workflowStatus, reuse shared WorkflowStatus type"
```

---

### Task 3: Widen framework_activities for policyId + listPolicyActivity

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts` (add `policyId` to `FrameworkActivity`, add `listPolicyActivity` to the strategy interface)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts` (add `listPolicyActivity`)
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts` (add `listPolicyActivity`, update `toFrameworkActivity`)
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` (new test)
- Create: `supabase/migrations/20260916000006_policy_activity.sql`

**Interfaces:**
- Consumes: none from earlier tasks (independent of Task 1/2, could run in parallel, but sequenced after for a clean linear history).
- Produces: `FrameworkActivity.policyId?: string`, `listPolicyActivity(policyId: string): Promise<FrameworkActivity[]>` — Task 4's `transitionPolicyWorkflow` writes into this same table (via a private helper added in Task 4, not here).

- [ ] **Step 1: Add `policyId` to the `FrameworkActivity` interface**

In `libs/shared/src/strategies/notes.ts`, find:

```ts
export interface FrameworkActivity {
  id: string;
  frameworkId?: string;
  controlId?: string;
  assetId?: string;
  action: string;
  details: string;
  actor: string;
  timestamp: string;
}
```

Change to:

```ts
export interface FrameworkActivity {
  id: string;
  frameworkId?: string;
  controlId?: string;
  assetId?: string;
  policyId?: string;
  action: string;
  details: string;
  actor: string;
  timestamp: string;
}
```

Find `listAssetActivity(assetId: string): Promise<FrameworkActivity[]>;` in the strategy interface and add directly after it:

```ts
  listPolicyActivity(policyId: string): Promise<FrameworkActivity[]>;
```

- [ ] **Step 2: Write the failing test**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, in the `describe('policies', ...)` block, add after the "creates policy in draft workflow status" test:

```ts
  it('lists activity scoped to one policy', async () => {
    const p1 = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'A', content: 'C' });
    const p2 = await s.createPolicy('org1', 'u1', { frameworkId: 'fw1', title: 'B', content: 'C' });
    expect(await s.listPolicyActivity(p1.id)).toHaveLength(0);
    expect(await s.listPolicyActivity(p2.id)).toHaveLength(0);
  });
```

- [ ] **Step 3: Run test to verify it fails**

```bash
yarn nx test shared -t "lists activity scoped to one policy"
```

Expected: FAIL — `s.listPolicyActivity is not a function`.

- [ ] **Step 4: Implement in the Fake strategy**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, find `async listAssetActivity(assetId: string): Promise<FrameworkActivity[]> {` and add directly after its closing brace:

```ts
  async listPolicyActivity(policyId: string): Promise<FrameworkActivity[]> {
    return this.activities.filter((a) => a.policyId === policyId);
  }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
yarn nx test shared -t "lists activity scoped to one policy"
```

Expected: PASS (empty arrays returned, since nothing writes to this table yet — Task 4 adds the writer).

- [ ] **Step 6: Implement in the Supabase strategy**

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, find `async listAssetActivity(assetId: string): Promise<FrameworkActivity[]> {` and add directly after its closing brace:

```ts
  async listPolicyActivity(policyId: string): Promise<FrameworkActivity[]> {
    const { data, error } = await this.db
      .from('framework_activities')
      .select('*')
      .eq('policy_id', policyId)
      .order('timestamp', { ascending: false });
    return ok(data, error).map((row) => this.toFrameworkActivity(row));
  }
```

Find `toFrameworkActivity` and add `policyId` to the mapping:

```ts
  private toFrameworkActivity(row: Record<string, unknown>): FrameworkActivity {
    return {
      id: row['id'] as string,
      frameworkId: row['framework_id'] as string | undefined,
      controlId: row['control_id'] as string | undefined,
      assetId: row['asset_id'] as string | undefined,
      policyId: row['policy_id'] as string | undefined,
      action: row['action'] as string,
      details: row['details'] as string,
      actor: row['actor'] as string,
      timestamp: row['timestamp'] as string,
    };
  }
```

- [ ] **Step 7: Write the migration**

Create `supabase/migrations/20260916000006_policy_activity.sql`:

```sql
-- Policy gains a real per-transition activity trail, same pattern as the
-- asset_id widening in 20260916000003_asset_activity.sql.
alter table public.framework_activities
  add column policy_id uuid references public.policies(id) on delete cascade;

alter table public.framework_activities drop constraint if exists framework_activities_check;
alter table public.framework_activities
  add constraint framework_activities_check
  check (
    framework_id is not null
    or control_id is not null
    or asset_id is not null
    or policy_id is not null
  );

create index framework_activities_policy_idx on public.framework_activities(policy_id);

drop policy if exists "org members read activities" on public.framework_activities;

create policy "org members read activities"
  on public.framework_activities for select using (
    (control_id is null and asset_id is null and policy_id is null)
    or exists (
      select 1 from public.internal_controls c
      join public.org_profiles o on o.id = c.org_id
      where c.id = control_id and o.user_id = auth.uid()
    )
    or exists (
      select 1 from public.assets a
      join public.org_profiles o on o.id = a.org_id
      where a.id = asset_id and o.user_id = auth.uid()
    )
    or exists (
      select 1 from public.policies p
      join public.org_profiles o on o.id = p.org_id
      where p.id = policy_id and o.user_id = auth.uid()
    )
  );
```

Before writing the `drop policy`/`create policy` block, read the current RLS policy body from `supabase/migrations/20260916000003_asset_activity.sql` to confirm the exact existing branch structure you're extending (it already has `control_id`/`asset_id` branches from the two prior widenings — add the `policy_id` branch alongside them exactly as shown above).

- [ ] **Step 8: Run tests, lint, build**

```bash
yarn nx test shared
npx prettier --write libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
yarn nx lint shared
yarn nx lint notes
yarn nx build shared
yarn nx build notes
```

- [ ] **Step 9: Commit**

```bash
git add libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts supabase/migrations/20260916000006_policy_activity.sql
git commit -m "feat(policy): widen framework_activities for policy-scoped activity history"
```

---

### Task 4: transitionPolicyWorkflow with self-approval guard

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts` (interface method)
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

**Interfaces:**
- Consumes: `WORKFLOW_TRANSITIONS`, `ADMIN_TRANSITIONS`, `WorkflowTransition` (Task 1); `Policy.workflowStatus` (Task 2); `listPolicyActivity`/`policyId` on `FrameworkActivity` (Task 3, for verifying writes in tests).
- Produces: `transitionPolicyWorkflow(id: string, transition: WorkflowTransition, userId: string): Promise<Policy>` — Task 5's gateway route and MS handler call this.

- [ ] **Step 1: Add the interface method**

In `libs/shared/src/strategies/notes.ts`, find the `updatePolicy`/`deletePolicy` interface declarations near the Policy section and add directly after `deletePolicy(id: string): Promise<void>;`:

```ts
  transitionPolicyWorkflow(
    id: string,
    transition: WorkflowTransition,
    userId: string,
  ): Promise<Policy>;
```

- [ ] **Step 2: Write the failing tests**

In `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`, in the `describe('policies', ...)` block, add:

```ts
  it('transitions through the full lifecycle and records activity', async () => {
    const p = await s.createPolicy('org1', 'author-1', {
      frameworkId: 'fw1',
      title: 'Access Control Policy',
      content: 'C',
    });
    const submitted = await s.transitionPolicyWorkflow(p.id, 'submit', 'author-1');
    expect(submitted.workflowStatus).toBe('in_review');

    const approved = await s.transitionPolicyWorkflow(p.id, 'approve', 'reviewer-1');
    expect(approved.workflowStatus).toBe('approved');

    const published = await s.transitionPolicyWorkflow(p.id, 'publish', 'reviewer-1');
    expect(published.workflowStatus).toBe('published');

    const superseded = await s.transitionPolicyWorkflow(p.id, 'supersede', 'reviewer-1');
    expect(superseded.workflowStatus).toBe('superseded');

    const activity = await s.listPolicyActivity(p.id);
    expect(activity.map((a) => a.action)).toEqual([
      'Superseded',
      'Published',
      'Approved',
      'Submitted for Review',
    ]);
    expect(activity.every((a) => a.policyId === p.id)).toBe(true);
  });

  it('rejects a transition from the wrong starting state', async () => {
    const p = await s.createPolicy('org1', 'author-1', {
      frameworkId: 'fw1',
      title: 'T',
      content: 'C',
    });
    await expect(s.transitionPolicyWorkflow(p.id, 'publish', 'author-1')).rejects.toThrow(
      'invalid_transition',
    );
  });

  it('forbids the policy author from approving their own policy', async () => {
    const p = await s.createPolicy('org1', 'author-1', {
      frameworkId: 'fw1',
      title: 'T',
      content: 'C',
    });
    await s.transitionPolicyWorkflow(p.id, 'submit', 'author-1');
    await expect(s.transitionPolicyWorkflow(p.id, 'approve', 'author-1')).rejects.toThrow(
      'policy_self_approval_forbidden',
    );
  });

  it('forbids the policy author from publishing or superseding their own policy', async () => {
    const p = await s.createPolicy('org1', 'author-1', {
      frameworkId: 'fw1',
      title: 'T',
      content: 'C',
    });
    await s.transitionPolicyWorkflow(p.id, 'submit', 'author-1');
    await s.transitionPolicyWorkflow(p.id, 'approve', 'reviewer-1');
    await expect(s.transitionPolicyWorkflow(p.id, 'publish', 'author-1')).rejects.toThrow(
      'policy_self_approval_forbidden',
    );
    const published = await s.transitionPolicyWorkflow(p.id, 'publish', 'reviewer-1');
    expect(published.workflowStatus).toBe('published');
    await expect(s.transitionPolicyWorkflow(p.id, 'supersede', 'author-1')).rejects.toThrow(
      'policy_self_approval_forbidden',
    );
  });

  it('allows the author to submit and reject-resubmit their own policy', async () => {
    const p = await s.createPolicy('org1', 'author-1', {
      frameworkId: 'fw1',
      title: 'T',
      content: 'C',
    });
    await s.transitionPolicyWorkflow(p.id, 'submit', 'author-1');
    const rejected = await s.transitionPolicyWorkflow(p.id, 'reject', 'reviewer-1');
    expect(rejected.workflowStatus).toBe('draft');
    const resubmitted = await s.transitionPolicyWorkflow(p.id, 'submit', 'author-1');
    expect(resubmitted.workflowStatus).toBe('in_review');
  });
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
yarn nx test shared -t "transitions through the full lifecycle"
```

Expected: FAIL — `s.transitionPolicyWorkflow is not a function`.

- [ ] **Step 4: Implement in the Fake strategy**

In `libs/shared/src/strategies/fakes/fake-notes.ts`, add directly after `deletePolicy`:

```ts
  private policyActivityLabel(transition: WorkflowTransition): string {
    const labels: Record<WorkflowTransition, string> = {
      submit: 'Submitted for Review',
      approve: 'Approved',
      reject: 'Rejected',
      publish: 'Published',
      supersede: 'Superseded',
    };
    return labels[transition];
  }

  async transitionPolicyWorkflow(
    id: string,
    transition: WorkflowTransition,
    userId: string,
  ): Promise<Policy> {
    const idx = this.policies.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('policy_not_found');
    const policy = this.policies[idx]!;
    const { from, to } = WORKFLOW_TRANSITIONS[transition];
    if (policy.workflowStatus !== from) {
      throw new Error(`invalid_transition: ${policy.workflowStatus} -> ${transition}`);
    }
    if (ADMIN_TRANSITIONS.includes(transition) && policy.userId === userId) {
      throw new Error('policy_self_approval_forbidden');
    }
    const updated: Policy = { ...policy, workflowStatus: to, updatedAt: new Date().toISOString() };
    this.policies[idx] = updated;
    this.activities.unshift({
      id: globalThis.crypto.randomUUID(),
      policyId: id,
      action: this.policyActivityLabel(transition),
      details: `Policy "${policy.title}" moved from ${from} to ${to}.`,
      actor: userId,
      timestamp: updated.updatedAt,
    });
    return updated;
  }
```

Add the import for `WORKFLOW_TRANSITIONS`/`ADMIN_TRANSITIONS`/`WorkflowTransition` at the top of the file if not already imported from `../notes` (check the existing import block — `WorkflowStatus` may already be imported for `StandardsDocument` handling; add the three new names to that same import line).

- [ ] **Step 5: Run tests to verify they pass**

```bash
yarn nx test shared -t "policies"
```

Expected: PASS — all 5 new tests plus the existing ones in the `describe('policies', ...)` block.

- [ ] **Step 6: Implement in the Supabase strategy**

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, add directly after `deletePolicy`:

```ts
  private policyActivityLabel(transition: WorkflowTransition): string {
    const labels: Record<WorkflowTransition, string> = {
      submit: 'Submitted for Review',
      approve: 'Approved',
      reject: 'Rejected',
      publish: 'Published',
      supersede: 'Superseded',
    };
    return labels[transition];
  }

  async transitionPolicyWorkflow(
    id: string,
    transition: WorkflowTransition,
    userId: string,
  ): Promise<Policy> {
    const policy = await this.getPolicy(id);
    if (!policy) throw new Error('policy_not_found');
    const { from, to } = WORKFLOW_TRANSITIONS[transition];
    if (policy.workflowStatus !== from) {
      throw new Error(`invalid_transition: ${policy.workflowStatus} -> ${transition}`);
    }
    if (ADMIN_TRANSITIONS.includes(transition) && policy.userId === userId) {
      throw new Error('policy_self_approval_forbidden');
    }
    const { data, error } = await this.db
      .from('policies')
      .update({ workflow_status: to, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    const updated = this.toPolicy(ok(data, error));
    await this.db.from('framework_activities').insert({
      policy_id: id,
      action: this.policyActivityLabel(transition),
      details: `Policy "${policy.title}" moved from ${from} to ${to}.`,
      actor: userId,
    });
    return updated;
  }
```

Add `WORKFLOW_TRANSITIONS`, `ADMIN_TRANSITIONS`, `WorkflowTransition` to this file's existing import from `@icore/shared` (it already imports `WorkflowStatus`/`WorkflowTransition` for the Standards `transitionWorkflow` method above — add the two constants to that same import line if not already present).

- [ ] **Step 7: Run lint and build**

```bash
yarn nx test shared
npx prettier --write libs/shared/src/strategies/fakes/fake-notes.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts libs/shared/src/strategies/notes.ts
yarn nx lint shared
yarn nx lint notes
yarn nx build shared
yarn nx build notes
```

- [ ] **Step 8: Commit**

```bash
git add libs/shared/src/strategies/notes.ts libs/shared/src/strategies/fakes/fake-notes.ts apps/microservices/notes/src/app/supabase-notes.strategy.ts libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "feat(policy): add transitionPolicyWorkflow with self-approval guard and activity log"
```

---

### Task 5: MS handler, notes-client, gateway routes

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`
- Modify: `apps/api/src/app/notes/notes.controller.ts`
- Modify: `apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts` (or create a dedicated `policies.controller.unit.test.ts` if the existing gateway test file has a clear per-resource split — check which convention the file already follows before deciding; Exceptions/Assets/Risks each got their own test file, e.g. `exceptions.controller.unit.test.ts`, so create `apps/api/src/app/notes/__tests__/policies.controller.unit.test.ts` following that same convention)

**Interfaces:**
- Consumes: `transitionPolicyWorkflow`, `listPolicyActivity` (Task 3+4).
- Produces: `notes.transitionPolicyWorkflow(id, transition, userId)`, `notes.listPolicyActivity(id)` on the gateway's injected `NotesClientService`; gateway routes `PATCH /notes/policies/:id/workflow` and `GET /notes/policies/:id/activity`.

- [ ] **Step 1: Add MS `@MessagePattern` handlers**

In `apps/microservices/notes/src/app/notes.controller.ts`, find the `// ─── Policies ───` section and add after the existing `cloneTemplate` handler:

```ts
  @MessagePattern('notes.policies.transition-workflow')
  transitionPolicyWorkflow(
    @Payload() p: { id: string; transition: WorkflowTransition; userId: string },
  ): Promise<Policy> {
    return this.strategy.transitionPolicyWorkflow(p.id, p.transition, p.userId);
  }

  @MessagePattern('notes.policies.activity.list')
  listPolicyActivity(@Payload() p: { policyId: string }): Promise<FrameworkActivity[]> {
    return this.strategy.listPolicyActivity(p.policyId);
  }
```

Add `WorkflowTransition` and `FrameworkActivity` to this file's existing `@icore/shared` type import if not already present (check the top-of-file import list — `Policy`, `PolicyInput`, `PolicyPatch` are already imported there per the existing Policy handlers; `FrameworkActivity` is already imported for `listControlActivity`/`listAssetActivity`).

- [ ] **Step 2: Add notes-client methods**

In `libs/notes-client/src/lib/notes-client.service.ts`, add directly after the existing `cloneTemplate` method:

```ts
  transitionPolicyWorkflow(
    id: string,
    transition: WorkflowTransition,
    userId: string,
  ): Promise<Policy> {
    return signedSend<Policy>(this.client, 'notes.policies.transition-workflow', {
      id,
      transition,
      userId,
    });
  }

  listPolicyActivity(policyId: string): Promise<FrameworkActivity[]> {
    return signedSend<FrameworkActivity[]>(this.client, 'notes.policies.activity.list', {
      policyId,
    });
  }
```

Add `WorkflowTransition` and `FrameworkActivity` to this file's existing `@icore/shared` type import (both are already imported for the Standards/Asset/Control activity methods above).

- [ ] **Step 3: Write the failing gateway test**

Create `apps/api/src/app/notes/__tests__/policies.controller.unit.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Request } from 'express';
import type { AiClientService } from '@icore/ai-client';
import type { NotesClientService } from '@icore/notes-client';
import type { Organization, Policy, VerifiedToken } from '@icore/shared';
import { NotesController } from '../notes.controller';
import { AbilityFactory } from '../../abilities/ability.factory';
import type { StandardsQueueService } from '../standards-queue.service';

const ORG: Organization = { id: 'org-1', userId: 'org-creator', name: 'Acme' } as unknown as Organization;

const POLICY: Policy = {
  id: 'policy-1',
  orgId: 'org-1',
  userId: 'author-1',
  frameworkId: 'fw-1',
  title: 'Access Control Policy',
  content: 'C',
  workflowStatus: 'in_review',
  version: 1,
  templateId: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
} as unknown as Policy;

function makeNotes(overrides: Partial<NotesClientService> = {}): NotesClientService {
  return {
    getOrganizationById: vi.fn().mockResolvedValue(ORG),
    getPolicy: vi.fn().mockResolvedValue(POLICY),
    transitionPolicyWorkflow: vi.fn().mockResolvedValue({ ...POLICY, workflowStatus: 'approved' }),
    listPolicyActivity: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as NotesClientService;
}

function makeController(notes: NotesClientService): NotesController {
  return new NotesController(
    notes,
    {} as unknown as AiClientService,
    new AbilityFactory(),
    {} as unknown as StandardsQueueService,
  );
}

function reqAs(uid: string): Request & { user?: VerifiedToken } {
  return { user: { uid } as VerifiedToken } as Request & { user?: VerifiedToken };
}

describe('NotesController — policy workflow org scoping', () => {
  describe('transitionPolicyWorkflow', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).transitionPolicyWorkflow(reqAs('outsider'), 'policy-1', {
          transition: 'approve',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(notes.transitionPolicyWorkflow).not.toHaveBeenCalled();
    });

    it('lets the org creator approve', async () => {
      const notes = makeNotes();
      await makeController(notes).transitionPolicyWorkflow(reqAs('org-creator'), 'policy-1', {
        transition: 'approve',
      });
      expect(notes.transitionPolicyWorkflow).toHaveBeenCalledWith(
        'policy-1',
        'approve',
        'org-creator',
      );
    });

    it('throws NotFound when the policy does not exist', async () => {
      const notes = makeNotes({ getPolicy: vi.fn().mockResolvedValue(null) });
      await expect(
        makeController(notes).transitionPolicyWorkflow(reqAs('org-creator'), 'missing', {
          transition: 'approve',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates the strategy-level self-approval guard unswallowed', async () => {
      const notes = makeNotes({
        transitionPolicyWorkflow: vi.fn().mockRejectedValue(new Error('policy_self_approval_forbidden')),
      });
      await expect(
        makeController(notes).transitionPolicyWorkflow(reqAs('org-creator'), 'policy-1', {
          transition: 'approve',
        }),
      ).rejects.toThrow('policy_self_approval_forbidden');
    });
  });

  describe('listPolicyActivity', () => {
    it('rejects a caller outside the org', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listPolicyActivity(reqAs('outsider'), 'policy-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows the org creator', async () => {
      const notes = makeNotes();
      await expect(
        makeController(notes).listPolicyActivity(reqAs('org-creator'), 'policy-1'),
      ).resolves.toEqual([]);
    });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
yarn nx test api -t "policy workflow org scoping"
```

Expected: FAIL — `makeController(notes).transitionPolicyWorkflow is not a function` (route doesn't exist yet).

- [ ] **Step 5: Add the gateway routes**

In `apps/api/src/app/notes/notes.controller.ts`, find `@Get('policies/:id')` (the existing `getPolicy` route) and add directly before it:

```ts
  @Patch('policies/:id/workflow')
  @ApiOperation({ summary: 'Transition a policy through its governance workflow' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['transition'],
      properties: {
        transition: {
          type: 'string',
          enum: ['submit', 'approve', 'reject', 'publish', 'supersede'],
        },
      },
    },
  })
  async transitionPolicyWorkflow(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { transition: WorkflowTransition },
  ) {
    const userId = this.uid(req);
    const policy = await this.notes.getPolicy(id);
    if (!policy) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(policy.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'update');
    return this.notes.transitionPolicyWorkflow(id, body.transition, userId);
  }

  @Get('policies/:id/activity')
  @ApiOperation({ summary: 'List activity log for a policy' })
  async listPolicyActivity(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    const policy = await this.notes.getPolicy(id);
    if (!policy) throw new NotFoundException();
    const org = await this.notes.getOrganizationById(policy.orgId);
    if (!org) throw new NotFoundException();
    this.checkOrgAccess(req, org, 'read');
    return this.notes.listPolicyActivity(id);
  }

```

Add `WorkflowTransition` to this file's existing `@icore/shared` type import (already imported for the Standards `transitionWorkflow` route above it in the same file).

- [ ] **Step 6: Run test to verify it passes**

```bash
yarn nx test api -t "policy workflow org scoping"
```

Expected: PASS.

- [ ] **Step 7: Run full test/lint/build**

```bash
yarn nx test api
npx prettier --write apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/policies.controller.unit.test.ts
yarn nx lint notes
yarn nx lint notes-client
yarn nx lint api
yarn nx build notes
yarn nx build notes-client
yarn nx build api
```

- [ ] **Step 8: Commit**

```bash
git add apps/microservices/notes/src/app/notes.controller.ts libs/notes-client/src/lib/notes-client.service.ts apps/api/src/app/notes/notes.controller.ts apps/api/src/app/notes/__tests__/policies.controller.unit.test.ts
git commit -m "feat(policy): wire transitionPolicyWorkflow and listPolicyActivity through gateway"
```

---

### Task 6: Client UI — WorkflowBadge, WorkflowBar, History, i18n

**Files:**
- Modify: `apps/client/src/queries/policies.ts`
- Modify: `apps/client/src/routes/_dashboard/policies.tsx`
- Modify: `apps/client/src/routes/_dashboard/policies_.$id.tsx`
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts`

**Interfaces:**
- Consumes: `transitionPolicyWorkflow`/`listPolicyActivity` gateway routes (Task 5); `WorkflowStatus`/`WorkflowTransition`/`ADMIN_TRANSITIONS` (Task 1); `Policy.workflowStatus` (Task 2).
- Produces: nothing consumed by later tasks (this is the final task).

- [ ] **Step 1: Add the i18n keys (all 4 locales)**

In `libs/template-shared/src/lib/i18n/locales/en.ts`, inside the `policies: { ... }` block, replace:

```ts
    status: {
      draft: 'Draft',
      approved: 'Approved',
    },
```

with:

```ts
    workflow: {
      draft: 'Draft',
      in_review: 'In Review',
      approved: 'Approved',
      published: 'Published',
      superseded: 'Superseded',
      submit: 'Submit for Review',
      approve: 'Approve',
      reject: 'Send Back',
      publish: 'Publish',
      supersede: 'Supersede',
      submitting: 'Submitting…',
      approving: 'Approving…',
      rejecting: 'Sending back…',
      publishing: 'Publishing…',
      superseding: 'Superseding…',
      desc: {
        draft: 'Work in progress, not yet reviewed',
        in_review: 'Pending approval from a reviewer',
        approved: 'Reviewed and accepted, ready to publish',
        published: 'Live and enforced across the organization',
        superseded: 'Replaced by a newer version',
      },
    },
```

Also add these two lines to the same `policies:` block (any line inside it, outside the `workflow:` sub-object):

```ts
    history: 'History',
    noActivity: 'No recorded activity for this policy.',
```

In `libs/template-shared/src/lib/i18n/locales/ru.ts`, find the `policies:` block's `status: { draft: '...', approved: '...' }` (or equivalent) and replace with:

```ts
    workflow: {
      draft: 'Черновик',
      in_review: 'На проверке',
      approved: 'Одобрено',
      published: 'Опубликовано',
      superseded: 'Заменено',
      submit: 'Отправить на проверку',
      approve: 'Одобрить',
      reject: 'Вернуть',
      publish: 'Опубликовать',
      supersede: 'Заменить',
      submitting: 'Отправка…',
      approving: 'Одобрение…',
      rejecting: 'Возврат…',
      publishing: 'Публикация…',
      superseding: 'Замена…',
      desc: {
        draft: 'В работе, ещё не проверялось',
        in_review: 'Ожидает проверки',
        approved: 'Проверено и принято, готово к публикации',
        published: 'Активно и применяется в организации',
        superseded: 'Заменено более новой версией',
      },
    },
```

Add these two lines to the same block:

```ts
    history: 'История',
    noActivity: 'Активность по этой политике не зафиксирована.',
```

In `libs/template-shared/src/lib/i18n/locales/es.ts`:

```ts
    workflow: {
      draft: 'Borrador',
      in_review: 'En revisión',
      approved: 'Aprobado',
      published: 'Publicado',
      superseded: 'Reemplazado',
      submit: 'Enviar a revisión',
      approve: 'Aprobar',
      reject: 'Devolver',
      publish: 'Publicar',
      supersede: 'Reemplazar',
      submitting: 'Enviando…',
      approving: 'Aprobando…',
      rejecting: 'Devolviendo…',
      publishing: 'Publicando…',
      superseding: 'Reemplazando…',
      desc: {
        draft: 'En curso, aún no revisado',
        in_review: 'Pendiente de aprobación',
        approved: 'Revisado y aceptado, listo para publicar',
        published: 'Vigente y aplicado en la organización',
        superseded: 'Reemplazado por una versión más nueva',
      },
    },
```

Add these two lines to the same block:

```ts
    history: 'Historial',
    noActivity: 'No hay actividad registrada para esta política.',
```

In `libs/template-shared/src/lib/i18n/locales/he.ts`:

```ts
    workflow: {
      draft: 'טיוטה',
      in_review: 'בבדיקה',
      approved: 'מאושר',
      published: 'פורסם',
      superseded: 'הוחלף',
      submit: 'שלח לבדיקה',
      approve: 'אשר',
      reject: 'החזר',
      publish: 'פרסם',
      supersede: 'החלף',
      submitting: 'שולח…',
      approving: 'מאשר…',
      rejecting: 'מחזיר…',
      publishing: 'מפרסם…',
      superseding: 'מחליף…',
      desc: {
        draft: 'בעבודה, טרם נבדק',
        in_review: 'ממתין לאישור',
        approved: 'נבדק ואושר, מוכן לפרסום',
        published: 'פעיל ומיושם בארגון',
        superseded: 'הוחלף בגרסה חדשה יותר',
      },
    },
```

Add these two lines to the same block:

```ts
    history: 'היסטוריה',
    noActivity: 'לא נרשמה פעילות עבור מדיניות זו.',
```

- [ ] **Step 2: Add client query hooks**

In `apps/client/src/queries/policies.ts`, add the `WorkflowTransition`/`FrameworkActivity` import and two new hooks after `useUpdatePolicy`:

```ts
import type {
  Policy,
  PolicyInput,
  PolicyPatch,
  PolicyTemplate,
  PolicyControl,
  PolicyControlInput,
  FrameworkActivity,
  WorkflowTransition,
} from '@icore/shared';
```

```ts
export function useTransitionPolicyWorkflow(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Policy, Error, WorkflowTransition>({
    mutationFn: (transition) =>
      api<Policy>(`/notes/policies/${id}/workflow`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transition }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['policies', orgId] });
      qc.invalidateQueries({ queryKey: ['policies', id] });
      qc.invalidateQueries({ queryKey: ['policies', id, 'activity'] });
    },
  });
}

export function usePolicyActivity(id: string) {
  return useQuery<FrameworkActivity[]>({
    queryKey: ['policies', id, 'activity'],
    queryFn: () => api<FrameworkActivity[]>(`/notes/policies/${id}/activity`),
    enabled: !!id,
  });
}
```

- [ ] **Step 3: Update the list page's badge**

In `apps/client/src/routes/_dashboard/policies.tsx`, find:

```ts
const STATUS_COLORS: Record<Policy['status'], string> = {
```

and its definition body (likely 2 entries for draft/approved), and the render call:

```tsx
                    className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${STATUS_COLORS[policy.status]}`}
                  >
                    {t(`policies.status.${policy.status}`)}
```

Replace the `STATUS_COLORS` constant with:

```ts
const WORKFLOW_COLOR: Record<Policy['workflowStatus'], string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  in_review: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  approved: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  published: 'bg-green-500/10 text-green-500 border-green-500/20',
  superseded: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};
```

and the render call to:

```tsx
                    className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${WORKFLOW_COLOR[policy.workflowStatus]}`}
                  >
                    {t(`policies.workflow.${policy.workflowStatus}`)}
```

- [ ] **Step 4: Replace the detail page's raw select with a WorkflowBar**

In `apps/client/src/routes/_dashboard/policies_.$id.tsx`, add these imports:

```ts
import { useIsAdmin } from '@icore/template-shared';
import { usePolicyActivity, useTransitionPolicyWorkflow } from '@/queries/policies';
import type { WorkflowStatus, WorkflowTransition } from '@icore/shared';
```

Add these two module-level constants above the `PolicyDetailPage` function (mirroring `standards.$id.tsx`'s shape exactly, but with the 5th state and Policy's own i18n namespace, defined once in this file — not imported from `standards.$id.tsx`):

```ts
const WORKFLOW_STEPS: WorkflowStatus[] = ['draft', 'in_review', 'approved', 'published', 'superseded'];

const WORKFLOW_STEP_COLOR: Record<WorkflowStatus, string> = {
  draft: 'text-muted-foreground',
  in_review: 'text-amber-400',
  approved: 'text-blue-400',
  published: 'text-green-500',
  superseded: 'text-slate-400',
};

const TRANSITION_FOR_STATUS: Record<WorkflowStatus, WorkflowTransition | null> = {
  draft: 'submit',
  in_review: 'approve',
  approved: 'publish',
  published: 'supersede',
  superseded: null,
};

const ADMIN_TRANSITIONS: WorkflowTransition[] = ['approve', 'reject', 'publish', 'supersede'];

function PolicyWorkflowBar({
  status,
  policyId,
  orgId,
  isAdmin,
}: {
  status: WorkflowStatus;
  policyId: string;
  orgId: string;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const transition = useTransitionPolicyWorkflow(orgId, policyId);

  const primaryTransition = TRANSITION_FOR_STATUS[status];
  const canPrimary =
    primaryTransition !== null && (isAdmin || !ADMIN_TRANSITIONS.includes(primaryTransition));

  function doTransition(tr: WorkflowTransition) {
    transition.mutate(tr);
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
      <div className="flex items-start">
        {WORKFLOW_STEPS.map((step, i) => {
          const stepIdx = WORKFLOW_STEPS.indexOf(step);
          const currentIdx = WORKFLOW_STEPS.indexOf(status);
          const done = stepIdx < currentIdx;
          const active = stepIdx === currentIdx;
          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div
                  className={`flex items-center justify-center w-6 h-6 rounded-full border-2 transition-colors ${
                    done
                      ? 'bg-green-500/20 border-green-500 text-green-500'
                      : active
                        ? `bg-transparent border-current ${WORKFLOW_STEP_COLOR[step]}`
                        : 'bg-transparent border-border text-border'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </div>
                <span
                  className={`text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                    active ? WORKFLOW_STEP_COLOR[step] : done ? 'text-green-500' : 'text-border'
                  }`}
                >
                  {t(`policies.workflow.${step}`)}
                </span>
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div
                  className={`flex-1 h-px mt-3 mx-2 transition-colors ${
                    done ? 'bg-green-500/40' : 'bg-border'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        {canPrimary && primaryTransition && (
          <Button
            size="sm"
            onClick={() => doTransition(primaryTransition)}
            disabled={transition.isPending}
            className="gap-1.5 h-7 text-xs"
          >
            {transition.isPending
              ? t(`policies.workflow.${primaryTransition}ing`)
              : t(`policies.workflow.${primaryTransition}`)}
          </Button>
        )}
        {status === 'in_review' && isAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => doTransition('reject')}
            disabled={transition.isPending}
            className="gap-1.5 h-7 text-xs"
          >
            {t('policies.workflow.reject')}
          </Button>
        )}
      </div>
    </div>
  );
}
```

(Note: `${primaryTransition}ing` string interpolation works for `submit→submitting`, `approve→approving`, `publish→publishing`, `supersede→superseding` — all 4 keys exist in the i18n files added in Step 1. `reject` never becomes `primaryTransition` under `TRANSITION_FOR_STATUS`, so no `rejecting`-via-interpolation path is needed for the primary button; the dedicated Reject button uses the static `policies.workflow.reject` key directly, matching Standards' exact pattern.)

Now replace the raw `<select>` block:

```tsx
          <select
            value={policy.status}
            onChange={(e) => updateMut.mutate({ status: e.target.value as 'draft' | 'approved' })}
            className="text-xs h-7 rounded border border-border bg-surface px-2 text-foreground focus:outline-none"
          >
            <option value="draft">{t('policies.status.draft')}</option>
            <option value="approved">{t('policies.status.approved')}</option>
          </select>
```

with nothing at that location (delete it) — the workflow bar (added below, in its own block) replaces this entirely; it doesn't belong inline with the other header buttons since it needs its own full-width row (matching Standards' page layout, where `WorkflowBar` renders as its own block above the action-button row, not inline with them).

Directly above the existing header `<div className="flex items-center justify-between ...">` block (the one currently containing the back-link and the raw `<select>`+buttons), add:

```tsx
      <PolicyWorkflowBar
        status={policy.workflowStatus}
        policyId={policy.id}
        orgId={orgId}
        isAdmin={useIsAdmin()}
      />
```

(If the linter flags calling `useIsAdmin()` inline as a hook-in-JSX-prop violation, hoist it to a `const isAdmin = useIsAdmin();` line near the top of `PolicyDetailPage` alongside the other hooks, and pass `isAdmin={isAdmin}` instead — check `yarn nx lint client`'s output after this step and apply whichever form it accepts.)

- [ ] **Step 5: Add the History section**

Directly after the "Linked Controls" block (`{controls.length > 0 && (...)}`) and before the `<Dialog open={previewOpen} ...>` block, add:

```tsx
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
          {t('policies.history')}
        </p>
        {activity.length === 0 ? (
          <div className="text-xs text-muted-foreground italic bg-muted/20 p-4 rounded border text-center">
            {t('policies.noActivity')}
          </div>
        ) : (
          <div className="space-y-2 text-xs">
            {activity.map((a) => (
              <div key={a.id} className="p-3 rounded-lg border bg-card/40 space-y-0.5">
                <div className="font-medium text-foreground">{a.action}</div>
                <div className="text-muted-foreground">{a.details}</div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(a.timestamp).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
```

Add `const { data: activity = [] } = usePolicyActivity(id);` near the top of `PolicyDetailPage`, alongside the existing `usePolicy`/`usePolicyControls` calls.


- [ ] **Step 6: Manual verification (Playwright, per this repo's UI rules)**

Start the dev stack in this worktree with the notes/auth microservices on their Fake strategies (no `.env` for `apps/microservices/notes` and `apps/microservices/auth`, matching the pattern used for every prior UI verification this session), sign up, create an org, go to Policies, create a policy (from scratch or a template), and click through: Submit for Review → (log in or reason about self-approval — the signed-in user is the author, so Approve should be blocked until a different actor calls it; verify the self-approval-forbidden error surfaces as a toast, not a silent failure) → confirm the stepper and badge render correctly for each of the 5 states → confirm the History section shows real entries after each transition. Take screenshots as evidence.

- [ ] **Step 7: Run tests, lint, build**

```bash
yarn nx test client
npx prettier --write apps/client/src/queries/policies.ts apps/client/src/routes/_dashboard/policies.tsx "apps/client/src/routes/_dashboard/policies_.\$id.tsx" libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts
yarn nx lint client
yarn nx lint template-shared
yarn nx build client
yarn nx build template-shared
```

- [ ] **Step 8: Commit**

```bash
git add apps/client/src/queries/policies.ts apps/client/src/routes/_dashboard/policies.tsx "apps/client/src/routes/_dashboard/policies_.\$id.tsx" libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/ru.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts
git commit -m "feat(policy): add WorkflowBar, WorkflowBadge, and activity history to the Policy UI"
```

---

## Final Integration Check

After all 6 tasks: run the full workspace test/lint/build once more —

```bash
yarn nx run-many -t build test lint --projects=shared,notes,notes-client,api,client,template-shared
```

Then run `superpowers:finishing-a-development-branch` (this phase touches migrations and client/UI code, so Playwright verification from Task 6 Step 6 is required before calling this done, per this repo's own AGENTS.md rule).
