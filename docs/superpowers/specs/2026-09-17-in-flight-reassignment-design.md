# In-Flight Assignee Reassignment — Design

## Problem

Several workflows pin a single person as the sole actor on an in-flight
record via a DB-stored id field, independent of org membership:

- `Issue.ownerId` — only this person can submit the issue for validation
  (`submitIssueForValidation` gateway route, gated `issue.ownerId !== userId`).
- `IssueValidation.validatorId` — only this person can approve/reject a
  pending validation (`reviewIssueValidation`, strategy-layer check).
- `Assessment.approverId` — only this person can approve/request-changes on
  an assessment (`approveAssessment`/`requestChanges`, strategy-layer check,
  `assessment_self_approval_forbidden` invariant already guards
  `approverId === ownerId`).
- `RiskAcceptance.approverId` — only this person can approve/reject/review a
  pending risk acceptance (strategy-layer check,
  `risk_acceptance_self_approval_forbidden` invariant already guards
  `approverId === requestedBy`).
- `Exception.ownerId` — only this person can request a renewal for the
  exception (`requestExceptionRenewal`, gated `exception.ownerId !== userId`).

If that person is deactivated or leaves the org while their record is still
in-flight, there is currently no way for anyone else to take over — the
record is permanently stuck. This is a separate, real gap from the
already-tracked "EXEMPT_ROUTES revocation gap" (deactivation doesn't block
these routes' own assignee-identity checks): even once that gap is closed,
a deactivated assignee losing the ability to act just guarantees the stuck
state instead of merely permitting it.

**Corrected from the original brainstorm during research:** the entity with
`approverId` and a `pending_review` status is `Assessment` (the Risk
Assessment cycle module, `libs/shared/src/strategies/notes.ts:945`), not
`RequirementAssessment` — a different, older entity that has no approver
field or pending-review state at all.

## Scope

Five reassignment operations, one per pinned field above. Each:

- Is gated to org owner/admin (`checkOrgManage`) — same tier as member
  removal, since this is an admin-level "fix a stuck workflow" action.
- Is general-purpose and always available, not restricted to only when the
  current assignee is deactivated — simpler rule, and also useful on its
  own (e.g. reassigning a validator who is on vacation).
- Validates the new assignee is an **active** member of the resource's org.
- Enforces the same same-person invariant the domain already has at
  submission time, where one exists (validator ≠ owner, approver ≠
  requester/owner) — see per-operation detail below.

Out of scope: `Assessment.ownerId` (no existing single-reviewer pairing to
protect), `Exception.reviewedBy` (chosen ad hoc per renewal, not a pinned
field), and the separate EXEMPT_ROUTES revocation-gap item.

## Architecture

Five explicit, typed methods — one per pinned field — threaded through the
existing per-domain layers (gateway route → strategy method), matching this
repo's established pattern (e.g. `deactivateOrgMember` from the prior
org-member-removal feature). Not a generic
`{resourceType, field, newUserId}` dispatcher: this repo has no
generic-dispatch precedent anywhere, and a typed method per field keeps
resource-specific validation natural and type-safe at the (accepted) cost
of some repetition across the 5 call sites.

### New AuthStrategy dependency, and a missing helper

All 5 operations need to check org membership. `SupabaseNotesStrategy` and
`FakeNotesStrategy` do not currently depend on `AuthStrategy` — they only
touch `notes`-domain tables/state. Rather than introduce that cross-strategy
dependency, active-membership validation happens at the **gateway
controller** layer (`apps/api/src/app/notes/notes.controller.ts`), which
already injects `AuthClientService` as `this.auth` (note: `auth.controller.ts`
injects the same service as `this.authClient` — different property names in
the two controllers, easy to typo) and already has a `checkOrgAccess`
helper using it.

**`notes.controller.ts` does not have a `checkOrgManage` helper today** —
only `auth.controller.ts` does (verified by reading both files; a prior
session summary claimed it was already duplicated, which is incorrect).
Task 1 of the implementation plan must add one to `notes.controller.ts`,
copying `auth.controller.ts`'s implementation verbatim except
`this.authClient` → `this.auth`:

```ts
private async checkOrgManage(
  req: Request & { user?: VerifiedToken },
  org: Organization,
): Promise<void> {
  if (req.user?.role === 'admin') return;
  if (org.userId === req.user?.uid) return;
  const members = await this.auth.listOrgMembers(org.id, org.userId);
  const membership = members.find((m) => m.userId === req.user?.uid);
  if (!membership || membership.role !== 'admin') throw new ForbiddenException();
}
```

The controller then calls `this.auth.listOrgMembers(orgId, org.userId)`
(default active-only — the same membership-validation pattern already used
for e.g. the org-member-removal target-is-a-member check) and rejects
before calling the strategy if the new assignee isn't in that list. Each
strategy method itself only performs the domain-specific same-person
invariant check and the field update — it trusts the id it's given is a
valid active member, exactly as `submitIssueForValidation` already trusts
its caller-supplied `validatorId` today.

### Gateway routes (all in `apps/api/src/app/notes/notes.controller.ts`)

This codebase uses POST + a verb-phrase path segment for state-changing
actions (`submit-for-validation`, `review`, `approve`, `reject`) and
reserves PATCH for generic field patches (`PATCH issues/:id`). Reassignment
is an action, not a generic patch, so it follows the POST convention:

```
POST /notes/issues/:id/reassign-owner                  { newOwnerId: string }
POST /notes/issue-validations/:id/reassign-validator    { newValidatorId: string }
POST /notes/assessments/:id/reassign-approver           { newApproverId: string }
POST /notes/risk-acceptances/:id/reassign-approver      { newApproverId: string }
POST /notes/exceptions/:id/reassign-owner               { newOwnerId: string }
```

Each route:

1. Loads the resource by id → `NotFoundException` if missing.
2. Resolves the org (`getOrganizationById`) → `NotFoundException` if missing.
3. `await this.checkOrgManage(req, org)` (new helper, see below).
4. `const members = await this.auth.listOrgMembers(orgId, org.userId)`
   (active-only, default params — same call shape as
   `deactivateOrgMember`'s existing target-membership check, though that one
   lives in `auth.controller.ts` and calls it `this.authClient`); if
   `!members.some(m => m.userId === newAssigneeId)`, throw
   `BadRequestException('assignee_not_active_member')`.
5. Call the strategy method, which performs the domain invariant check and
   the update, and return the updated record.

### Strategy interface additions (`libs/shared/src/strategies/notes.ts`)

```ts
reassignIssueOwner(id: string, newOwnerId: string): Promise<Issue>;
reassignIssueValidator(validationId: string, newValidatorId: string): Promise<IssueValidation>;
reassignAssessmentApprover(id: string, newApproverId: string): Promise<Assessment>;
reassignRiskAcceptanceApprover(id: string, newApproverId: string): Promise<RiskAcceptance>;
reassignExceptionOwner(id: string, newOwnerId: string): Promise<Exception>;
```

Implemented in both `FakeNotesStrategy` and `SupabaseNotesStrategy`.

### Per-operation invariant detail

- **`reassignIssueOwner`**: if there is a `pending` `IssueValidation` for
  this issue, reject `newOwnerId === thatValidation.validatorId` with
  `issue_validation_self_validation_forbidden` (same error string
  `submitIssueForValidation` already throws for the symmetric case — an
  issue can never have owner === validator while a validation is pending).
  No restriction otherwise (an issue with no pending validation has no
  paired identity to protect against).
- **`reassignIssueValidator`**: the validation must be `status === 'pending'`
  (`NotFoundException` — reassigning a decided validation makes no sense,
  there is nothing "stuck" about a resolved record); reject
  `newValidatorId === issue.ownerId` with
  `issue_validation_self_validation_forbidden`.
- **`reassignAssessmentApprover`**: reject `newApproverId === assessment.ownerId`
  with `assessment_self_approval_forbidden` (same string
  `approveAssessment`/`requestChanges` already throw).
- **`reassignRiskAcceptanceApprover`**: reject
  `newApproverId === acceptance.requestedBy` with
  `risk_acceptance_self_approval_forbidden` (same string the existing
  approve/reject/review methods already throw).
- **`reassignExceptionOwner`**: no same-person invariant (ownerId is the
  renewal-request initiator; the reviewer is chosen ad hoc per renewal, not
  a fixed paired identity). Active-membership check only.

None of the 5 operations status-gate the resource itself (per the
"always available" decision) — reassignment works regardless of the
resource's current status, including terminal ones, except
`reassignIssueValidator`'s own pending-only rule above (that one gates on
the *validation* record's status, not the issue's, since a decided
validation has nothing to reassign).

## Error handling

Reuses this codebase's existing exception vocabulary — no new error types:

- `NotFoundException` — resource, org, or (for the validator case) a
  pending validation not found.
- `ForbiddenException` — caller is not org owner/admin (`checkOrgManage`'s
  own existing behavior).
- `BadRequestException('assignee_not_active_member')` — new assignee isn't
  an active member of the org.
- `BadRequestException` wrapping the strategy's thrown same-person-invariant
  `Error` message (mirrors how existing routes surface strategy errors
  today, e.g. `submitIssueForValidation`'s
  `issue_validation_self_validation_forbidden`).

## Client

### Query hooks (`apps/client/src/queries/*.ts`)

One mutation hook per operation, following the existing
`useDeactivateOrgMember`-style pattern (mutate, invalidate the relevant
query key(s) on success):

- `useReassignIssueOwner(orgId)` → invalidates `['issues', orgId]`
- `useReassignIssueValidator(orgId)` → invalidates `['issue-validations', issueId]`
- `useReassignAssessmentApprover(orgId)` → invalidates `['assessments', orgId]` and the single-assessment query
- `useReassignRiskAcceptanceApprover(orgId)` → invalidates the risk-detail query
- `useReassignExceptionOwner(orgId)` → invalidates `['exceptions', orgId]` and the single-exception query

### `ReassignDialog` component (new, shared)

`apps/client/src/components/shared/-reassign-dialog.tsx` (co-located under
a new `shared` folder since it's used across issues/assessments/risks/
exceptions, none of which owns it):

```tsx
interface ReassignDialogProps {
  open: boolean;
  isPending: boolean;
  label: string;          // e.g. "Reassign Validator", "Reassign Owner"
  members: OrgMember[];   // pre-filtered: active, excluding the same-person target
  currentAssigneeId: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (newAssigneeId: string) => void;
}
```

A `Dialog` (not `AlertDialog` — this is a data-entry action, not a
destructive confirmation, per this repo's own overlay-pattern convention)
with a `Combobox` member picker defaulted to unselected, `Cancel` +
`Reassign` (disabled until a different member is picked) in the footer.

### Wiring (5 call sites)

A small "Reassign" icon-button (`UserCog` from lucide-react, matching the
existing icon-button pattern next to member rows) appears beside each
pinned name, visible only when `canManage` is true (same permission
computation already used in `-members-section.tsx`: org creator or an
org-admin member):

- `IssueDetailSheet` — next to the Owner (Overview tab) and next to the
  pending validator's name (Validation tab).
- Assessment detail page — next to Owner and Approver fields.
- Risk detail page's RiskAcceptance panel — next to the Approver field.
- `ExceptionDetailSheet` — next to the Owner field.

`canManage` must be computed in each of these components already having
access to `org` and `useOrgMembers` — for the 3 that don't already compute
it (`IssueDetailSheet`, assessment detail, `ExceptionDetailSheet`, risk
detail), add the same one-line computation `-members-section.tsx` uses:
`org.userId === myUid || myMembership?.role === 'admin'`.

## Testing

- **Strategy unit tests** (Fake, one file per domain's existing test file):
  happy path (reassigns, returns updated record), inactive-target
  rejection, same-person-invariant rejection (where applicable),
  not-found cases.
- **Gateway controller unit tests**: permission gate (non-manager
  `ForbiddenException`), inactive-assignee `BadRequestException`,
  happy-path 200 response — mirrors the 8-test pattern already used for
  `deactivateOrgMember` in `auth.controller.unit.test.ts`.
- **`ReassignDialog` component test**: renders, disables Reassign until a
  different member is picked, calls `onConfirm` with the picked id.
- **Live Playwright verification** (mandatory per `AGENTS.md`): with 2 real
  org members, submit an issue for validation to member B, remove member B
  from the org, reassign the pending validation to a newly-invited member
  C, confirm C can now approve/reject it.
