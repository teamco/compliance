# EXEMPT_ROUTES Revocation Gap — Design

## Problem

Eight write routes in `apps/api/src/app/notes/notes.controller.ts` gate on a
pinned identity field (`ownerId`, `validatorId`, `approverId`) but never
check whether that person is still an active member of the org. If the
pinned assignee is deactivated while their record is in-flight, they can
still submit/approve/review/renew — a revoked member retains write power
over records assigned to them. This is the "EXEMPT_ROUTES revocation gap"
tracked in the backlog, and is separate from the already-shipped PR #76
in-flight reassignment feature (that gives someone a way to *replace* a
stuck assignee; this closes the gap where a *deactivated* assignee can
still act before anyone reassigns them).

## Scope

Eight write routes, all in `notes.controller.ts`:

1. `POST exceptions/:id/renewals` (`requestExceptionRenewal`, ~line 1029) — `exception.ownerId`
2. `POST issues/:id/submit-for-validation` (`submitIssueForValidation`, ~line 1163) — `issue.ownerId`
3. `POST issue-validations/:id/review` (`reviewIssueValidation`, ~line 1197) — `IssueValidation.validatorId`
4. `POST risk-acceptances/:id/review` (~line 1673)
5. `POST risk-acceptances/:id/approve` (~line 1684)
6. `POST risk-acceptances/:id/reject` (~line 1691) — 4-6 via `assertCanDecideRiskAcceptance`, `RiskAcceptance.approverId`
7. `POST assessments/:id/approve` (~line 1943)
8. `POST assessments/:id/request-changes` (~line 1970) — 7-8, `Assessment.approverId`

Out of scope: the 2 GET routes (`exceptions/:id/renewals`,
`issues/:id/validations`) — reads aren't the revocation risk, only actions
are. `requestedBy` on `RiskAcceptance` is also out of scope — it's used
only for the self-approval-forbidden comparison, not as an action-gating
field.

## Architecture

**Classified: architectural** — a new cross-cutting authorization layer,
not a modification of one existing flow.

One shared helper in `notes.controller.ts`, next to `checkOrgManage`:

```ts
private async assertActiveAssignee(org: Organization, assigneeId: string): Promise<void> {
  const members = await this.auth.listOrgMembers(org.id, org.userId);
  if (!members.some((m) => m.userId === assigneeId)) {
    throw new BadRequestException('assignee_not_active_member');
  }
}
```

`listOrgMembers` is already active-only by default (`includeInactive` is
opt-in, confirmed in both `FakeAuthStrategy` and `SupabaseAuthStrategy`) and
already synthesizes the org owner into the member list, so no special-casing
is needed when the assignee is the owner.

6 of the 8 routes currently load neither the resource nor the org in the
controller at all — only route 1 does today. But the sibling PR #76
reassignment routes for the same 5 resource types
(`reassignExceptionOwner`, `reassignIssueOwner`, `reassignIssueValidator`,
`reassignRiskAcceptanceApprover`, `reassignAssessmentApprover`) already load
both, immediately adjacent in the same file, via existing capability methods
(`getException`/`getIssue`/`getIssueValidation`/`getRiskAcceptance`/
`getAssessment` — all already exist, no new strategy methods needed). The
plumbing to reuse is proven and nearby, not net-new.

**Per-route flow:**
1. Load resource (existing capability method) → `NotFoundException` if missing.
2. Load org via `getOrganizationById(resource.orgId)` → `NotFoundException` if missing.
3. `await this.assertActiveAssignee(org, <identityField>)`.
4. Proceed unchanged into the existing identity-match check (controller-inline
   or strategy-layer, left untouched) — purely additive, no regression risk
   to existing correct-actor authorization.

Route 3 (`reviewIssueValidation`) currently does zero identity/org check in
the controller (strategy-layer only) — this adds the first controller-level
org load for that route. Routes 7-8 (`Assessment.approverId`) duplicate
their identity check inline per-strategy today (no shared helper unlike
risk-acceptance's `assertCanDecideRiskAcceptance`) — this design does not
consolidate that duplication, only adds the new active-membership check
ahead of it.

## Error handling

Reuses the exact existing `BadRequestException('assignee_not_active_member')`
(400) already thrown by PR #76's reassignment validation — no new error
code, for client consistency.

## Testing

Contract tests on `FakeNotesStrategy`/controller, one per route: deactivate
the pinned assignee → call the route → expect 400
`assignee_not_active_member`.

`route-coverage.unit.test.ts`'s `EXEMPT_ROUTES` allowlist is unrelated (it
governs `checkOrgAccess` presence, not this new gate) and does not need
touching.
