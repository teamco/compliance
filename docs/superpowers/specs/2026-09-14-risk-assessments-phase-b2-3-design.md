# Risk Assessments Phase B.2.3: Findings → Issue/Risk/Exception Bridge — Design

## Problem

The `Finding` entity (created when a control assessment logs a gap: `libs/shared/src/strategies/notes.ts:285`) already has a fully-built backend bridge to Issues, Risks, and Exceptions — `listControlFindings`, `linkFindingToRisk`, `linkFindingToIssue`, `resolveFindingViaException` all exist in both `FakeNotesStrategy` and `SupabaseNotesStrategy`, with REST routes at the gateway. None of it has any UI. Worse: the only place a `Finding` gets created — `createAssessmentFinding`, wired to the "Log Finding" button in `RequirementDrawer.tsx` — never writes a real row into the `findings` table in either strategy. `FakeNotesStrategy` fabricates a random ID string and creates an unrelated `Issue` as a side effect; `SupabaseNotesStrategy` is a literal stub that persists nothing. The bridge is fully built downstream and completely unreachable upstream.

## Scope

1. Fix `createAssessmentFinding` to create a real `Finding` row (both strategies).
2. Add three "create-and-link" combo endpoints (`createIssueFromFinding`, `createRiskFromFinding`, `createExceptionFromFinding`), mirroring Phase B.2.2's `createRiskFromAssessmentItem` pattern.
3. Add one generic reverse-lookup endpoint (`listFindingsByLink`) so Issue/Risk/Exception-side pages can show which Finding(s) point at them.
4. Add `checkOrgAccess` to all 7 finding-related gateway endpoints (4 pre-existing + 3 new).
5. Build the forward bridge UI inside `RequirementDrawer.tsx` (a `LinkedFindingSection`, mirroring B.2.2's `LinkedRiskSection`).
6. Build reverse back-link UI on the Issues page, Risk detail page, and Exceptions page.

Out of scope: unlinking a finding from an Issue/Risk (links are permanent once made, same one-way philosophy as Risk snapshots — no undo); any change to the Exception approval workflow itself; a dedicated top-level "Findings" list page (the per-control/per-assessment embedded view is the only surface, matching how B.2.2 never added a standalone Risk-bridge page either).

## Global Constraints

- No new columns on `Issue`, `Risk`, or `Exception` — provenance reuses `Issue.source`/`sourceId` and `Risk.source`/`sourceRef`, both of which already have a `'gap_analysis'` value that fits a Finding's origin exactly. `Exception` has no source field and none is added; its back-link is derived purely by querying `findings` for a matching `linked_exception_id`.
- `Finding.orgId` is a real, always-populated column (unlike `AssessmentItem.orgId` in B.2.2) — no parent-resolution workaround needed for authorization.
- Creating an Exception from a Finding does **not** auto-resolve the finding. `resolveFindingViaException` may only be called with an exception whose `status === 'approved'`, enforced client-side by filtering the "Link Existing Exception" combobox and enforced server-side by a new check in `resolveFindingViaException` itself (both strategies) that rejects a non-approved exception.
- `Finding.code` generation follows the existing max-suffix+1 pattern (`FIND-NNNNNN`, 6-digit zero-padded), consistent with `ASM-`/`RSK-` codes.
- No new fix-round debt: apply the auth hardening (`checkOrgAccess`) to the 4 pre-existing endpoints in the same task that fixes `createAssessmentFinding`, not as an afterthought — this phase should not ship the same "Important finding in final review" class of gap B.2.2 shipped with (I2) and had to flag as a backlog item instead of fixing.

## Architecture

### Data model

No new tables — `findings` already exists (`supabase/migrations/20260912000001_internal_controls.sql:193`) with `org_id`, `code`, `control_id`, `assessment_id`, `title`, `description`, `severity`, `status`, `linked_issue_id`, `linked_exception_id`, `linked_risk_id`, RLS enabled. `Finding` (shared type) already matches this shape 1:1.

`RequirementAssessment.findingId`/`findingTitle`/`findingSeverity` (denormalized fields set by `createAssessmentFinding`) stay as they are — they're what lets `RequirementDrawer` know a finding exists for a given assessment row without an extra fetch. The full `Finding` record (status + 3 links) is fetched via `useControlFindings(controlId)` and matched by `id === asm.findingId`.

### `createAssessmentFinding` fix

Both strategies gain a real insert:

- **Fake**: push a new `Finding` into `this.findings` (code via max-suffix+1 over `this.findings`, `status: 'open'`, all three `linked*Id` undefined). Remove the stray `this.createIssue(...)` call — that was masking the missing persistence, not a real feature.
- **Supabase**: `insert` into `findings` with the resolved code (query `findings` for the max existing `FIND-` suffix, `+1`), return the mapped row via the existing `toFinding` private mapper.

Both return `{ findingId: <real id> }` as before — the return contract doesn't change, only what happens behind it.

### New combo endpoints

Each: (1) create the target entity via the entity's own existing create method, (2) call the existing finding-link method to set the FK back on the Finding. Non-transactional two-write pattern, consistent with `createRiskFromAssessmentItem`'s precedent.

```ts
createIssueFromFinding(
  orgId: string,
  findingId: string,
  data: { title: string; description: string; severity: IssueSeverity; ownerId: string },
): Promise<Issue>
// creates Issue with source: 'gap_analysis', sourceId: findingId, reporterId: ownerId
// then calls this.linkFindingToIssue(findingId, issue.id)

createRiskFromFinding(
  orgId: string,
  findingId: string,
  data: { title: string; description: string; taxonomyCategoryId: string; ownerId: string;
          inherentLikelihood: number; inherentImpact: number },
): Promise<Risk>
// creates Risk with source: 'gap_analysis', sourceRef: findingId
// then calls this.linkFindingToRisk(findingId, risk.id)

createExceptionFromFinding(
  orgId: string,
  findingId: string,
  data: { controlCode: string; frameworkId: string; title: string; statement: string;
          justification: string; ownerId: string },
): Promise<Exception>
// creates Exception (status defaults to 'pending' via the existing createException path)
// does NOT call resolveFindingViaException — finding stays open until the exception is approved
// and separately linked via "Link Existing Exception"
```

Each verifies `orgId` matches the Finding's own `orgId` before writing (same defense-in-depth pattern as B.2.2's `createRiskFromAssessmentItem` fix).

### Reverse lookup

```ts
listFindingsByLink(params: { issueId?: string; riskId?: string; exceptionId?: string }): Promise<Finding[]>
```

Exactly one of the three params is passed per call; queries `findings` by the matching `linked_*_id` column. Gateway route: `GET /notes/findings/by-link?issueId=...` (or `riskId=`/`exceptionId=`).

### Authorization

All 7 endpoints resolve org via `Finding.orgId` (fetch the Finding first where the route only has a `findingId`, e.g. `link-issue`/`link-risk`/`resolve-via-exception`) and call `checkOrgAccess(req, org, 'update')` for writes / `'read'` for the list and reverse-lookup routes — same shape as every other gateway route in this file, no new pattern introduced.

### Forward bridge UI — `LinkedFindingSection` (new component, `apps/client/src/components/frameworks/LinkedFindingSection.tsx`)

Rendered inside `RequirementDrawer.tsx` wherever `asm.findingId` is set, replacing the current static red badge. Fetches `useControlFindings(control.id)`, finds the matching record, and renders:

- Status + severity badges (`open`/`remediated`/`accepted`).
- Three independent slots — Issue, Risk, Exception — each either:
  - **Linked**: a `<Link>` to the target's detail page (`/issues` has no detail route today — link to the Issues list page with the row highlighted is enough; `/risks/$id` for Risk; Exceptions page for Exception, same reasoning as Issue).
  - **Not linked**: "Create New" (opens a small prefilled dialog) + "Link Existing" (combobox of existing entities, filtered to `status === 'approved'` for the Exception slot only) buttons, both following the mandatory Dialog-footer-plus-Cancel rule from AGENTS.md.

### Reverse back-link UI

- **Issues page** (`-issues.page.tsx`): each row whose `source === 'gap_analysis'` gets a small "from Finding" indicator using `listFindingsByLink({ issueId: issue.id })`, linking to `/controls/$id` for that finding's `controlId`.
- **Risk detail page** (`-risks-detail.page.tsx`): same treatment, likely folded into the existing Overview tab near the `source`/`sourceRef` display added in B.2.2, or its own small row — final placement decided during planning once the existing tab layout is re-read.
- **Exceptions page**: same indicator pattern as Issues.

All three back-link targets are `/controls/$id` (the Internal Control detail view) — the most stable anchor a Finding has, per this design's approved scope decision.

## Testing

- Unit tests for the fixed `createAssessmentFinding` in both strategies (real row created, correct code sequence, no stray Issue side effect in Fake mode).
- Unit tests for the 3 combo endpoints (correct provenance fields set, org-mismatch rejected, Finding's link field updated) and `listFindingsByLink` (correct filtering per param).
- Real Postgres 16 replay of the `createAssessmentFinding` fix and the new combo endpoints' inserts, matching this session's established verification discipline.
- Client tests for `LinkedFindingSection` (all three slots, linked/unlinked states, approved-only Exception filtering) and the three back-link indicators.

## Self-Review

- Placeholder scan: none found.
- Internal consistency: the "Exception stays pending" rule is stated once in Global Constraints and once in the combo-endpoint description — consistent both places.
- Scope: this is the largest single-plan phase in the B.2 arc so far (foundational bug fix + 3 new endpoints + 1 lookup endpoint + auth hardening + 4 UI surfaces) — still a single coherent bridge feature, not decomposed further, since the pieces are tightly coupled (the UI can't be built until the fix lands, the back-links can't be shown until the lookup endpoint exists).
- Ambiguity check: back-link placement on the Risk detail page is intentionally left as "decided during planning" rather than guessed here, since it depends on re-reading the current tab layout, which is exactly the kind of task-level detail the planning phase resolves.
