# Risk Assessments (Phase B.1) — Design Spec

## Problem

The current `/assessments` module (`apps/client/src/routes/_dashboard/assessments.tsx` / `assessments_.$id.tsx`, backed by `RiskAssessment`/`RiskAssessmentItem` in `libs/shared/src/strategies/notes.ts`) is a functional but minimal stub: assessment type is a hardcoded `'cvra' | 'ctra'` enum, creation only captures Title/Type/Scope (free text), and items are flat free-text rows (subject/description/likelihood/impact/mitigations) with no connection to real Assets, Vendors, Controls, or the Risk Register.

The client's own requirements document (`docs/requirements/Risk Assessments.docx`, 24 points of feedback) asks for a much richer module: a generic, org-configurable assessment-type model; real object references (owner, business unit, in-scope assets/vendors) instead of free text; genuine CVRA vs CTRA workflow differences; inherent→controls→residual scoring reusing the Controls module; a full approval lifecycle; and a bidirectional bridge to the Risk Register (an assessment can spawn or update a Risk; a Risk's Assessment tab — currently a hardcoded empty state per the Risk Register Phase A spec — should show the assessments that produced it).

The doc's own scope is large enough that it doesn't fit one plan. This spec covers **Phase B.1 only**: the data model, creation, item scoring, and lifecycle — the foundation everything else builds on. Explicitly out of scope for B.1 (deferred to later phases, decided by the user):

- **Phase B.2**: multi-step guided wizard UI (replacing B.1's plain create-dialog), CVRA/CTRA-specific step flows, evidence attachment, the Risk Register bridge (Create New Risk / Link Existing Risk / Submit Risk Reassessment — the piece that finally populates the Risk Profile's Assessment tab), and the Findings → Create Issue bridge.
- **Phase B.3**: a management-view landing page with KPI bar, comments, immutable audit history, recurring assessments, and basic report export.
- **Never** (per the client doc's own explicit "eventually" list, not revisited here): AI-assisted suggestions, CVE/EPSS feed integration, MITRE ATT&CK mapping, comparison reports, full assessment templates (beyond the configurable-type model below).

## Scope (Phase B.1)

- Org-configurable `AssessmentType` (replaces the hardcoded `cvra`/`ctra` enum) — each type carries its own item-noun labels (e.g. "Vulnerability" vs "Threat Scenario").
- Assessment creation with real references: owner, business unit, in-scope Assets (multi), in-scope Vendors (multi), due date, a designated approver.
- Assessment code auto-generation (`ASM-XXXXXX`), following the max-suffix+1 convention (not count-based — see Key Flows).
- `AssessmentItem` with inherent scoring (methodology-driven, reusing the org's active `RiskMethodology` from Risk Register Phase A), a controls step (direct many-to-many link to real `InternalControl` objects, reusing the `RiskControlMapping` pattern), and residual scoring.
- Full lifecycle state machine (`draft → in_progress → pending_review → changes_requested → approved → completed → archived`) with an Owner + single Approver model (mirroring `RiskAcceptance.approverId` from Phase A), enforced server-side.
- List + detail pages replacing the current stub UI (plain create Dialog, not the guided wizard — that's B.2).

## Architecture

Same layering as Risk Register: shared types (`libs/shared/src/strategies/notes.ts`) → Fake strategy → Supabase strategy → notes MS `@MessagePattern` handlers → `notes-client` TCP proxy → gateway REST → React Query hooks → client components. No new microservice.

## Data Model

```typescript
// ─── Assessment Type (org-configurable, replaces hardcoded cvra/ctra) ──────

export interface AssessmentType {
  id: string;
  orgId: string;
  name: string;                    // "Cyber Vulnerability Risk Assessment"
  itemNounSingular: string;        // "Vulnerability"
  itemNounPlural: string;          // "Vulnerabilities"
  archived: boolean;
  createdAt: string;
}

export interface AssessmentTypeInput {
  name: string;
  itemNounSingular: string;
  itemNounPlural: string;
}

// ─── Assessment ─────────────────────────────────────────────────────────────

export type AssessmentStatus =
  | 'draft' | 'in_progress' | 'pending_review' | 'changes_requested'
  | 'approved' | 'completed' | 'archived';

export interface Assessment {
  id: string;
  assessmentCode: string;          // "ASM-000101", same convention as RSK-
  orgId: string;
  userId: string;
  title: string;
  assessmentTypeId: string;
  ownerId: string;
  businessUnit?: string;
  assetIds: string[];
  vendorIds: string[];
  dueDate?: string;
  approverId?: string;
  methodologyId: string;           // pinned RiskMethodology, same pattern as Risk
  status: AssessmentStatus;
  itemCount: number;
  highestInherentScore?: number;
  highestInherentLabel?: RiskScoreLabel;
  highestResidualScore?: number;
  highestResidualLabel?: RiskScoreLabel;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentInput {
  title: string;
  assessmentTypeId: string;
  ownerId: string;
  businessUnit?: string;
  assetIds?: string[];
  vendorIds?: string[];
  dueDate?: string;
  approverId?: string;
}

export interface AssessmentPatch {
  title?: string;
  ownerId?: string;
  businessUnit?: string;
  assetIds?: string[];
  vendorIds?: string[];
  dueDate?: string;
  approverId?: string;
  status?: AssessmentStatus;
}

// ─── Assessment Item ─────────────────────────────────────────────────────────

export interface AssessmentItem {
  id: string;
  assessmentId: string;
  orgId: string;
  subject: string;                 // "Unpatched Apache Log4j on web-01"
  description: string;
  inherentLikelihood: number;
  inherentImpact: number;
  inherentScore: number;
  inherentLabel: RiskScoreLabel;
  residualLikelihood?: number;
  residualImpact?: number;
  residualScore?: number;
  residualLabel?: RiskScoreLabel;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentItemInput {
  subject: string;
  description: string;
  inherentLikelihood: number;
  inherentImpact: number;
}

export interface AssessmentItemPatch {
  subject?: string;
  description?: string;
  inherentLikelihood?: number;
  inherentImpact?: number;
  residualLikelihood?: number;
  residualImpact?: number;
}

// ─── Item ↔ Control (reuses the RiskControlMapping shape) ──────────────────

export interface AssessmentItemControlMapping {
  id: string;
  itemId: string;
  controlId: string;
  controlCode: string;
  controlTitle: string;
  effectivenessNote?: string;
  createdAt: string;
}

export interface AssessmentItemControlMappingInput {
  controlId: string;
  controlCode: string;
  controlTitle: string;
  effectivenessNote?: string;
}
```

`RiskScoreLabel` is reused from the Risk Register types (already defined in `libs/shared/src/strategies/notes.ts`), not redefined.

`highestInherentScore`/`highestResidualScore`/labels on `Assessment` are a denormalized summary (max across all items), recomputed whenever an item is created/updated/deleted — the same reasoning as `Risk.inherentScore` being recomputed on patch, done so the list page doesn't need to aggregate across items on every render.

`methodologyId` is pinned at assessment-creation time from the org's currently-active `RiskMethodology`, mirroring `Risk.methodologyId` — historical assessments stay interpretable if the org's methodology changes later.

### `NotesStrategy` additions

```typescript
  // Assessment Types
  listAssessmentTypes(orgId: string): Promise<AssessmentType[]>;
  createAssessmentType(orgId: string, data: AssessmentTypeInput): Promise<AssessmentType>;
  archiveAssessmentType(id: string): Promise<AssessmentType>;

  // Assessments
  listAssessments(orgId: string): Promise<Assessment[]>;
  createAssessment(orgId: string, userId: string, data: AssessmentInput): Promise<Assessment>;
  getAssessment(id: string): Promise<Assessment | null>;
  updateAssessment(id: string, patch: AssessmentPatch, changedBy: string): Promise<Assessment>;
  deleteAssessment(id: string): Promise<void>;

  // Lifecycle transitions (each enforces its own precondition + role check server-side)
  startAssessment(id: string, userId: string): Promise<Assessment>;               // draft -> in_progress, owner only
  submitForReview(id: string, userId: string): Promise<Assessment>;               // in_progress -> pending_review, owner only, requires approverId + >=1 item
  approveAssessment(id: string, userId: string): Promise<Assessment>;             // pending_review -> approved, approver only
  requestChanges(id: string, userId: string, note: string): Promise<Assessment>;  // pending_review -> changes_requested, approver only
  completeAssessment(id: string, userId: string): Promise<Assessment>;            // approved -> completed, owner only
  archiveAssessment(id: string, userId: string): Promise<Assessment>;             // draft|completed -> archived, owner only

  // Assessment Items
  listAssessmentItems(assessmentId: string): Promise<AssessmentItem[]>;
  createAssessmentItem(assessmentId: string, data: AssessmentItemInput): Promise<AssessmentItem>;
  updateAssessmentItem(id: string, patch: AssessmentItemPatch): Promise<AssessmentItem>;
  deleteAssessmentItem(id: string): Promise<void>;

  // Item <-> Control mapping
  listAssessmentItemControlMappings(itemId: string): Promise<AssessmentItemControlMapping[]>;
  addAssessmentItemControlMapping(
    itemId: string,
    data: AssessmentItemControlMappingInput,
  ): Promise<AssessmentItemControlMapping>;
  removeAssessmentItemControlMapping(id: string): Promise<void>;
```

The old `RiskAssessment`/`RiskAssessmentItem` types and their CRUD methods (`listRiskAssessments`, `createRiskAssessment`, etc. — exact names TBD at plan time from reading the current file) are replaced outright by the above, the same way Risk Register Phase A replaced `Risk`/`RiskInput`/`RiskPatch` in place rather than adding a parallel type family. The legacy `RiskLikelihood`/`RiskImpact` string-enum types (kept alive during Risk Register Phase A specifically because this feature used them) become fully dead once this plan lands — cleanup deferred to the implementation plan's own dead-code check, following the same discipline used in Risk Register Task 6.

## Key Flows

**Assessment code generation.** `ASM-` + zero-padded `(max existing numeric suffix for the org) + 1`, formatted to 6 digits — the max-suffix approach fixed in Risk Register's final review (not a live `count(*)`, which collides deterministically after any delete). `unique(org_id, assessment_code)` is the collision backstop.

**Creation.** A `Dialog` (not a wizard — that's B.2) captures Title, AssessmentType (select, from the org's configured types), Owner, Business Unit, in-scope Assets (`MultiSelect`, reusing the Phase A component), in-scope Vendors (`MultiSelect`), Due Date, Approver. Status starts at `draft`; the org's currently-active `RiskMethodology` is pinned at creation.

**Adding an item.** A plain form (not the wizard) captures Subject, Description, Inherent Likelihood/Impact (selects populated from the pinned methodology's labels, identical UX to Risk's create-dialog). Inherent score/label compute immediately using the same threshold-lookup logic as Risk.

**Controls step.** Each item gets a small `RiskControlMapping`-pattern mini-table: add/remove real `InternalControl` links (not free text), each with an optional effectiveness note. Once at least one control is linked, the item's Residual Likelihood/Impact fields become available for the assessor to fill in manually (residual score/label compute from those, same threshold logic) — this is a human judgment call informed by control effectiveness, not an automatic reduction formula, matching the Risk Register's own residual-scoring design.

**Denormalized summary recompute.** Any item create/update/delete recomputes the parent `Assessment`'s `highestInherentScore`/`Label` and `highestResidualScore`/`Label` (max across all current items) in the same request — same pattern as how `updateRisk` recomputes `Risk.inherentScore` inline.

**Lifecycle transitions**, each a dedicated method (not a generic `updateAssessment({status})`, so each can carry its own precondition and role check without a giant conditional):

| Transition | Caller | Precondition |
|---|---|---|
| `draft → in_progress` | Owner | none |
| `in_progress → pending_review` | Owner | `approverId` set, `itemCount >= 1` |
| `pending_review → approved` | Approver | caller === `approverId` |
| `pending_review → changes_requested` | Approver | caller === `approverId`, note required |
| `changes_requested → in_progress` | Owner | none |
| `approved → completed` | Owner | none |
| `draft \| completed → archived` | Owner | none |

Approver-gating is enforced at the strategy layer (Fake and Supabase both), not only hidden in the UI — a direct lesson from Risk Register's final review, where the equivalent Risk Acceptance check needed a follow-up fix to close a server-side gap. `approveAssessment`/`requestChanges` reject with a clear error if the caller isn't the designated approver, mirroring `RiskAcceptance`'s corrected `approveRiskAcceptance` implementation.

**Migration.** `risk_assessments`/`risk_assessment_items` tables already exist (the current CVRA/CTRA stub) — this is an `ALTER`, not a recreate, following the same convention as Risk Register's migration. Backfill: seed two default `AssessmentType` rows per org (`Cyber Vulnerability Risk Assessment` / `Cyber Threat Risk Assessment`) matching the existing `type` enum's two values, map existing rows' `type` to the matching new `assessment_type_id`; map `status` (`draft`/`in_review`/`completed`) to the new enum (`in_review` → `pending_review`, others map 1:1, the new intermediate statuses are simply unreachable for pre-existing rows); copy existing `riskScore` into `highest_inherent_score` as a best-effort seed; map existing items' `likelihood`/`impact` string values to numbers using the same mapping table built for the Risk Register migration.

## RLS

Every new/altered table is org-scoped via `org_profiles.user_id = auth.uid()`, no `using(true)` — the pre-existing gap on `risks`/`assets`' SELECT policies (found and fixed opportunistically in Risk Register's final review) is not repeated here. `assessment_item_control_mappings`' write policy verifies the linked `control_id`'s org matches the item's assessment's org (the same cross-column check pattern proven for `risk_control_mappings`).

## Self-Review

- **Placeholder scan**: no TBD/TODO in this spec; every type field has a concrete purpose stated in Key Flows.
- **Internal consistency**: `Assessment.methodologyId` and `AssessmentItem.inherent*` fields align with the Risk Register's existing `RiskMethodology` shape (`likelihoodLabels`/`impactLabels`/`thresholds`/`appetiteThreshold`) — no new methodology concept introduced, reused as-is per the user's explicit choice.
- **Scope check**: this spec covers Phase B.1 only; the plan built from it must not attempt the wizard, the Risk/Issue bridges, evidence, or reporting — those get their own spec when B.2/B.3 are brainstormed.
- **Ambiguity check**: "Approver" is a single designated user per assessment (matching Risk Acceptance's `approverId`), not a role-based multi-approver chain — resolved explicitly per the user's choice, not left implicit.
