# Policy Lifecycle (Draft → Review → Approved → Published → Superseded) — Design

## Problem

Neither Policy nor Standards has a real governance lifecycle today, but they're in different states of incompleteness:

- **Standards** already has a working, generic 4-state workflow (`WorkflowStatus`: `draft → in_review → approved → published`, `WORKFLOW_TRANSITIONS`, a single `transitionWorkflow(id, transition)` strategy method, a gateway route, and a client `WorkflowBar`/`WorkflowBadge` UI) — it's just missing a `superseded` terminal state.
- **Policy** has only a crude ad-hoc 2-value `status: 'draft' | 'approved'` field, DB-check-constrained to those two values, mutated via a raw `<select>` through the generic `updatePolicy` patch method. No transition rules, no approver check, no history.

This spec closes both gaps by widening the existing shared `WorkflowStatus`/`WorkflowTransition` types (reused, not duplicated) to 5 states, and giving Policy the same lifecycle Standards already has, plus a real per-transition history using the `framework_activities` pattern already established for Controls (this session) and Assets (PR #60).

## Scope

**In scope:**
1. Widen `WorkflowStatus` to 5 states (add `superseded`) and `WorkflowTransition` to add `supersede` (`published → superseded`), shared by both Standards and Policy.
2. Widen `generated_standards.workflow_status`'s DB check constraint to the 5 values (Standards keeps its existing `transitionWorkflow` method and UI as-is otherwise — this is the only change Standards gets).
3. Rename `Policy.status: PolicyStatus` → `Policy.workflowStatus: WorkflowStatus` (migrate the column, widen the check constraint, reuse the exact same type Standards uses).
4. New `transitionPolicyWorkflow(id, transition, userId)` strategy method (separate from Standards' `transitionWorkflow` — different table, different self-approval requirement) with a self-approval guard: the policy's own author (`policy.userId`) cannot fire `approve`, `publish`, or `supersede` on their own policy.
5. Widen `framework_activities` a 5th time (nullable `policy_id` FK) to record one activity entry per transition (`action` = "Submitted for Review" / "Approved" / "Rejected" / "Published" / "Superseded", `actor` = the transitioning user's id, real timestamp) — reuses the exact widening pattern from PR #60, not a new table.
6. New gateway route `PATCH /notes/policies/:id/workflow`, matching Standards' route shape and body (`{ transition }`), with `checkOrgAccess` from day one (Policy's other 10 routes stay unguarded — that's Phase 2 hardening's job, not this feature's, per the standing convention this session already established for exempting/scoping unrelated systemic gaps).
7. Remove `status?: PolicyStatus` from `PolicyPatch` — workflow state can now only change through the dedicated transition endpoint, never through the generic patch (closes the "bypass the state machine via PATCH" hole that existed before this feature).
8. Client UI: Policy list page (`policies.tsx`) swaps its local `STATUS_COLORS`/2-value badge for a Policy-local `WorkflowBadge` mirroring Standards' 5-state one (own copy, own i18n namespace — see "Why two copies" below). Policy detail page (`policies_.$id.tsx`) replaces the raw `<select>` with a Policy-local `WorkflowBar` (stepper + gated action buttons: Submit for Review / Approve / Reject / Publish / Supersede), mirroring Standards' `standards.$id.tsx:WorkflowBar` shape, plus a new "History" tab rendering the `framework_activities` entries (same rendering convention as the Risk/Control/Asset History tabs already in the app).
9. New activity list method + route + hook: `listPolicyActivity(policyId)` mirroring `listAssetActivity`/`listControlActivity` exactly (all 5 layers).

**Out of scope (explicit):**
- Standards' existing `transitionWorkflow` does not get a self-approval guard. It's a separate, already-shipped feature; adding one now is an unrelated behavior change on working code, not part of completing Policy's lifecycle. Tracked as a known gap, same as other systemic gaps this session has deliberately deferred.
- No generic cross-resource-type transition dispatcher. Policy gets its own `transitionPolicyWorkflow` method; Standards keeps its own `transitionWorkflow`. They share the `WorkflowStatus`/`WorkflowTransition`/`WORKFLOW_TRANSITIONS` types/constants, not an abstraction over "any transitionable resource."
- No shared `WorkflowBar`/`WorkflowBadge` component extraction. Standards' versions are local to `standards.tsx`/`standards.$id.tsx` today; Policy gets its own local copies with their own i18n namespace (`policies.workflow.*` vs `standards.workflow.*`). Two call sites with divergent copy don't yet justify a shared component — matches this session's own established practice of not introducing shared abstractions until a third real use case shows up (e.g. the Phase 1 hardening pass explicitly declined to extract the repeated org-scoping inline block for the same reason).
- Policy's other 10 gateway routes (list/create/get/delete/clone/templates/controls) do not get `checkOrgAccess`. That's Notes Gateway Hardening Phase 2's job (already tracked separately), not this feature's.
- No changes to `PolicyTemplate`, `PolicyControl`, or the clone-from-template flow.

## Data Model

`libs/shared/src/strategies/notes.ts`:

```ts
// Widened (was 4 states, 'draft'|'in_review'|'approved'|'published')
export type WorkflowStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'superseded';
// Widened (was 3 transitions)
export type WorkflowTransition = 'submit' | 'approve' | 'reject' | 'publish' | 'supersede';

export const WORKFLOW_TRANSITIONS: Record<WorkflowTransition, { from: WorkflowStatus; to: WorkflowStatus }> = {
  submit: { from: 'draft', to: 'in_review' },
  approve: { from: 'in_review', to: 'approved' },
  reject: { from: 'in_review', to: 'draft' },
  publish: { from: 'approved', to: 'published' },
  supersede: { from: 'published', to: 'superseded' },
};

export const ADMIN_TRANSITIONS: WorkflowTransition[] = ['approve', 'reject', 'publish', 'supersede'];
```

`Policy`/`PolicyPatch` (in the same file):

```ts
export interface Policy {
  id: string;
  orgId: string;
  userId: string;
  frameworkId: string;
  title: string;
  content: string;
  workflowStatus: WorkflowStatus; // was: status: PolicyStatus
  version: number;
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyPatch {
  title?: string;
  content?: string;
  // status removed — workflow state only changes via transitionPolicyWorkflow
}
```

`PolicyStatus` type is deleted (no longer referenced anywhere once `Policy.status` is renamed).

`FrameworkActivity` gets a 5th optional field:

```ts
export interface FrameworkActivity {
  id: string;
  frameworkId?: string;
  controlId?: string;
  assetId?: string;
  policyId?: string; // new
  action: string;
  details: string;
  actor: string;
  timestamp: string;
}
```

## Migrations

Two migrations (separate files, since they touch unrelated tables):

**1. Widen `generated_standards.workflow_status` and `standards_snapshots.workflow_status` check constraints** to include `'superseded'` (both already constrained to the 4-value set per `20260606000003_workflow_and_snapshots.sql`).

**2. Policy workflow migration:**
```sql
alter table public.policies rename column status to workflow_status;
alter table public.policies drop constraint if exists policies_status_check;
alter table public.policies
  add constraint policies_workflow_status_check
  check (workflow_status in ('draft','in_review','approved','published','superseded'));
-- existing 'draft'/'approved' rows remain valid under the widened constraint, no backfill needed.

alter table public.framework_activities
  add column policy_id uuid references public.policies(id) on delete cascade;
alter table public.framework_activities drop constraint framework_activities_check;
alter table public.framework_activities
  add constraint framework_activities_check
  check (framework_id is not null or control_id is not null or asset_id is not null or policy_id is not null);
create index framework_activities_policy_idx on public.framework_activities(policy_id);
-- RLS select policy widened with a policy_id branch (org ownership via policies.org_id), same shape as the existing asset_id/control_id branches.
```

## Backend

`transitionPolicyWorkflow(id: string, transition: WorkflowTransition, userId: string): Promise<Policy>` (interface + both strategies), mirroring `transitionWorkflow`'s validation shape but adding the self-approval guard and activity write:

```ts
async transitionPolicyWorkflow(id: string, transition: WorkflowTransition, userId: string): Promise<Policy> {
  const policy = await this.getPolicy(id);
  if (!policy) throw new Error('policy_not_found');
  const { from, to } = WORKFLOW_TRANSITIONS[transition];
  if (policy.workflowStatus !== from) {
    throw new Error(`invalid_transition: ${policy.workflowStatus} → ${transition}`);
  }
  if (ADMIN_TRANSITIONS.includes(transition) && policy.userId === userId) {
    throw new Error('policy_self_approval_forbidden');
  }
  // update workflow_status to `to`
  // insert framework_activities row: policy_id, action=<label for transition>, actor=userId
  // return updated policy
}
```

Transition → activity `action` label mapping: `submit` → "Submitted for Review", `approve` → "Approved", `reject` → "Rejected", `publish` → "Published", `supersede` → "Superseded".

Gateway: `PATCH /notes/policies/:id/workflow`, body `{ transition: WorkflowTransition }`, mirroring `PATCH /notes/standards/:id/workflow`'s shape exactly but with org resolution + `checkOrgAccess(req, org, 'update')` added (Policy already has `orgId` on every row, so this is the standard 3-line inline pattern used everywhere else in this file).

`listPolicyActivity(policyId): Promise<FrameworkActivity[]>` — interface + Fake + Supabase strategies + MS handler + notes-client, exact mirror of `listAssetActivity`. Gateway route `GET /notes/policies/:id/activity`, org-scoped the same way.

## UI

**`policies.tsx`** (list page): replace `STATUS_COLORS`/`Policy['status']` 2-value badge with a Policy-local `WorkflowBadge` component (5-state color map: draft=gray, in_review=amber, approved=blue, published=green, superseded=slate-with-strike-through-style-muting), using `policies.workflow.<state>` i18n labels.

**`policies_.$id.tsx`** (detail page): replace the raw `<select>` (lines ~107-112 today) with a Policy-local `WorkflowBar` — 5-step stepper (Draft/Review/Approved/Published/Superseded) + gated primary action button (Submit/Approve/Publish/Supersede depending on current state) + a Reject button shown only in `in_review` + admin, mirroring `standards.$id.tsx:WorkflowBar`'s exact structure and `useIsAdmin`/`ADMIN_TRANSITIONS` gating logic. Add a "History" tab rendering `useListPolicyActivity(id)` entries, same list/empty-state rendering as the Risk/Control/Asset History tabs.

New i18n keys needed (all 4 locales): `policies.workflow.{draft,in_review,approved,published,superseded}`, `policies.workflow.desc.{...}` (short stepper captions, mirror Standards' `standards.workflow.desc.*` wording adapted to Policy), `policies.workflow.{submit,submitting,approve,approving,publish,publishing,supersede,superseding,reject}`, `policies.noActivity`.

## Testing

- Contract tests (Fake strategy): valid transition sequence draft→in_review→approved→published→superseded; invalid-transition rejection (e.g. calling `publish` from `draft`); self-approval guard on approve/publish/supersede; activity entry written per transition with correct action label; `listPolicyActivity` scoping (no cross-policy leakage, mirrors the Asset test).
- Component tests: `WorkflowBar` shows the correct primary action per state and hides admin-only actions from non-admins; `WorkflowBadge` renders all 5 states; History tab renders real activity entries.
- Gateway unit tests: `transitionPolicyWorkflow` route org-scoping (outsider rejected, org creator allowed), self-approval-forbidden propagated unswallowed.
