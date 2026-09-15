# Exception Governance (Phase 1: Expiry, Renewal, Risk-Linkage) — Design

## Problem

The requirements-gap audit against `docs/requirements/Exceptions.docx` ranked Exception risk-linkage + expiration/review-frequency as the #2 priority gap (after Issue closure-validation): `Exception` (`libs/shared/src/strategies/notes.ts:427`) behaves like a text blob with an approval flag rather than a governance object.

Concretely:

- `expiresAt` and the `'expired'` status value already exist in the schema (`supabase/migrations/20260613000001_exceptions_issues.sql:12`), but nothing ever sets `status = 'expired'`, no UI ever surfaces or sets `expiresAt` (`-exceptions.page.tsx`'s `EMPTY_FORM` at line 41 omits it entirely), and there is no renewal workflow to extend it before it lapses.
- There is no link from an `Exception` to a `Risk` — approving a control exception is itself a residual-risk decision, and today that decision lives nowhere queryable.
- `approveException(id)`/`rejectException(id)` (`libs/shared/src/strategies/fakes/fake-notes.ts:3483`, `:3495`) take no actor at all — any authenticated user can approve or reject any exception, including their own. Discovered while designing this feature's actor-tracking for renewal; user explicitly approved folding this pre-existing gap into this phase's scope rather than filing it separately, since renewal review needs the identical self-approval guard anyway.

Phase 1 scope (per user decision during brainstorming): expiry + renewal workflow, risk-linkage, and the approve/reject actor-tracking fix. Deferred to Phase 2: scope fields (assets/BU), a structured remediation/exit-plan, and the Gap Analysis "Approved Exception ≠ Met" UI indicator (this phase makes the *data* for that indicator computable — see Architecture — but does not touch the Gap Analysis page itself).

## Scope

1. Add `riskId` (nullable link to an existing `Risk`), `reviewFrequencyDays` (nullable), `reviewedBy`, `reviewedAt` to `Exception`.
2. Add actor parameters to `approveException`/`rejectException`; forbid an exception's own `ownerId` from approving or rejecting it.
3. Add a new `ExceptionRenewal` entity (one row per renewal cycle), modeled directly on the existing `RiskAcceptance`/`IssueValidation` pattern: `requestExceptionRenewal` (owner proposes a new `expiresAt` + justification), `reviewExceptionRenewal` (a different user approves — extends `expiresAt` — or rejects with notes, history preserved).
4. Compute an *effective* status at read time — `expiresAt` in the past on an `approved` exception reads as `'expired'` — without any background job (this codebase has no job/cron infrastructure; `AGENTS.md` lists `Jobs: none`). Mirrors `getActiveRiskAcceptance`'s existing `gt('expires_at', now)` query-time approach rather than inventing new infrastructure.
5. Backend across all 5 layers: `DBStrategy` interface → `FakeNotesStrategy` + `SupabaseNotesStrategy` → `notes.controller.ts` MS handlers → `notes-client` → gateway routes.
6. Client: add `expiresAt` (required) and a risk-picker `Combobox` to the existing create form in `-exceptions.page.tsx`; add a new `ExceptionDetailSheet` (this module currently has no detail view at all — only inline row actions) housing the renewal request/review UI and showing the linked risk.
7. i18n keys across all 4 locales (en/es/he/ru).

Out of scope (Phase 2): scope fields (affected assets / business unit), a structured remediation/exit-plan (actions/milestones, mirroring what Issue closure-validation deferred for its own remediation plan), and the Gap Analysis page's "Approved Exception ≠ Met" visual indicator (this phase's `effectiveStatus` computation is the prerequisite Gap Analysis will consume later, but wiring it into that page is separate work).

## Global Constraints

- **No self-approval**: `approveException`/`rejectException` must reject a caller whose id matches the exception's `ownerId`. Enforced server-side in both `FakeNotesStrategy` and `SupabaseNotesStrategy`, not just hidden in a client-side disabled button.
- **No self-review on renewal**: `reviewExceptionRenewal` must reject a caller whose id matches the renewal's `requestedBy`. Same enforcement requirement as above.
- **Effective status is computed, never stored as a side effect of a read.** `Exception.status` in the database only ever transitions via an explicit action (create → `pending`; approve → `approved`; reject → `rejected`; a renewal being approved does NOT change `status`, only `expiresAt`). A `GET`/list call never writes to the row it's returning — the "is this actually still valid" check (`status === 'approved' && expiresAt !== null && expiresAt < now`) is a pure function applied to the fetched row, computed identically on the Fake strategy (in-memory) and the Supabase strategy (in a shared helper, not a SQL view, to keep the logic in one place and unit-testable against the Fake).
- **Renewal history accumulates naturally** — rejecting a renewal never deletes or overwrites the row; the next request creates a new one. `getActiveExceptionRenewal(exceptionId)` returns the most recent `pending` row, mirroring `getActiveRiskAcceptance`/`getActiveIssueValidation`.
- **`riskId` links to an existing Risk only** — no create-new-risk-from-exception flow in this phase (per user decision: "create-or-link" pattern like Findings-bridge was considered and explicitly deferred; Phase 1 is link-only, matching the smaller "Findings bridge" precedent's own initial scope before it grew).
- Follow existing snake_case / RLS / index conventions already established by `risk_acceptances` (`supabase/migrations/20260912000002_risk_register.sql:187`) and this session's own `issue_validations` (`supabase/migrations/20260915000001_issue_closure_validation.sql`) for the new `exception_renewals` table — org-scoped + actor-scoped RLS from the start, not `using(true)` (a mistake made and corrected mid-review in the Issue closure-validation phase; this phase must not repeat it).
- Gateway routes resolve `orgId` from the owning record (the `Exception` row, or the `ExceptionRenewal` row), never from a client-supplied query param — same anti-cross-tenant-bug discipline established in Phase B.2.3 and re-confirmed in Issue closure-validation's final review.

## Architecture

### Data model

`Exception` (`libs/shared/src/strategies/notes.ts:427`) gains four fields:

```ts
export interface Exception {
  // ...existing fields unchanged
  riskId: string | null;
  reviewFrequencyDays: number | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface ExceptionInput {
  // ...existing fields unchanged
  riskId?: string;
  reviewFrequencyDays?: number;
}

export interface ExceptionPatch {
  // ...existing fields unchanged
  riskId?: string | null;
  reviewFrequencyDays?: number | null;
}
```

`expiresAt` becomes a required field in the client's create form (it already exists as optional on `ExceptionInput`; this phase doesn't change the type, only the UI making it mandatory to submit — matching real-world exception-governance practice where an exception without an end date isn't a real exception).

New helper (pure function, lives in `libs/shared/src/strategies/notes.ts` alongside the type, exported for use by both strategies and by client code):

```ts
export function effectiveExceptionStatus(
  exception: Pick<Exception, 'status' | 'expiresAt'>,
): ExceptionStatus {
  const isLapsed = exception.expiresAt !== null && new Date(exception.expiresAt).getTime() < Date.now();
  return exception.status === 'approved' && isLapsed ? 'expired' : exception.status;
}
```

Compares parsed timestamps (`Date.getTime()`), not raw ISO strings — string comparison happens to work for same-format UTC timestamps but is the wrong tool: it breaks silently if `expiresAt` is ever stored or passed in a different (still-valid) ISO representation (e.g. with an explicit `+00:00` offset instead of `Z`, or fractional seconds truncated), where lexical order no longer matches chronological order.

New entity, modeled on `RiskAcceptance`/`IssueValidation`:

```ts
export type ExceptionRenewalStatus = 'pending' | 'approved' | 'rejected';

export interface ExceptionRenewal {
  id: string;
  exceptionId: string;
  orgId: string;
  requestedBy: string;
  proposedExpiresAt: string;
  justification: string;
  status: ExceptionRenewalStatus;
  reviewedBy: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ExceptionRenewalRequestInput {
  proposedExpiresAt: string;
  justification: string;
}
```

New Supabase migration `supabase/migrations/<next>_exception_governance.sql`:

```sql
alter table public.exceptions
  add column risk_id uuid references public.risks(id) on delete set null,
  add column review_frequency_days integer,
  add column reviewed_by uuid,
  add column reviewed_at timestamptz;

create table public.exception_renewals (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.exceptions(id) on delete cascade,
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  requested_by uuid not null,
  proposed_expires_at timestamptz not null,
  justification text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index exception_renewals_exception_idx on public.exception_renewals(exception_id);
create index exception_renewals_org_idx on public.exception_renewals(org_id);

alter table public.exception_renewals enable row level security;

create policy "org members read exception renewals"
  on public.exception_renewals for select
  using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "requester or reviewer manage exception renewals"
  on public.exception_renewals for all
  using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and (requested_by = auth.uid() or reviewed_by = auth.uid())
  )
  with check (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and (requested_by = auth.uid() or reviewed_by = auth.uid())
  );
```

The RLS shape here is written correctly from the start (org-scoped + actor-scoped), unlike the first draft of `issue_validations`' migration in the prior phase, which used `using(true)` and had to be corrected in that phase's fix loop — this phase's plan must not repeat that mistake.

### Workflow

**Approve/reject actor fix:**

1. `approveException(id, approverId)`: loads the exception, throws `exception_self_approval_forbidden` if `existing.ownerId === approverId`, else sets `status: 'approved'`, `reviewedBy: approverId`, `reviewedAt: now`.
2. `rejectException(id, approverId)`: same self-check, sets `status: 'rejected'`, `reviewedBy: approverId`, `reviewedAt: now`.
3. Gateway routes pass `this.uid(req)` as the actor — no client-supplied approver id, matching the corrected pattern from Issue closure-validation's `submitIssueForValidation`/`reviewIssueValidation` (never trust a client-supplied actor identity when the authenticated caller *is* the actor).

**Renewal:**

1. Owner (on an exception whose `effectiveExceptionStatus` is `'approved'` or `'expired'`) opens the exception's detail Sheet, picks a new expiry date + justification, submits.
2. `requestExceptionRenewal(exceptionId, requestedBy, data)`: verifies `requestedBy === exception.ownerId` (only the owner can request renewal — unlike Issue closure-validation where *anyone* could be picked as validator, here there is no separate "who reviews" selection step; any org member other than the requester may review, consistent with `approveException`'s existing shape where no dedicated approver is assigned up front), creates an `ExceptionRenewal(status: 'pending')` row.
3. A different user reviews: `reviewExceptionRenewal(id, reviewerId, decision, reviewNotes?)` — verifies `reviewerId !== renewal.requestedBy`, requires `reviewNotes` on rejection (matching `IssueValidation`'s established rule), and on approval updates `Exception.expiresAt = renewal.proposedExpiresAt` (the underlying `status` stays `'approved'` — only the date moves, so `effectiveExceptionStatus` naturally stops returning `'expired'` once the new date is in the future).

### Backend surface (5 layers, same pattern as every prior phase)

- **`DBStrategy` interface**: add `requestExceptionRenewal`, `reviewExceptionRenewal`, `getExceptionRenewal(id)`, `getActiveExceptionRenewal(exceptionId)`, `listExceptionRenewals(exceptionId)`; change `approveException`/`rejectException` signatures to take an actor id.
- **`FakeNotesStrategy`**: in-memory `this.exceptionRenewals: ExceptionRenewal[]` array, same id-generation convention as other fake collections.
- **`SupabaseNotesStrategy`**: real inserts/updates against `exception_renewals` + `exceptions`, using the existing `toException`-style mapper convention; writes ordered to avoid the exact partial-failure class found and fixed in Issue closure-validation's final review (`reviewExceptionRenewal` updates the `exceptions` row first — idempotent on retry — then the `exception_renewals` row second; error results from every write are checked, never fire-and-forget).
- **`notes.controller.ts`** (MS): `notes.exceptions.renewals.request`, `notes.exceptions.renewals.review`, `notes.exceptions.renewals.get`, `notes.exceptions.renewals.list` `@MessagePattern`s; existing `notes.exceptions.approve`/`notes.exceptions.reject` handlers gain the actor id in their payload.
- **`notes-client`**: matching methods.
- **Gateway** (`apps/api`): `POST /api/notes/exceptions/:id/renewals` (request), `POST /api/notes/exception-renewals/:id/review`, `GET /api/notes/exceptions/:id/renewals` (list, scoped to org creator or a party to the exception/its renewal history — same shape as Issue closure-validation's `listIssueValidations` route), and the existing `approve`/`reject` routes updated to pass `this.uid(req)` as the actor with a `NotFoundException`/self-approval check before delegating.

### UI

- `-exceptions.page.tsx`: `EMPTY_FORM` gains `expiresAt: ''` and `riskId: ''`; the create form gains a required date input for `expiresAt` and a `Combobox` (existing `useRisks(orgId)` query) for `riskId`, following the exact input patterns already used for `ownerId`'s `Combobox` in this same form.
- `ExceptionRow`'s status badge reads `effectiveExceptionStatus(exception)` instead of `exception.status` directly, so an approved-but-lapsed exception visibly shows "Expired" in the list without any stored-status mutation.
- The row becomes clickable (same pattern as Issue closure-validation's `-issues.page.tsx` row-to-Sheet conversion) opening a new `ExceptionDetailSheet` (`apps/client/src/components/exceptions/ExceptionDetailSheet.tsx`) with:
  - **Overview**: statement, justification, compensating controls, linked risk (name/link if `riskId` set), effective status, `expiresAt`.
  - **Renewal**: if `effectiveExceptionStatus === 'approved' | 'expired'` and current user is the owner and no active pending renewal exists — a date picker + justification textarea + "Request Renewal" button in the shared footer (mirroring `IssueDetailSheet`'s footer-actions convention established in the prior phase, including its Cancel-always-present rule); if a pending renewal exists and the current user is not its requester — Approve/Reject buttons in the footer, Reject gated on notes; below, a read-only renewal history list (status, reviewer, notes, date) — same shape as `IssueDetailSheet`'s Validation History section.
- i18n: new `exceptions.detail.*` key group (mirroring `issues.detail.*`'s structure) across all 4 locales.

### Testing

- Unit tests for `requestExceptionRenewal`/`reviewExceptionRenewal` on `FakeNotesStrategy`: happy path (request → approve → `expiresAt` updated, `status` unchanged at `'approved'`), reject-and-re-request path (history preserved), self-request-review rejection, reject requires notes.
- Unit tests for the actor fix: self-approval rejected, self-rejection rejected, a different user succeeds and `reviewedBy`/`reviewedAt` are set.
- Unit tests for `effectiveExceptionStatus`: approved + future `expiresAt` → `'approved'`; approved + past `expiresAt` → `'expired'`; pending/rejected are unaffected by `expiresAt` regardless of date.
- Gateway tests (new `apps/api/src/app/notes/__tests__/exceptions.controller.unit.test.ts` or added to an existing exceptions test file if one already exists — check first) covering cross-org renewal review rejection and the renewal-history route's access scoping, following the exact test pattern established by `apps/api/src/app/notes/__tests__/notes.controller.unit.test.ts` in the prior phase.
- `ExceptionDetailSheet.unit.test.tsx`: renders overview with linked risk, owner can request renewal, non-requester can approve/reject a pending renewal, reject requires notes, requester cannot review their own request.
- Regression: existing `-exceptions.page.tsx`/`exceptions` test fixtures updated for the new required `expiresAt` field in the create form; any test asserting the old inline approve/reject-buttons-on-row layout updated for the new clickable-row-opens-Sheet behavior (same class of test update Issue closure-validation needed for `-issues.page.tsx`).
