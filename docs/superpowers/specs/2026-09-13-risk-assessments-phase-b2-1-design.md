# Risk Assessments (Phase B.2.1) — Guided Wizard + Evidence — Design Spec

## Problem

Phase B.1 (merged to `dev` in PR #47) built the full Assessment data model, lifecycle, item scoring, and control mapping — but the authoring UX is split across two disconnected surfaces: a plain `Dialog` captures the assessment's header fields (title/type/owner/scope), then the user is dropped onto the detail page to add items, link controls, and set residual scores one at a time via an Items tab. There is no guided, linear path through a full assessment, and there is no way to attach supporting evidence to an item's scoring or control work — a capability every other assessment-like surface in this app already has (`RequirementEvidence`, used by Frameworks and Risk Register).

The client's requirements doc names this gap explicitly: a multi-step guided wizard replacing the plain create-dialog, with CVRA/CTRA-specific step flows, and evidence attachment. Phase B.1's own design spec deferred this to Phase B.2, item 1 of 3 (wizard; Risk Register bridge; Findings → Issue bridge — the other two are separate, later specs).

## Scope (Phase B.2.1)

- A multi-step guided wizard (`Details → Items → Review`) that replaces the current create-`Dialog` as the primary way to build an assessment end-to-end, including items, control links, evidence, and residual scoring — not just the header fields.
- One universal step flow for every `AssessmentType` (no CVRA/CTRA-specific branching) — consistent with B.1's decision to make `AssessmentType` fully configurable, not a fixed union.
- Evidence attachment on `AssessmentItem`s, by extending the existing polymorphic `RequirementEvidence` type/table (already shared by Frameworks and Risk Register) with an optional `assessmentItemId`, rather than inventing a parallel evidence subsystem.
- Extracting the current detail page's Items-tab content into a shared, parameterized component so the wizard and the detail page render the identical items/controls/evidence/residual UI with no duplicated logic.

Explicitly out of scope for B.2.1 (separate specs, decided by the user):

- **Phase B.2.2**: the Risk Register bridge (Create New Risk / Link Existing Risk / Submit Risk Reassessment from an approved Assessment — populates the Risk Profile's Assessment tab).
- **Phase B.2.3**: the Findings → Create Issue bridge (needs its own design decision on how the existing `Finding` type, currently scoped to `RequirementAssessment`/gap-analysis, relates to Risk `Assessment`s).
- **Phase B.3**: management-view landing page, comments, immutable audit history, recurring assessments, report export.

## Architecture

Same layering as B.1: shared types (`libs/shared/src/strategies/notes.ts`) → Fake strategy → Supabase strategy → notes MS `@MessagePattern` handlers → `notes-client` TCP proxy → gateway REST → React Query hooks → client components. No new microservice. The only new backend surface is the evidence extension (existing `requirement_evidence` table/type gains one nullable column, mirroring how Risk Register added `risk_id` to the same table). All lifecycle, scoring, and control-mapping logic is B.1's and is reused unchanged.

## Data Model

```typescript
// libs/shared/src/strategies/notes.ts — extend the existing type, no new table

export interface RequirementEvidence {
  id: string;
  orgId?: string;
  controlId?: string;
  riskId?: string;
  frameworkId?: string;
  requirementId?: string;
  assessmentItemId?: string; // NEW — links evidence to an AssessmentItem
  title: string;
  owner: string;
  evidenceType: string;
  source: string;
  collectionDate: string;
  periodCovered: string;
  expirationDate: string;
  verificationStatus: 'verified' | 'pending_review' | 'rejected' | 'expired';
  url?: string;
  linkedControls?: string[];
  linkedRequirements?: string[];
}
```

`NotesStrategy` gains two methods mirroring the existing Framework-evidence pair exactly:

```typescript
listAssessmentItemEvidence(itemId: string): Promise<RequirementEvidence[]>;
createAssessmentItemEvidence(
  orgId: string,
  data: Omit<RequirementEvidence, 'id'>,
): Promise<RequirementEvidence>;
```

No changes to `Assessment`, `AssessmentItem`, `AssessmentItemInput`/`Patch`, `AssessmentType`, or any lifecycle method — B.2.1 is UI + evidence only.

### Migration

```sql
-- supabase/migrations/<date>_assessment_item_evidence.sql
alter table public.requirement_evidence
  add column assessment_item_id uuid references public.risk_assessment_items(id) on delete cascade;

alter table public.requirement_evidence drop constraint if exists requirement_evidence_check;
alter table public.requirement_evidence
  add constraint requirement_evidence_check
  check (control_id is not null or framework_id is not null or risk_id is not null or assessment_item_id is not null);

create index requirement_evidence_assessment_item_idx on public.requirement_evidence(assessment_item_id);

-- RLS: widen "users manage own evidence" (or its current replacement) to also allow
-- access when assessment_item_id resolves to an item whose assessment is in the caller's org —
-- same join-through-parent pattern already used for the control_id/risk_id branches.
```

Exact policy SQL is an implementation-time detail (mirror the existing `risk_id` branch's join chain — `risk_assessment_items` → `risk_assessments` → `org_profiles`).

## Key Flows

### Opening the wizard

The list page's "New Assessment" button (`apps/client/src/routes/_dashboard/-assessments.page.tsx`) opens `AssessmentWizard` instead of the current `Dialog`. The wizard renders as a wide/near-fullscreen `Dialog` (not a new route) with a step indicator (`Details → Items → Review`) at the top — consistent with AGENTS.md's "Create → Dialog" overlay convention, sized up because this Dialog now carries the whole authoring flow, not just a form.

### Step 1 — Details

Identical fields to B.1's current create form (title, type select, owner picker, approver picker, business unit, due date, in-scope assets/vendors `MultiSelect`). "Next" calls `useCreateAssessment` — the assessment is persisted in `draft` status immediately, and its id is held in the wizard's local state for the rest of the flow. Returning to this step after advancing routes edits through `useUpdateAssessment` instead of creating a second record.

### Step 2 — Items

Renders `AssessmentItemsPanel({ assessmentId })` — a new component holding everything the current detail page's Items tab already does: add-item dialog with methodology-driven inherent scoring, per-item inline expand showing linked controls (`AssessmentItemControls`) and residual scoring (from B.1's fix round), plus the new `AssessmentItemEvidence` mini-table in the same expanded area. Every action here is an existing (or, for evidence, newly added) mutation — nothing is buffered client-side, so closing the wizard mid-step loses no data.

"Next" (to Review) is disabled with an inline hint until at least one item exists — an assessment with zero items has nothing to review or submit.

### Step 3 — Review

A read-only summary: every item with its inherent/residual scores and labels, control-link count, and evidence count. "Finish" simply closes the wizard and navigates to the assessment's detail page; it does **not** call `submitForReview` — that remains a separate, explicit action on the detail page, unchanged from B.1. This keeps "finish authoring" and "submit for approval" as two distinct, deliberate actions.

### Closing mid-wizard

Every step's data is already persisted server-side by the time the user could close the Dialog (Esc/X), so closing simply dismisses the UI. If Details was completed (an `assessmentId` exists), closing navigates to that assessment's detail page so the user can resume there; if not, it just closes with nothing created.

## Component Map

| File | Change |
|---|---|
| `apps/client/src/components/assessments/AssessmentWizard.tsx` | New. Step state machine + Dialog shell. |
| `apps/client/src/components/assessments/AssessmentItemsPanel.tsx` | New (extracted). Holds the item list/add/expand/controls/residual UI currently inline in `-assessment-detail.page.tsx`'s Items tab. |
| `apps/client/src/components/assessments/AssessmentItemEvidence.tsx` | New. Evidence mini-table per item, modeled on `AssessmentItemControls.tsx`. |
| `apps/client/src/routes/_dashboard/-assessment-detail.page.tsx` | Modified. Items tab now renders `<AssessmentItemsPanel assessmentId={id} />` instead of inline JSX — behavior unchanged, code moved. |
| `apps/client/src/routes/_dashboard/-assessments.page.tsx` | Modified. "New Assessment" opens `AssessmentWizard`; old inline create-`Dialog` JSX removed (its fields move into the wizard's Details step). |
| `apps/client/src/queries/assessments.ts` or new `evidence.ts` | New hooks: `useAssessmentItemEvidence(itemId)`, `useCreateAssessmentItemEvidence(itemId)` — verify at implementation time whether to colocate with existing Framework/Risk evidence hooks (`risks.ts`) for one shared generic hook, or keep assessment-scoped hooks separate; both are consistent with existing precedent, pick whichever avoids the most duplication once the real hook shapes are read. |
| `libs/shared/src/strategies/notes.ts` | `RequirementEvidence.assessmentItemId?`, 2 new `NotesStrategy` methods. |
| `libs/shared/src/strategies/fakes/fake-notes.ts` | Implement the 2 new methods. |
| `apps/microservices/notes/src/app/supabase-notes.strategy.ts` | Implement the 2 new methods. |
| `apps/microservices/notes/src/app/notes.controller.ts` | 2 new `@MessagePattern` handlers. |
| `libs/notes-client/src/lib/notes-client.service.ts` | 2 new proxy methods. |
| `apps/api/src/app/notes/notes.controller.ts` | 2 new REST endpoints (`GET/POST` on assessment item evidence). |
| `supabase/migrations/<date>_assessment_item_evidence.sql` | New column + constraint + index + RLS on `requirement_evidence`. |
| i18n (`en/es/he/ru.ts`) | New keys for wizard step labels, evidence fields, "add at least one item" hint. |

## Testing

- Client unit tests for `AssessmentWizard` (step transitions, the Items→Review gate, create-vs-update on Details re-visit) and for the extracted `AssessmentItemsPanel` (should absorb most of the existing Items-tab assertions from `assessment-detail.unit.test.tsx`, moved rather than duplicated).
- Unit tests for the new evidence hooks/component.
- Contract tests for the 2 new `NotesStrategy` methods on both Fake and Supabase strategies.
- Mandatory live Playwright verification of the full wizard end-to-end (Details → add 2+ items with scoring → link a control → attach evidence → set residual → Review → Finish → confirm the created assessment matches on the detail page), per AGENTS.md.

## RLS

`requirement_evidence`'s existing RLS policy is widened, not replaced, to add an `assessment_item_id`-scoped branch joining through `risk_assessment_items` → `risk_assessments` → `org_profiles`, mirroring the existing `risk_id` branch exactly. No new `using (true)`.

## Self-Review

- **Scope check**: this spec covers the wizard + evidence only. It does not touch the Risk Register bridge or Findings/Issue bridge — those are B.2.2/B.2.3, separate specs.
- **No backend lifecycle/scoring changes**: confirmed B.2.1 introduces zero new `Assessment`/`AssessmentItem` fields or methods beyond evidence — everything else is UI reorganization over B.1's existing, already-reviewed backend.
- **Placeholder scan**: the two query-hook file-placement questions (colocate with `risks.ts` vs. new file) are left as an explicit implementation-time decision with a stated tie-breaker (avoid duplication), not a vague TODO — plan tasks will make the call before writing hooks.
