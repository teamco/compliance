# Risk Assessments (Phase B.2.2) — Risk Register Bridge — Design Spec

## Problem

Phase B.1 built the Assessment data model, lifecycle, and item scoring; Phase B.2.1 added the guided wizard and evidence attachment. But an assessment's findings still live in complete isolation from the Risk Register — there is no way to turn an assessment item's finding into a tracked Risk, no way to associate a re-scoring assessment with an existing Risk, and a Risk's own detail page has a hardcoded, always-empty "Assessment" tab (`apps/client/src/routes/_dashboard/-risks-detail.page.tsx:136-140`) waiting for exactly this bridge.

The client's requirements doc names this explicitly (points 6-7): when an assessment identifies a risk scenario, the user should be offered **Create New Risk** / **Link Existing Risk** / **Do Not Register**; and when re-assessing a scenario already linked to an existing Risk (e.g. `RSK-0017`), completing the work should let the user **Submit Risk Reassessment** — updating the Risk's residual score with an explicit reason, never silently overwriting it. This is the first actual implementation of a cross-module bridge in this codebase: the type system already anticipates it (`RiskSource` already has a `'risk_assessment'` value, `RequirementEvidence` already links across modules), but nothing is wired.

## Scope (Phase B.2.2)

- A one-to-one link from an `AssessmentItem` to a `Risk` (`AssessmentItem.linkedRiskId`), covering both "this item created a new Risk" and "this item is linked to an existing Risk" — same field, same meaning either way.
- **Create New Risk** from an item: prompts only for the one field genuinely missing from the item/assessment context (`taxonomyCategoryId`), auto-fills everything else from the item and its parent assessment, creates the Risk via the existing `createRisk` path, and records the link.
- **Link Existing Risk** from an item: a searchable picker over the org's existing Risks; sets the link with an explicit same-org check.
- **Unlink**: clears the link, so a mistaken link/create can be corrected without any destructive side effect on the Risk itself.
- **Submit Risk Reassessment**: for an already-linked item, pushes the item's residual likelihood/impact onto the linked Risk together with a required reason — reusing the Risk Register's *already-shipped* automatic snapshot-on-score-change mechanism (`updateRisk`'s `scoreFieldsChanging` check) for the audit trail the requirements doc asks for. No new backend method for this — it's a client-side call to the existing `useUpdateRisk` hook.
- Replacing the Risk detail page's hardcoded "Assessment" tab with a real list of every assessment item linked to that Risk.

Explicitly out of scope for B.2.2:
- **"Do Not Register"** is not a persisted decision — it's simply not clicking Create/Link. No new field, no tracked "skipped" state (the requirements doc's own MVP list only names Create/Link Risk).
- **Phase B.2.3**: the Findings → Create Issue bridge — separate spec.
- Any change to `Risk.inherentLikelihood`/`inherentImpact` from a reassessment — only residual fields are touched (see Key Flows).
- A generic "relate this Risk to that Risk" graph — this bridge is specifically Assessment-item-to-Risk, one direction of the requirements doc's broader "GRC graph" vision, not the whole graph.

## Architecture

Same layering as every prior phase: shared types (`libs/shared/src/strategies/notes.ts`) → Fake strategy → migration → Supabase strategy → notes MS `@MessagePattern` handlers → `notes-client` TCP proxy → gateway REST → React Query hooks → client components. Three of the four new operations are genuinely new backend methods; the fourth (reassessment) reuses `updateRisk`/`useUpdateRisk` exactly as they already exist — confirmed by reading `apps/client/src/queries/risks.ts:47-58`: `useUpdateRisk(id)` already accepts `RiskPatch & { reason?: string }` and already invalidates the snapshots query on success.

## Data Model

```typescript
// libs/shared/src/strategies/notes.ts — one new field, no new type

export interface AssessmentItem {
  id: string;
  assessmentId: string;
  orgId: string;
  subject: string;
  description: string;
  inherentLikelihood: number;
  inherentImpact: number;
  inherentScore: number;
  inherentLabel: RiskScoreLabel;
  residualLikelihood?: number;
  residualImpact?: number;
  residualScore?: number;
  residualLabel?: RiskScoreLabel;
  linkedRiskId?: string; // NEW
  createdAt: string;
  updatedAt: string;
}
```

`NotesStrategy` gains four methods:

```typescript
createRiskFromAssessmentItem(
  orgId: string,
  userId: string,
  itemId: string,
  data: { taxonomyCategoryId: string },
): Promise<Risk>;

linkAssessmentItemToRisk(itemId: string, riskId: string): Promise<AssessmentItem>;

unlinkAssessmentItemFromRisk(itemId: string): Promise<AssessmentItem>;

listAssessmentItemsForRisk(riskId: string): Promise<AssessmentItemWithContext[]>;
```

```typescript
export interface AssessmentItemWithContext extends AssessmentItem {
  assessmentCode: string;
  assessmentTitle: string;
  assessmentStatus: AssessmentStatus;
}
```

No changes to `Risk`, `RiskInput`, or `RiskPatch` — `createRiskFromAssessmentItem` calls the existing `createRisk(orgId, userId, data: RiskInput)` internally with a constructed `RiskInput`, then sets the new Risk's id as the item's `linkedRiskId`. Provenance is carried entirely by the existing `Risk.source`/`sourceRef` fields (`source: 'risk_assessment'`, `sourceRef: itemId`) — both already defined, both currently unused by any real call site.

### `createRiskFromAssessmentItem`'s field mapping

| `RiskInput` field | Source |
|---|---|
| `title` | `item.subject` |
| `riskStatement` | `item.description` (falls back to `item.subject` if description is empty) |
| `taxonomyCategoryId` | the one caller-supplied field |
| `ownerId` | parent `Assessment.ownerId` |
| `businessUnit` | parent `Assessment.businessUnit` |
| `assetIds` | parent `Assessment.assetIds` |
| `vendorIds` | parent `Assessment.vendorIds` |
| `inherentLikelihood` | `item.inherentLikelihood` |
| `inherentImpact` | `item.inherentImpact` |
| `source` | `'risk_assessment'` |
| `sourceRef` | `item.id` |

Implementers must fetch the parent `Assessment` (via `item.assessmentId`) inside this method to read `ownerId`/`businessUnit`/`assetIds`/`vendorIds` — the item itself carries none of these.

### Migration

```sql
-- supabase/migrations/<date>_assessment_item_risk_link.sql
alter table public.risk_assessment_items
  add column linked_risk_id uuid references public.risks(id) on delete set null;

create index risk_assessment_items_linked_risk_idx
  on public.risk_assessment_items(linked_risk_id);

-- Widen the existing org-scoped policy on risk_assessment_items (added in Phase B.1)
-- with a linked_risk_id branch, mirroring the exact join-qualification pattern
-- already used successfully for assessment_item_id/risk_id/control_id branches
-- on requirement_evidence (Phase B.2.1) — every column reference qualified,
-- no bare identifiers:
--   and (
--     linked_risk_id is null
--     or exists (
--       select 1 from public.risks r
--       where r.id = risk_assessment_items.linked_risk_id
--         and r.org_id = risk_assessment_items.org_id
--     )
--   )
```

`on delete set null` (not `cascade`) is deliberate: deleting a Risk must not delete the assessment item that referenced it — it should just drop back to "unlinked."

## Key Flows

### Create New Risk (from an unlinked item)

In `AssessmentItemsPanel`'s expanded item view, a new "Risk Register" section shows, when `item.linkedRiskId` is unset, two buttons: **Create New Risk** and **Link Existing Risk**.

"Create New Risk" opens a small `Dialog` with exactly one field — Category (`<select>` from `useRiskTaxonomy(orgId)`, the same hook the manual risk-create form already uses) — plus a read-only preview line showing what will be auto-filled (title, inherent score, owner). On submit, calls `createRiskFromAssessmentItem(orgId, userId, item.id, { taxonomyCategoryId })`; on success, the section switches to the "linked" state (below) and the new Risk's code is shown in a toast.

### Link Existing Risk

"Link Existing Risk" opens a `Dialog` with a searchable `Combobox` (or the same pattern as the Owner/Approver pickers) built from `useRisks(orgId)`, filtered client-side by title/`riskId` as the user types. Selecting a Risk calls `linkAssessmentItemToRisk(item.id, risk.id)`. The strategy implementation verifies `risk.orgId === item's orgId` before writing — an explicit application of the lesson from Phase B.2.1's final review, where a missing same-org check on a new write endpoint was found and fixed.

### Linked state — Reassessment and Unlink

Once `item.linkedRiskId` is set, the section instead shows: the linked Risk's code + title (via `useRisk(linkedRiskId)`) as a link to `/risks/$id`, a small "Unlink" control, and a **Submit Risk Reassessment** button. The button is disabled until the item itself has both `residualLikelihood` and `residualImpact` set (reassessing with no residual score would just be re-stating the inherent score under a different name).

Clicking it opens a `Dialog` showing "Current residual: `{risk.residualScore} ({risk.residualLabel})` → Proposed: `{item.residualScore} ({item.residualLabel})`" and a required `Reason` `<textarea>`. Submit calls:

```typescript
useUpdateRisk(item.linkedRiskId).mutate({
  residualLikelihood: item.residualLikelihood,
  residualImpact: item.residualImpact,
  reason: reasonText,
});
```

This is the entire implementation of "Submit Risk Reassessment" — no new backend, because `updateRisk` already snapshots the Risk's pre-patch state into `RiskSnapshot` whenever a residual field changes (`apps/microservices/notes/src/app/supabase-notes.strategy.ts:2054-2081`, mirrored in the Fake strategy), and the Risk detail page's History tab already renders `RiskSnapshot.reason` when present (`-risks-detail.page.tsx:313-332`) — it has simply never had a real caller supply one until now.

"Unlink" calls `unlinkAssessmentItemFromRisk(item.id)` with no confirmation dialog (unlinking is non-destructive to the Risk — it only clears the item's own pointer, so this does not need the AlertDialog-confirm pattern reserved for genuinely destructive actions).

### Risk detail page — the Assessment tab, finally real

Replace the hardcoded block at `-risks-detail.page.tsx:136-140` with a real render sourced from a new `useAssessmentItemsForRisk(riskId)` hook, following the same list-rendering shape as the adjacent Controls tab (`useRiskControlMappings`): each row shows the parent assessment's code/title (linking to `/assessments/$id`) and the item's subject + inherent/residual scores.

## Component Map

| File | Change |
|---|---|
| `libs/shared/src/strategies/notes.ts` | `AssessmentItem.linkedRiskId?`, `AssessmentItemWithContext`, 4 new `NotesStrategy` methods. |
| `libs/shared/src/strategies/fakes/fake-notes.ts` | Implement the 4 methods. |
| `supabase/migrations/<date>_assessment_item_risk_link.sql` | New column, index, widened RLS policy. |
| `apps/microservices/notes/src/app/supabase-notes.strategy.ts` | Implement the 4 methods. |
| `apps/microservices/notes/src/app/notes.controller.ts` | 4 new `@MessagePattern` handlers. |
| `libs/notes-client/src/lib/notes-client.service.ts` | 4 new proxy methods. |
| `apps/api/src/app/notes/notes.controller.ts` | 4 new REST endpoints. |
| `apps/client/src/queries/assessments.ts` | `useCreateRiskFromAssessmentItem`, `useLinkAssessmentItemToRisk`, `useUnlinkAssessmentItemFromRisk`. |
| `apps/client/src/queries/risks.ts` | `useAssessmentItemsForRisk(riskId)` (reverse query — lives here since it's Risk-tab-facing, mirroring where `useRiskControlMappings` already lives). |
| `apps/client/src/components/assessments/AssessmentItemsPanel.tsx` | New "Risk Register" section in the expanded item view (Create/Link/Unlink/Reassess), 3 new small dialogs. |
| `apps/client/src/routes/_dashboard/-risks-detail.page.tsx` | Assessment tab replaced with a real list. |
| i18n (`en/es/he/ru.ts`) | New keys for the Risk Register section, its 3 dialogs, and the Assessment tab's list. |

## Testing

- Contract tests for the 4 new `NotesStrategy` methods on both Fake and Supabase strategies, including: same-org enforcement on `linkAssessmentItemToRisk` (reject cross-org), correct field mapping on `createRiskFromAssessmentItem`, `unlinkAssessmentItemFromRisk` clearing the field, `listAssessmentItemsForRisk` returning items with their parent assessment's code/title/status attached.
- Client unit tests for the new `AssessmentItemsPanel` Risk Register section (unlinked state shows both buttons, linked state shows the reassess/unlink controls with the reassess button correctly gated on both residual fields being present) and for the Risk detail page's Assessment tab (renders real data, no longer the hardcoded string).
- Mandatory live Playwright verification: create a new Risk from an assessment item, confirm it appears in the Risk Catalog with the right owner/scope/score; separately, link an item to an existing Risk, submit a reassessment, and confirm the Risk's residual score updates and a new entry with the reason text appears in that Risk's History tab.

## RLS

`risk_assessment_items`'s existing org-scoped policy (from Phase B.1) is widened, not replaced, with a `linked_risk_id`-scoped branch — same fully-qualified join pattern already proven correct three times over in this project's history (`risk_id`/`control_id`/`assessment_item_id` branches on `requirement_evidence`). No new `using (true)`.

## Self-Review

- **Scope check**: covers the Assessment→Risk link (create/link/unlink/reassess) and the Risk detail page's Assessment tab only. Does not touch Findings/Issues (B.2.3) or any other cross-module edge from the requirements doc's broader "GRC graph" vision.
- **No new backend for reassessment**: verified `useUpdateRisk`'s real current signature (`RiskPatch & { reason?: string }`) and the automatic snapshot mechanism both already exist and need zero changes — confirmed by reading the live source, not assumed.
- **Authorization**: `linkAssessmentItemToRisk`'s same-org check is called out explicitly in Key Flows as a direct, deliberate application of a lesson from the immediately-preceding phase's final review (a missed same-org check was a real, fixed finding there) — not an afterthought.
- **Placeholder scan**: no vague steps: the exact `RiskInput` field mapping for `createRiskFromAssessmentItem` is a concrete table, not "map the relevant fields."
