# Notes Gateway Org-Scoping Hardening — Phase 1 (Risk / RiskAssessment / Issue / Exception) — Design

## Problem

`apps/api/src/app/notes/notes.controller.ts` has 147 routes. A full audit (2026-09-16) found only 30 call `checkOrgAccess` (the shared CASL helper that verifies the caller belongs to the resource's org). ~95 are `uid-only` (authenticated, but zero check that the caller belongs to the resource's org), 18 are fully open (no user-scoping check of any kind — Framework reads, Standards, Gap analysis), and 4 use a hand-rolled check instead of the shared helper. This gap has already been independently discovered and parked three times this session on narrow surfaces it happened to touch (Issue closure-validation, Exception governance, Unified Evidence), each time with a ruling to defer the systemic fix rather than patch one route at a time. It's now being addressed directly, phased by resource type per user decision, starting with the four resource types holding the most sensitive compliance data: **Risk, RiskAssessment + AssessmentItem, Issue, Exception**.

Within this phase's audit, two findings turned out to be worse than "missing org-scoping":

- `reviewRiskAcceptance` had **zero authorization of any kind** (not even a self-approval guard) — already fixed as an urgent standalone fix, PR #57, merged. Not part of this plan.
- `approveAssessment`/`requestChanges` are missing a self-approval guard: `approverId !== userId` is checked, but nothing checks `ownerId !== userId`, so an assessment owner who names themselves as approver can self-approve. **In scope for this plan** — it's in the Assessment resource type already being touched.

## Scope

**68 routes total across the 4 resource types; 9 already have `checkOrgAccess`; 57 get code changes in this phase.** (The remaining 2 — `listExceptionRenewals`, `listIssueValidations` — already resolve org correctly via a hand-rolled inline check; see "Out of scope" below for why they're left alone.) Full route-by-route list in Architecture below. Three shapes of fix:

1. **Mechanical (the vast majority)**: the route either already loads the resource via an existing `getX(id)` call (org resolves from `resource.orgId` with zero new strategy calls), or needs one new call to an *already-existing* `getX(id)` method added to the handler. Add `checkOrgAccess(req, org, action)` following the exact pattern already used by the 9 routes in scope that have it correctly (e.g. `approveException`, `createAssessmentItemEvidence`).
2. **New capability needed first** (5 routes, 3 new methods): `RiskAcceptance`, `RiskTaxonomyCategory`, and `AssessmentType` have **no public get-by-id method anywhere** in the stack (interface, both strategies, MS handler, notes-client) — their archive/review/approve/reject routes can't resolve org until one exists. `AssessmentItemControlMapping` also has no get-by-id, needed for its delete route (its URL doesn't carry the parent item's id, and a client already calls it, so the fix is a new lookup method, not a URL contract change).
3. **One-line params fix, no new capability**: `removeRiskControlMapping`'s route already has `:riskId` in its URL path (`risks/:riskId/mappings/:mappingId`) and the client already sends it — the handler just never reads it. Add the `@Param` and call the already-existing `getRisk(riskId)`.

Plus the 2 missing self-approval guards on `approveAssessment`/`requestChanges` (Assessment resource type, same phase).

Out of scope (explicit, tracked separately in project memory): Phase 2 covers InternalControl, Framework, Standards, Policy, Gap analysis — a separate spec/plan when this phase ships. Two routes already resolve org correctly via a custom inline org-creator-OR-party check (`listExceptionRenewals`, `listIssueValidations`) and are genuinely left alone — not vulnerable, just stylistically inconsistent with the shared helper, and rewriting working code purely for style is out of scope. Two other routes (`requestExceptionRenewal`, `submitIssueForValidation`) use an owner-only check today (`if (resource.ownerId !== userId) throw new ForbiddenException()`). That check is already complete, resource-specific authorization — `ownerId` is a DB-stored field set at creation, not attacker-controlled — so no cross-org caller can pass it. These do NOT get `checkOrgAccess` added: layering a creator-only org check on top adds no real security value today and would wrongly block a legitimate non-creator org member from acting on their own resource once real multi-member orgs exist. Left exactly as-is.

## Global Constraints

- **Every route gets org resolved from the resource itself, never trusted from a client-supplied query param for access-control purposes.** For list/create routes with no existing resource (e.g. `listRisks`, `createRisk`), `?orgId=` is the only source available — this is the established, already-reviewed pattern (`createFrameworkEvidence` et al.) and stays as-is; it's not a gap because create only ever writes into the org the caller already has verified access to, and list only ever reads that same org's data.
- **`checkOrgAccess` action mapping**: `'read'` for GET/list routes, `'update'` for POST/PATCH (including creates — matches the existing convention on every already-correct create-evidence route), `'delete'` for DELETE routes.
- **No new abstraction for the repeated 3-line pattern** (`const resource = await this.notes.getX(id); if (!resource) throw new NotFoundException(); const org = await this.notes.getOrganizationById(resource.orgId); if (!org) throw new NotFoundException(); this.checkOrgAccess(req, org, action);`) — this file already has ~30 routes repeating this inline, and introducing a private helper now would touch far more than this phase's scope to keep the file internally consistent. Follow the existing style.
- **New get-by-id methods return `T | null`**, matching every existing get-by-id method's convention (`getRisk`, `getException`, `getAssessment`, etc.) — never throw on not-found at the strategy layer, let the gateway route 404.
- **The `approveAssessment`/`requestChanges` self-approval guard mirrors `assertCanDecideRiskAcceptance`'s shape exactly**: reject if `assessment.ownerId === userId` (self-approval), reject if `assessment.approverId !== userId` (not the authorized approver) — checked in that order, before the existing status/transition guard's write executes. The Supabase strategy's current single-conditional-`UPDATE` shape (no prior load) must be restructured to load-then-check-then-write, the same restructuring `reviewRiskAcceptance` already got in PR #57 — copy that diff's shape.
- **Self-review-guard collision is expected on `reviewIssueValidation`** once `checkOrgAccess` is added: this route currently has zero org-check, and `IssueValidation`'s own self-validation guard already exists at submission time (`issue_validation_self_validation_forbidden`). Adding `checkOrgAccess('update')` here will make the review action reachable only by the org creator or an admin — same platform-level reachability limitation already documented for every other review workflow this session (org-membership doesn't really exist, so org-creator === record-owner always). Not a new problem, not blocking — same accepted tradeoff as `reviewExceptionRenewal`/`POST evidence/:id/review`.
- **Follow existing snake_case/RLS conventions for nothing** — this phase touches zero migrations. All 4 resource types' tables and RLS already exist; this is a gateway-authorization-only phase.

## Architecture

### New capability: `getRiskAcceptance`

Add to `NotesStrategy` interface, both strategies, the notes MS `@MessagePattern` handler, and `NotesClientService`:

```ts
getRiskAcceptance(id: string): Promise<RiskAcceptance | null>;
```

`FakeNotesStrategy`: `return this.riskAcceptances.find((a) => a.id === id) ?? null;`

`SupabaseNotesStrategy`: promote the existing private `getRiskAcceptanceOrThrow` pattern to a public null-returning method (`.maybeSingle()` instead of `.single()`), matching `getRisk`'s exact shape. Keep the existing private `getRiskAcceptanceOrThrow` as-is for internal use by `approveRiskAcceptance`/`rejectRiskAcceptance`/`reviewRiskAcceptance` — don't refactor those to call the new public method, that's an unrelated change.

Used by: `reviewRiskAcceptance`, `approveRiskAcceptance`, `rejectRiskAcceptance` gateway routes to resolve org via `acceptance.orgId`.

### New capability: `getRiskTaxonomyCategory`

Same pattern: `getRiskTaxonomyCategory(id: string): Promise<RiskTaxonomyCategory | null>` across all 5 layers. Used by `archiveRiskTaxonomyCategory`'s gateway route.

### New capability: `getAssessmentType`

Same pattern: `getAssessmentType(id: string): Promise<AssessmentType | null>` across all 5 layers. Used by `archiveAssessmentType`'s gateway route.

### New capability: `getAssessmentItemControlMapping`

Same pattern: `getAssessmentItemControlMapping(id: string): Promise<AssessmentItemControlMapping | null>` across all 5 layers. Returned object has `itemId` (confirmed field name, not `assessmentItemId`) — gateway route resolves org via `this.notes.getAssessmentItem(mapping.itemId)` → `item.orgId`. Used only by `removeAssessmentItemControlMapping`'s gateway route; the route's URL/params are unchanged (still just `:mappingId`), so the existing client caller (`apps/client/src/queries/assessments.ts:216`) needs no change.

### Gateway route changes — Exceptions (6 of 11 routes touched)

| Route | Change |
|---|---|
| `GET/POST exceptions` (list/create) | Add `getOrganizationById(orgId query)` + `checkOrgAccess('read'/'update')` |
| `GET exceptions/:id` | Already calls `getException(id)` — add `getOrganizationById(exc.orgId)` + `checkOrgAccess('read')` |
| `PATCH exceptions/:id` | Add `getException(id)` call (method exists, unused here) + org resolve + `checkOrgAccess('update')` |
| `DELETE exceptions/:id` | Same — add `getException(id)` + org resolve + `checkOrgAccess('delete')` |
| `POST exceptions/:id/renewals` | Already loads `exception` via `getException(id)` for its existing owner-check — add `checkOrgAccess('update')` alongside (not instead of) the existing owner-only check, since both should hold: only the owner can request, and they must belong to a real org |

Not touched: `approveException`/`rejectException`/`reviewExceptionRenewal`/`listPendingExceptionRenewals` (already correct), `listExceptionRenewals`/`listIssueValidations`-equivalent (`listExceptionRenewals` — hand-rolled, already correct, out of scope per Global Constraints).

### Gateway route changes — Issues (7 of 9 routes touched)

| Route | Change |
|---|---|
| `GET/POST issues` (list/create) | Add org resolve via query param + `checkOrgAccess` |
| `GET issues/:id` | Already calls `getIssue(id)` — add org resolve + `checkOrgAccess('read')` |
| `PATCH issues/:id`, `DELETE issues/:id` | Add `getIssue(id)` call + org resolve + `checkOrgAccess` |
| `POST issues/:id/submit-for-validation` | Already loads `issue` for its owner-check — add `checkOrgAccess('update')` alongside |
| `POST issue-validations/:id/review` | **Zero resource fetch today.** Add `getIssueValidation(id)` call (method exists, unused here) → `getIssue(validation.issueId)` → org resolve → `checkOrgAccess('update')`. Expect the collision noted in Global Constraints; this is the fix, not a bug to chase further. |

Not touched: `listPendingIssueValidations` (already correct), `listIssueValidations` (hand-rolled, already correct, out of scope).

### Gateway route changes — Risk (22 of 22 routes touched — 0 currently correct)

| Route(s) | Change |
|---|---|
| `GET/POST risks`, `GET/POST risks/methodology`, `GET/POST risks/taxonomy` | Add org resolve via query param + `checkOrgAccess` |
| `GET risks/:id` | Already calls `getRisk(id)` — add org resolve + `checkOrgAccess('read')` |
| `PATCH/DELETE risks/:id` | Add `getRisk(id)` call + org resolve + `checkOrgAccess` |
| `PATCH risks/taxonomy/:id/archive` | Add `getRiskTaxonomyCategory(id)` call (new method above) + org resolve + `checkOrgAccess('update')` |
| `GET/POST risks/:id/mappings` | Add `getRisk(id)` call + org resolve + `checkOrgAccess` |
| `DELETE risks/:riskId/mappings/:mappingId` | Add `@Param('riskId') riskId: string` (URL already has it, unused) + `getRisk(riskId)` + org resolve + `checkOrgAccess('delete')` — **no new strategy method** |
| `POST risks/:id/acceptance` | Add `getRisk(id)` call, derive org from `risk.orgId` (stop trusting the separate `?orgId=` query param for this) + `checkOrgAccess('update')` |
| `GET risks/:id/acceptance/active` | Add `getRisk(id)` call + org resolve + `checkOrgAccess('read')` |
| `POST risk-acceptances/:id/review` `/approve` `/reject` | Add `getRiskAcceptance(id)` call (new method above) + org resolve via `acceptance.orgId` + `checkOrgAccess('update')` |
| `GET risks/:id/snapshots`, `GET/POST risks/:id/evidence`, `GET risks/:id/assessment-items` | Add `getRisk(id)` call + org resolve + `checkOrgAccess` (evidence create: derive org from `risk.orgId`, stop trusting the separate query param, matching the acceptance fix above) |

### Gateway route changes — RiskAssessment + AssessmentItem (22 of 26 routes touched)

| Route(s) | Change |
|---|---|
| `GET/POST assessments`, `GET/POST assessment-types` | Add org resolve via query param + `checkOrgAccess` |
| `GET assessments/:id` | Already calls `getAssessment(id)` — add org resolve + `checkOrgAccess('read')` |
| `PATCH/DELETE assessments/:id` | Add `getAssessment(id)` call + org resolve + `checkOrgAccess` |
| `GET/POST assessments/:id/items` | Add `getAssessment(id)` call + org resolve + `checkOrgAccess` |
| `PATCH assessment-types/:id/archive` | Add `getAssessmentType(id)` call (new method above) + org resolve + `checkOrgAccess('update')` |
| `POST assessments/:id/start` `/submit-for-review` `/approve` `/request-changes` `/complete` `/archive` | Add `getAssessment(id)` call + org resolve + `checkOrgAccess('update')`. `/approve` and `/request-changes` ALSO get the self-approval guard fix (see below) — same dispatch, one diff. |
| `GET/POST assessments/items/:itemId/mappings` | Add `getAssessmentItem(itemId)` call + org resolve + `checkOrgAccess` |
| `DELETE assessments/items/mappings/:mappingId` | Add `getAssessmentItemControlMapping(mappingId)` call (new method above) → `getAssessmentItem(mapping.itemId)` → org resolve + `checkOrgAccess('delete')` |
| `GET assessments/items/:itemId/evidence` | Add `getAssessmentItem(itemId)` call + org resolve + `checkOrgAccess('read')` |
| `PATCH/DELETE assessments/items/:itemId` | Add `getAssessmentItem(itemId)` call + org resolve + `checkOrgAccess` |

Not touched (already correct): `createAssessmentItemEvidence`, `createRiskFromAssessmentItem`, `linkAssessmentItemToRisk`, `unlinkAssessmentItemFromRisk`.

### Self-approval guard fix — `approveAssessment` / `requestChanges`

Both strategies restructured to load-then-check-then-write (matching `reviewRiskAcceptance`'s PR #57 shape):

```ts
// Fake, both methods gain this check after the existing not-found/status checks,
// before the existing approverId check:
if (a.ownerId === userId) throw new Error('assessment_self_approval_forbidden');
```

```ts
// Supabase, both methods restructured from a single conditional UPDATE to load-then-check-then-write:
async approveAssessment(id: string, userId: string): Promise<Assessment> {
  const current = await this.getAssessmentOrThrow(id); // new private helper, mirrors getRiskAcceptanceOrThrow
  if (current.status !== 'pending_review') {
    throw new Error(`invalid_transition_from_${current.status}`);
  }
  if (current.ownerId === userId) {
    throw new Error('assessment_self_approval_forbidden');
  }
  if (current.approverId !== userId) {
    throw new Error('not_authorized_approver');
  }
  const { data, error } = await this.db
    .from('risk_assessments')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  return this.toAssessment(ok(data, error));
}
```

`requestChanges` gets the identical restructuring with its own status transition and update payload unchanged.

## Testing

- Gateway controller unit tests, one new/extended file per resource type (`risks.controller.unit.test.ts`, `assessments.controller.unit.test.ts`, extend existing `exceptions.controller.unit.test.ts` and `notes.controller.unit.test.ts` for issues), following the exact `reqAs`/`reqAsAdmin`/`makeController`/`makeNotes` pattern already established — for every touched route: rejects a caller outside the org, allows the org creator, allows an admin, 404s when the resource doesn't exist.
- Fake-strategy contract tests for the 4 new get-by-id methods (found + not-found cases) and the 2 restructured self-approval guards (rejects self-approval, rejects non-approver, still allows the legitimate approver — regression-checking the existing happy path isn't broken by the restructuring).
- No client/UI changes in this phase — no Playwright verification required (gateway-only, no route path or request/response shape changes visible to any client caller, confirmed per-route above).
