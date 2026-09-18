# Issue Closure-Validation Workflow (Phase 1) — Design

## Problem

The requirements-gap audit against `docs/requirements/Issues.docx` ranked Issue closure-validation as the #1 priority gap across all 12 requirements documents: Issues (`libs/shared/src/strategies/notes.ts:472`) currently behaves like a plain ticket tracker rather than a GRC closure-validation object. `IssueStatus` is `'open' | 'in_progress' | 'resolved' | 'wont_fix'` — any user (including the owner who did the remediation work) can move an issue straight to `resolved` with no independent review, no root-cause capture, and no record of who validated the fix or why. The `-issues.page.tsx` UI is a flat 285-line list with inline rows; there is no detail view to hold the new fields this phase adds.

Phase 1 scope (per user decision during brainstorming): closure-validation workflow (Owner → Validator → Closed) + root cause/category capture. SLA/aging, source-tracing UI, and structured remediation plans (actions/milestones) are explicitly deferred to Phase 2.

## Scope

1. Replace `IssueStatus`'s `'resolved'` with `'pending_validation'` and `'closed'` — an owner submits a fix for independent review instead of self-closing.
2. Add `rootCause` (free text) and `rootCauseCategory` (fixed enum) fields to `Issue`, captured at submit-for-validation time.
3. Add a new `IssueValidation` entity — one row per validation cycle, mirroring the existing `RiskAcceptance` pattern (`libs/shared/src/strategies/notes.ts:787`, `supabase/migrations/20260912000002_risk_register.sql:187`) rather than inventing a new shape.
4. Two new operations: `submitIssueForValidation` (owner: sets rootCause/category, picks a validator, `in_progress`/`open` → `pending_validation`) and `reviewIssueValidation` (validator: approve → `closed`, or reject with mandatory notes → `in_progress`).
5. Backend across all 5 layers: `DBStrategy` interface → `FakeNotesStrategy` + `SupabaseNotesStrategy` → `notes.controller.ts` MS handlers → `notes-client` → gateway routes (`apps/api`).
6. New `IssueDetailSheet` component (Sheet pattern, per `AGENTS.md`'s Create/Edit/Delete overlay convention) with three tabs: Overview, Root Cause, Validation. Replaces the current flat inline row as the way to view/act on an issue.
7. i18n keys across all 4 locales (en/es/he/ru).

Out of scope (Phase 2): SLA by severity, aging buckets, Issue Source/Source Reference UI (backend `source`/`sourceId` fields already exist — just no UI surfacing them), structured remediation plan (actions/milestones), a distinct "retest" step (Phase 1's validator decision — approve/reject — is the whole review; retest is a future refinement, not a blocking gap for MVP closure-validation).

## Global Constraints

- **No self-validation**: a validator must not be the issue's own `ownerId`. Enforced server-side in `submitIssueForValidation`/`reviewIssueValidation` (both strategies), not just hidden client-side in the validator picker — a client-side-only check is not a real constraint.
- **`resolved` → `closed` migration**: any existing `Issue` row with `status = 'resolved'` is treated as `closed` going forward (no separate migration script needed for the Fake strategy's in-memory fixtures — update them directly; the Supabase migration includes a data-backfill `update` statement alongside the `check` constraint change).
- **History accumulates naturally**: rejecting a validation does not delete or overwrite the rejected `IssueValidation` row — a new row is created on the next submit, exactly like `RiskAcceptance` never overwrites a prior cycle. `getActiveIssueValidation(issueId)` returns the most recent `pending` row (mirrors `getActiveRiskAcceptance`).
- **`rootCauseCategory` is a fixed enum**, not free text, so it can be filtered/aggregated later: `'process_gap' | 'control_design_failure' | 'control_operating_failure' | 'human_error' | 'system_technical_failure' | 'third_party' | 'other'`.
- Follow the existing max-suffix+1 / snake_case / RLS conventions already established for every other table in this schema (see `risk_acceptances` migration as the direct template).

## Architecture

### Data model

`Issue` (`libs/shared/src/strategies/notes.ts:472`) gains two fields:

```ts
export type IssueStatus = 'open' | 'in_progress' | 'pending_validation' | 'closed' | 'wont_fix';

export type RootCauseCategory =
  | 'process_gap'
  | 'control_design_failure'
  | 'control_operating_failure'
  | 'human_error'
  | 'system_technical_failure'
  | 'third_party'
  | 'other';

export interface Issue {
  // ...existing fields unchanged
  status: IssueStatus;
  rootCause: string | null;
  rootCauseCategory: RootCauseCategory | null;
}
```

New entity, modeled directly on `RiskAcceptance`:

```ts
export type IssueValidationStatus = 'pending' | 'approved' | 'rejected';

export interface IssueValidation {
  id: string;
  issueId: string;
  orgId: string;
  requestedBy: string;   // the issue's owner at submit time
  validatorId: string;
  status: IssueValidationStatus;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
```

New Supabase migration `supabase/migrations/<next>_issue_closure_validation.sql`:

```sql
alter table public.issues
  drop constraint issues_status_check,
  add constraint issues_status_check check (status in ('open','in_progress','pending_validation','closed','wont_fix')),
  add column root_cause text,
  add column root_cause_category text check (root_cause_category in
    ('process_gap','control_design_failure','control_operating_failure','human_error','system_technical_failure','third_party','other'));

update public.issues set status = 'closed' where status = 'resolved';

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
-- policies mirror risk_acceptances: org members read, involved parties (requested_by/validator_id) write
```

The exact constraint-drop syntax needs the real generated constraint name checked at implementation time (`\d issues` or `information_schema.check_constraints`) — Postgres auto-names differ from the literal `issues_status_check` guess above if the table was altered before; the implementer verifies this against the live schema before writing the migration.

### Workflow

1. Owner opens `IssueDetailSheet` on an `open`/`in_progress` issue → **Root Cause** tab: fills `rootCause` + `rootCauseCategory`, **Validation** tab: picks a validator (any org member except the current `ownerId`) → "Submit for Validation".
2. `submitIssueForValidation(orgId, issueId, { rootCause, rootCauseCategory, validatorId })`: validates `validatorId !== issue.ownerId` server-side, updates `Issue.status = 'pending_validation'` + root-cause fields, creates `IssueValidation` row (`status: 'pending'`).
3. Validator opens the same Sheet on a `pending_validation` issue → **Validation** tab shows the pending request + past validation history (all `IssueValidation` rows for this issue, newest first) → Approve or Reject (reject requires `reviewNotes`).
4. `reviewIssueValidation(orgId, validationId, { decision, reviewNotes })`: updates the `IssueValidation` row (`status`, `reviewNotes`, `reviewedAt`), and on approve sets `Issue.status = 'closed'` + `resolvedAt = now()`; on reject sets `Issue.status = 'in_progress'` (root cause fields stay — owner doesn't re-enter them from scratch on resubmit, just edits and resubmits).

### Backend surface (5 layers, same pattern as every prior phase)

- **`DBStrategy` interface** (`libs/shared/src/strategies/notes.ts`): add `submitIssueForValidation`, `reviewIssueValidation`, `getActiveIssueValidation`, `listIssueValidations(issueId)`.
- **`FakeNotesStrategy`**: in-memory `this.issueValidations: IssueValidation[]` array, same id-generation convention as other fake collections.
- **`SupabaseNotesStrategy`**: real inserts/updates against `issue_validations` + `issues`, using the existing `toIssue`/mapper conventions.
- **`notes.controller.ts`**: `notes.issues.submit-for-validation`, `notes.issues.review-validation`, `notes.issues.validations.list` `@MessagePattern`s.
- **`notes-client`**: matching methods.
- **Gateway** (`apps/api`): `POST /api/notes/issues/:id/submit-for-validation`, `POST /api/notes/issue-validations/:id/review`, `GET /api/notes/issues/:id/validations`, each with `checkOrgAccess` (resolve org from the issue/validation row, not a client-supplied query param — same lesson learned in Phase B.2.3's final review).

### UI

- New `apps/client/src/components/issues/IssueDetailSheet.tsx`: opened by clicking an issue row in `-issues.page.tsx` (row becomes clickable, replacing/augmenting today's inline-only row). Three tabs:
  - **Overview**: existing fields (title, description, severity, owner, dates) — read-only display of what's already editable via the existing update form; no behavior change here.
  - **Root Cause**: `rootCause` textarea + `rootCauseCategory` `Select` (shadcn), editable while `status` is `open`/`in_progress`/`pending_validation` (owner-editable).
  - **Validation**: shows current status badge; if `open`/`in_progress` and current user is the owner, shows a validator-picker `Select` (org members, excluding self) + "Submit for Validation" button; if `pending_validation` and current user is the assigned validator, shows Approve/Reject buttons (reject opens a small inline textarea for `reviewNotes`, required); below, a read-only list of past `IssueValidation` rows (validator, decision, notes, date) for audit visibility.
- `-issues.page.tsx`: row status badge gains `pending_validation` (amber) and `closed` (green, replacing `resolved`) variants.
- i18n: new `issues.detail.*` and `issues.rootCause.*` key groups across `libs/template-shared/src/lib/i18n/locales/{en,es,he,ru}.ts`.

### Testing

- Unit tests for `submitIssueForValidation`/`reviewIssueValidation` on `FakeNotesStrategy`: happy path (submit → approve → closed), reject-and-resubmit path (submit → reject → status back to `in_progress` → submit again → new `IssueValidation` row created, old one preserved with `status: 'rejected'`), and the self-validation rejection (`validatorId === ownerId` throws).
- Gateway route tests verifying `checkOrgAccess` rejects cross-org validator assignment and cross-org review attempts (same shape as the Phase B.2.3 cross-tenant fix).
- `IssueDetailSheet.unit.test.tsx`: renders each tab, submit-for-validation flow, approve/reject flow, validates the self-validation option is excluded from the picker.
- Regression: existing `-issues.page.tsx`/`issues` test fixtures using `status: 'resolved'` updated to `'closed'`; any test asserting on the old flat-row-only interaction updated for the new clickable-row-opens-Sheet behavior.
