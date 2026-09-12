# Risk Register — Design Spec

**Branch:** `feature/risk-register`
**Date:** 2026-09-12
**Spec source:** `docs/requirements/Risk Register.docx` (client feedback on the current Risk Catalog screen)

---

## Problem

The current "Risk Catalog" is a flat list: `title + free-text category + likelihood + impact → single risk score`. It has no risk ID scheme, no owner, no distinction between risk-before-controls and risk-after-controls, no detail page (`risks.tsx` is list-only, no `risks_.$id.tsx`), no relationships to Assets/Vendors/Controls, and no history — editing a risk silently overwrites its prior score. The client's requirements doc frames this as one of the platform's core modules and asks for a proper enterprise risk register: Identification → Inherent Risk → Control Evaluation → Residual Risk → Treatment → Acceptance → Monitoring.

This is Phase A of a two-phase project (Phase B, "Risk Assessments," is a separate spec/plan that builds on this one — Risk Assessments' "Create Risk / Link Existing Risk" bridge needs a real Risk Register to link to).

---

## Scope

**In scope for Phase A** (confirmed with the client's own doc plus explicit user decisions during brainstorming — several items the doc marks "eventually" were pulled into Phase A on user request):

- Rename Risk Catalog → Risk Register (nav label + route content, not the URL — `/risks` stays)
- **Configurable Risk Taxonomy** (org-scoped, admin CRUD) — replaces free-text category
- **Configurable Risk Methodology** (org-scoped: scale size, labels, thresholds, appetite) — replaces hardcoded Low/Medium/High math
- Auto-generated Risk ID (`RSK-000123`, sequential per org)
- Risk Statement field, Owner, Business Unit, Source
- Affected Assets + Related Vendors links (multi-select against existing Asset Catalog / Vendors modules)
- Inherent Risk (no default Medium/Medium — both selects start blank)
- Residual Risk (set from the Risk Profile, after control evaluation)
- Direct many-to-many **Risk ↔ Control** mapping (new join table, independent of Findings)
- Treatment (strategy/owner/plan/target score/target date)
- **Risk Appetite** comparison (folded into Risk Methodology config — a threshold on the same score scale)
- **Risk Acceptance workflow** (justification/compensating controls/expiration/approver, requested→reviewed→approved/rejected)
- **Risk Heatmap** (interactive scale×scale grid, Inherent/Residual toggle, click-to-filter)
- Risk Profile detail page: Overview / Assessment / Controls / Treatment / Relationships / Evidence / History tabs
- Immutable history (`RiskSnapshot` rows on every inherent/residual/treatment change)
- Evidence reuse: extend the existing `RequirementEvidence` type (already used by Controls) with a nullable `riskId` owner, rather than a new Evidence type

**Out of scope for Phase A** (doc explicitly defers these; not raised during brainstorming):

- Multidimensional impact (financial/operational/regulatory/... sub-scores) — doc says don't build this yet, just don't design out of it later (single `impact` field per inherent/residual pair is fine)
- KRIs/KCIs (Key Risk Indicators) — doc frames as a later differentiator
- AI Risk Assistant (suggest risks from an asset, improve risk statement, duplicate detection, rating-consistency challenge) — doc frames as "eventually," not MVP
- Risk Library / Taxonomy-as-reusable-scenario-templates (distinct from the org's own taxonomy, which IS in scope) — doc explicitly separates these two concepts and only asks for the org-taxonomy half now
- Recurring/scheduled risk reviews
- Assessment integration itself (Phase B) — the Assessment tab on the Risk Profile is built now but shows an empty state; it becomes populated once Phase B lands
- Gap Analysis / Issue / Exception → auto-create-Risk bridges (`Risk.source` enum includes these as values so the field is ready, but no module actually fires this integration yet — manual creation only)

---

## Architecture

Follows the exact layering Controls established: `libs/shared` types → `FakeNotesStrategy` (in-memory) → `SupabaseNotesStrategy` (real) → notes MS `@MessagePattern` handlers → `NotesClientService` TCP proxy → gateway REST controller → client React Query hooks → UI. No new microservice — this lives entirely in the existing `notes` MS/module, same as Risks already do today.

```
libs/shared/src/strategies/notes.ts       + RiskMethodology, RiskTaxonomyCategory, Risk (rebuilt),
                                             RiskControlMapping, RiskAcceptance, RiskSnapshot types
libs/shared/src/strategies/fakes/fake-notes.ts   + in-memory impls, seeded default methodology+taxonomy
supabase/migrations/<ts>_risk_register.sql       + risk_methodologies, risk_taxonomy_categories,
                                                    (altered) risks, risk_control_mappings,
                                                    risk_acceptances, risk_snapshots tables
apps/microservices/notes/src/app/
  ├── notes.controller.ts                 + MessagePattern handlers
  └── supabase-notes.strategy.ts          + real persistence
libs/notes-client/                        + TCP proxy methods
apps/api/src/app/notes/notes.controller.ts + REST endpoints
apps/client/src/
  ├── queries/risks.ts                    (new — mirrors queries/controls.ts)
  ├── routes/_dashboard/
  │   ├── risks.tsx + -risks.page.tsx     (rebuild, split like controls.tsx was)
  │   └── risks_.$id.tsx + -risks-detail.page.tsx   (new)
  └── components/risks/
      ├── RiskHeatmap.tsx                 (new)
      ├── RiskMethodologySheet.tsx        (new — the gear-icon config panel)
      └── RiskTable.tsx                   (new — mirrors ControlsTable.tsx)
```

RLS for every new/altered table follows the Controls migration's corrected pattern exactly: org-scoped via `org_profiles.user_id = auth.uid()`, write policies verify cross-column ownership (e.g. a `risk_control_mappings` row's `control_id` must belong to a control in the same org as the `risk_id`'s risk) — this was a real bug caught and fixed in the Controls migration; do not repeat the original mistake here.

---

## Types (`libs/shared`)

```typescript
// ─── Risk Methodology ──────────────────────────────────────────────────────

export type RiskScoreLabel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskThresholdBand {
  maxScore: number;       // inclusive upper bound
  label: RiskScoreLabel;
}

export interface RiskMethodology {
  id: string;
  orgId: string;
  version: number;
  isActive: boolean;
  scaleSize: 3 | 4 | 5;
  likelihoodLabels: string[];   // length === scaleSize
  impactLabels: string[];       // length === scaleSize
  thresholds: RiskThresholdBand[]; // ordered ascending, covers 1..scaleSize*scaleSize
  appetiteThreshold: number;    // score strictly above this = "above appetite"
  createdAt: string;
}

export interface RiskMethodologyInput {
  scaleSize: 3 | 4 | 5;
  likelihoodLabels: string[];
  impactLabels: string[];
  thresholds: RiskThresholdBand[];
  appetiteThreshold: number;
}

// ─── Risk Taxonomy ─────────────────────────────────────────────────────────

export interface RiskTaxonomyCategory {
  id: string;
  orgId: string;
  name: string;
  archived: boolean;
  createdAt: string;
}

export interface RiskTaxonomyCategoryInput {
  name: string;
}

// ─── Risk (rebuilt) ─────────────────────────────────────────────────────────

export type RiskStatus = 'open' | 'monitoring' | 'closed';
export type RiskSource =
  | 'manual' | 'risk_assessment' | 'gap_analysis' | 'internal_audit' | 'external_audit'
  | 'vendor_assessment' | 'security_incident' | 'vulnerability' | 'issue'
  | 'regulatory_change' | 'management_review' | 'threat_intelligence';
export type RiskTreatmentStrategy = 'avoid' | 'mitigate' | 'transfer' | 'accept' | 'monitor';

export interface Risk {
  id: string;
  riskId: string;                 // RSK-000123, generated server-side
  orgId: string;
  userId: string;
  title: string;
  riskStatement: string;
  taxonomyCategoryId: string;
  ownerId: string;
  businessUnit?: string;
  source: RiskSource;
  sourceRef?: string;
  assetIds: string[];
  vendorIds: string[];

  methodologyId: string;
  inherentLikelihood: number;
  inherentImpact: number;
  inherentScore: number;
  inherentLabel: RiskScoreLabel;

  residualLikelihood?: number;
  residualImpact?: number;
  residualScore?: number;
  residualLabel?: RiskScoreLabel;
  aboveAppetite?: boolean;         // computed on write when residualScore is set

  treatmentStrategy?: RiskTreatmentStrategy;
  treatmentOwner?: string;
  treatmentPlan?: string;
  targetScore?: number;
  targetDate?: string;

  status: RiskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RiskInput {
  title: string;
  riskStatement: string;
  taxonomyCategoryId: string;
  ownerId: string;
  businessUnit?: string;
  source?: RiskSource;
  sourceRef?: string;
  assetIds?: string[];
  vendorIds?: string[];
  inherentLikelihood: number;
  inherentImpact: number;
}

export interface RiskPatch {
  title?: string;
  riskStatement?: string;
  taxonomyCategoryId?: string;
  ownerId?: string;
  businessUnit?: string;
  assetIds?: string[];
  vendorIds?: string[];
  inherentLikelihood?: number;
  inherentImpact?: number;
  residualLikelihood?: number;
  residualImpact?: number;
  treatmentStrategy?: RiskTreatmentStrategy;
  treatmentOwner?: string;
  treatmentPlan?: string;
  targetScore?: number;
  targetDate?: string;
  status?: RiskStatus;
}

// ─── Risk ↔ Control ─────────────────────────────────────────────────────────

export interface RiskControlMapping {
  id: string;
  riskId: string;
  controlId: string;
  controlCode: string;       // denormalized for display without a join
  controlTitle: string;
  effectivenessNote?: string; // e.g. "Effective", "Partially Effective" — free text in Phase A
  createdAt: string;
}

// ─── Risk Acceptance ────────────────────────────────────────────────────────

export type RiskAcceptanceStatus = 'requested' | 'reviewed' | 'approved' | 'rejected';

export interface RiskAcceptance {
  id: string;
  riskId: string;
  orgId: string;
  requestedBy: string;
  justification: string;
  compensatingControls: string;
  expiresAt: string;
  approverId: string;
  status: RiskAcceptanceStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RiskAcceptanceInput {
  justification: string;
  compensatingControls: string;
  expiresAt: string;
  approverId: string;
}

// ─── Risk History ───────────────────────────────────────────────────────────

export interface RiskSnapshot {
  id: string;
  riskId: string;
  inherentScore: number;
  inherentLabel: RiskScoreLabel;
  residualScore?: number;
  residualLabel?: RiskScoreLabel;
  treatmentStrategy?: RiskTreatmentStrategy;
  changedBy: string;
  reason?: string;
  createdAt: string;
}
```

`NotesStrategy` gains: `getRiskMethodology`/`upsertRiskMethodology`, `listRiskTaxonomy`/`createRiskTaxonomyCategory`/`archiveRiskTaxonomyCategory`, `getRisk` (new — currently missing), `addRiskControlMapping`/`removeRiskControlMapping`/`listRiskControlMappings`, `createRiskAcceptance`/`reviewRiskAcceptance`/`approveRiskAcceptance`/`rejectRiskAcceptance`/`getActiveRiskAcceptance`, `listRiskSnapshots`. Existing `listRisks`/`createRisk`/`updateRisk`/`deleteRisk` get richer input/patch types per above; `updateRisk` writes a `RiskSnapshot` before applying any inherent/residual/treatment change.

Evidence: `RequirementEvidence.controlId`/`frameworkId` both become fully optional-with-either (already true after Controls), add `riskId?: string` as a third possible owner; the existing "at least one owner" CHECK constraint pattern from the Controls migration extends to three columns instead of two.

---

## Key Flows

**Risk ID generation:** server-side, `RSK-` + zero-padded count of the org's existing risks + 1 (e.g. `RSK-000101`) — same lightweight convention already used for Asset codes (`AST-000101` in `fake-notes.ts`'s asset seeding and `createAsset`'s count-based fallback), just made mandatory/auto rather than optional/manual as the doc explicitly requests for Risk specifically. A `unique(org_id, risk_id)` constraint on the table is the collision backstop for the narrow concurrent-create race this approach doesn't fully close — acceptable for this codebase's traffic level, consistent with the simplicity bar already accepted for Asset codes.

**Creation dialog** (Dialog, per the mandatory overlay pattern): Title, Risk Statement (textarea, placeholder text hints at the cause/event/impact structure but no enforced sub-fields), Category (select, from org's `RiskTaxonomyCategory` list), Owner (select), Business Unit (text, optional), Source (select, defaults `manual`), Affected Assets (multi-select from Asset Catalog), Related Vendors (multi-select from Vendors), Inherent Likelihood + Inherent Impact (selects, **no default selected** — Create button disabled until both chosen, labels pulled from the org's active `RiskMethodology`). Inherent score computes and displays live as soon as both are chosen. Residual risk, treatment, and control mappings are NOT in this dialog — set later from the Risk Profile, matching the doc's explicit instruction not to front-load the whole lifecycle into creation.

**Editing inherent/residual/treatment:** every `updateRisk` call that changes any of `inherentLikelihood/inherentImpact/residualLikelihood/residualImpact/treatmentStrategy` first inserts a `RiskSnapshot` capturing the pre-change state, then applies the patch — so `History` always has the prior state on record, never just the new one.

**Risk Acceptance:** "Accept Risk" button (Treatment tab) → Dialog (justification, compensating controls, expiration date, approver) → creates `RiskAcceptance` with `status: 'requested'`. The designated approver reviews it (Approve/Reject + notes) from the same tab when viewing a risk they're the approver for — no separate approvals inbox in Phase A. Approving does not change `Risk.status`; it's evidence attached to the risk. Creating a new acceptance request supersedes any prior approved/rejected one for the same risk (only one "active" row queried via `status IN ('requested','reviewed','approved') AND expiresAt > now()`, most recent wins for display).

**Heatmap:** `scaleSize × scaleSize` grid (3×3/4×4/5×5 depending on the org's active methodology), Inherent/Residual toggle, cell color from the methodology's threshold bands, cell count from `filtered.filter(r => r.inherentLikelihood === row && r.inherentImpact === col)` (or residual equivalents). Clicking a cell sets a local `(likelihood, impact)` filter tuple that narrows the table below — same interaction model as the existing framework/domain/owner filters, just keyed on a coordinate pair instead of a single value.

**Relationships tab reverse-lookups:** Issues/Exceptions linked to this risk are derived, not stored directly on `Risk` — query `Finding` rows where `linkedRiskId === this risk's id`, then follow each Finding's `linkedIssueId`/`linkedExceptionId` (both already exist from Controls). No new join table needed for this specific display.

---

## Migration notes

`risks` table gets altered (not recreated) — add columns for the new fields, backfill strategy: existing rows get `riskId` generated retroactively in migration order, `taxonomyCategoryId` set to a new "Uncategorized" seed category created per-org on migration, `inherentLikelihood/inherentImpact` copied from the existing `likelihood`/`impact` text-enum columns (requires mapping the old 5-value enum to whatever the org's seeded default methodology uses — since every org gets the same seeded default 5×5 methodology, this mapping is 1:1 and lossless), `ownerId` defaults to the risk's existing `userId` if no better value is available.

---

## Self-Review

- **Placeholder scan:** none found — every field above has a concrete type and a stated default/behavior.
- **Internal consistency:** `Risk.methodologyId` pins the methodology version a risk's scores were computed under, so editing the org's methodology later doesn't retroactively reinterpret old scores — consistent with the "know how a 2026 score was calculated" requirement in the source doc.
- **Scope check:** focused enough for one implementation plan — comparable in size to the Controls plan (20 tasks), similarly decomposable into types → migration → both strategies → MS/gateway wiring → client hooks → list page → heatmap → detail page → acceptance workflow → i18n → tests.
- **Ambiguity check:** "one active acceptance at a time" resolved explicitly above (most recent non-terminal-expired wins). Risk ID generation simplified to match the existing Asset-code convention rather than introducing new sequence infrastructure, with a unique constraint as the collision backstop. Evidence reuse vs new type resolved (extend existing).
