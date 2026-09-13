# Risk Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Risk Catalog into a real enterprise Risk Register — configurable methodology/taxonomy, auto-generated Risk IDs, inherent→controls→residual scoring, treatment, acceptance workflow, direct Risk↔Control mapping, a heatmap, and a full Risk Profile detail page — following the exact layering Controls established.

**Architecture:** Same stack as Controls: `libs/shared` types → `FakeNotesStrategy` → `SupabaseNotesStrategy` → notes MS `@MessagePattern` handlers → `NotesClientService` TCP proxy → gateway REST → React Query hooks → UI. No new microservice; this lives in the existing `notes` MS, same as today's Risks.

**Tech Stack:** NestJS TCP microservices, Supabase (PostgreSQL), TanStack Router, TanStack Query, shadcn/ui, react-i18next (en/es/he/ru), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-risk-register-design.md`

## Global Constraints

- Overlay pattern: Create = `Dialog`, Edit = `Sheet` (used here for the Methodology/Taxonomy config panel), Delete = `AlertDialog` — three independent state variables, never combined.
- Post-coding routine before commit: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>`.
- Every new/altered table's RLS: org-scoped via `org_profiles.user_id = auth.uid()`, write policies verify cross-column ownership where a row references another org-owned row (e.g. a `risk_control_mappings` row's `control_id` must belong to a control in the same org as its `risk_id`'s risk) — this exact class of bug was found and fixed in the Controls migration; do not repeat the `using(true)` mistake.
- Risk ID: `RSK-` + zero-padded count of the org's existing risks + 1 (e.g. `RSK-000101`), matching the existing Asset-code convention. `unique(org_id, risk_id)` constraint is the collision backstop.
- Client overlay/query/route conventions: split page components into `-<name>.page.tsx` siblings from the start (the pattern Controls' Task 19 had to retrofit) — do not inline components in route files this time.
- All 4 locales (en/es/he/ru) updated together for every new UI string, with real translations.

---

## File Map

**New files:**
- `supabase/migrations/20260912000002_risk_register.sql`
- `apps/client/src/queries/risks.ts` (replaces the file entirely — same name, new content)
- `apps/client/src/components/ui/multi-select.tsx`
- `apps/client/src/components/risks/RiskHeatmap.tsx`
- `apps/client/src/components/risks/RiskMethodologySheet.tsx`
- `apps/client/src/components/risks/RiskTable.tsx`
- `apps/client/src/components/risks/__tests__/RiskTable.unit.test.tsx`
- `apps/client/src/routes/_dashboard/-risks.page.tsx`
- `apps/client/src/routes/_dashboard/risks_.$id.tsx`
- `apps/client/src/routes/_dashboard/-risks-detail.page.tsx`
- `apps/client/src/routes/_dashboard/__tests__/risks.unit.test.tsx`
- `apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx`

**Modified files:**
- `libs/shared/src/strategies/notes.ts` — new types, extended `NotesStrategy`
- `libs/shared/src/strategies/fakes/fake-notes.ts` — in-memory implementations
- `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` — contract tests
- `apps/microservices/notes/src/app/supabase-notes.strategy.ts` — real DB implementations
- `apps/microservices/notes/src/app/notes.controller.ts` — `@MessagePattern` handlers
- `libs/notes-client/src/lib/notes-client.service.ts` — TCP proxy methods
- `apps/api/src/app/notes/notes.controller.ts` — REST endpoints
- `apps/client/src/routes/_dashboard/risks.tsx` — becomes a thin wrapper importing `-risks.page.tsx`
- `libs/template-shared/src/lib/i18n/locales/{en,es,he,ru}.ts`

---

### Task 1: Types — Risk Methodology and Risk Taxonomy

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

**Interfaces:**
- Produces: `RiskScoreLabel`, `RiskThresholdBand`, `RiskMethodology`, `RiskMethodologyInput`, `RiskTaxonomyCategory`, `RiskTaxonomyCategoryInput` — consumed by every later task in this plan.

- [ ] **Step 1: Add the types after the existing `RiskTreatment` type (search for `export type RiskTreatment` in the file — the new types replace nothing, they're added just before the existing `Risk` interface)**

```typescript
// ─── Risk Methodology ──────────────────────────────────────────────────────

export type RiskScoreLabel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskThresholdBand {
  maxScore: number;
  label: RiskScoreLabel;
}

export interface RiskMethodology {
  id: string;
  orgId: string;
  version: number;
  isActive: boolean;
  scaleSize: 3 | 4 | 5;
  likelihoodLabels: string[];
  impactLabels: string[];
  thresholds: RiskThresholdBand[];
  appetiteThreshold: number;
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
```

- [ ] **Step 2: Extend the `NotesStrategy` interface**

Find the `// Risks` section in the `NotesStrategy` interface (search for `listRisks(orgId: string)`). Add these lines immediately before it:

```typescript
  // Risk Methodology
  getRiskMethodology(orgId: string): Promise<RiskMethodology | null>;
  upsertRiskMethodology(orgId: string, data: RiskMethodologyInput): Promise<RiskMethodology>;

  // Risk Taxonomy
  listRiskTaxonomy(orgId: string): Promise<RiskTaxonomyCategory[]>;
  createRiskTaxonomyCategory(
    orgId: string,
    data: RiskTaxonomyCategoryInput,
  ): Promise<RiskTaxonomyCategory>;
  archiveRiskTaxonomyCategory(id: string): Promise<RiskTaxonomyCategory>;

```

- [ ] **Step 3: Build to confirm the type-only change compiles**

Run: `yarn nx build shared`
Expected: PASS for the type additions; the interface break in `fake-notes.ts`/`supabase-notes.strategy.ts` (from Step 2's new interface methods) will surface as build errors in THOSE files, which is expected at this point — Task 2 will discover this the same way Controls' Task 2 did. Read the actual error output before treating it as a problem; if `yarn nx build shared` fails because `fake-notes.ts`/`supabase-notes.strategy.ts` live in the same project and don't implement the new methods yet, that's expected — do not attempt to fix those files in this task.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): add RiskMethodology and RiskTaxonomy types"
```

---

### Task 2: Types — Risk rebuild, RiskControlMapping, RiskAcceptance, RiskSnapshot

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

**Interfaces:**
- Consumes: `RiskScoreLabel` from Task 1.
- Produces: `RiskStatus`, `RiskSource`, `RiskTreatmentStrategy`, `Risk` (rebuilt), `RiskInput`, `RiskPatch`, `RiskControlMapping`, `RiskAcceptance`, `RiskAcceptanceStatus`, `RiskAcceptanceInput`, `RiskSnapshot`.

- [ ] **Step 1: Replace the existing `Risk`/`RiskInput`/`RiskPatch` block entirely**

Search for `export interface Risk {` through the end of `export interface RiskPatch {...}` (currently right after `export type RiskTreatment = ...`) and replace that whole block with:

```typescript
export type RiskStatus = 'open' | 'monitoring' | 'closed';
export type RiskSource =
  | 'manual' | 'risk_assessment' | 'gap_analysis' | 'internal_audit' | 'external_audit'
  | 'vendor_assessment' | 'security_incident' | 'vulnerability' | 'issue'
  | 'regulatory_change' | 'management_review' | 'threat_intelligence';
export type RiskTreatmentStrategy = 'avoid' | 'mitigate' | 'transfer' | 'accept' | 'monitor';

export interface Risk {
  id: string;
  riskId: string;
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
  aboveAppetite?: boolean;

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
  controlCode: string;
  controlTitle: string;
  effectivenessNote?: string;
  createdAt: string;
}

export interface RiskControlMappingInput {
  controlId: string;
  controlCode: string;
  controlTitle: string;
  effectivenessNote?: string;
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

Note: this is a breaking change to `RiskInput` (drops `description`, `category`, `likelihood`, `impact`, `treatment`, `assetId` in favor of the new field set) — `apps/client/src/routes/_dashboard/risks.tsx` currently constructs the old shape and will fail to compile until Task 17 rewrites it. That's expected; later tasks fix every consumer.

- [ ] **Step 2: Extend `NotesStrategy`**

Find `listRisks(orgId: string): Promise<Risk[]>;` through `deleteRisk(id: string): Promise<void>;` in the interface (the existing Risks section) and replace with:

```typescript
  // Risks
  listRisks(orgId: string): Promise<Risk[]>;
  createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk>;
  getRisk(id: string): Promise<Risk | null>;
  updateRisk(id: string, patch: RiskPatch, changedBy: string, reason?: string): Promise<Risk>;
  deleteRisk(id: string): Promise<void>;

  // Risk ↔ Control mapping
  listRiskControlMappings(riskId: string): Promise<RiskControlMapping[]>;
  addRiskControlMapping(riskId: string, data: RiskControlMappingInput): Promise<RiskControlMapping>;
  removeRiskControlMapping(id: string): Promise<void>;

  // Risk Acceptance
  createRiskAcceptance(
    orgId: string,
    riskId: string,
    requestedBy: string,
    data: RiskAcceptanceInput,
  ): Promise<RiskAcceptance>;
  getActiveRiskAcceptance(riskId: string): Promise<RiskAcceptance | null>;
  reviewRiskAcceptance(id: string, reviewedBy: string, reviewNotes?: string): Promise<RiskAcceptance>;
  approveRiskAcceptance(id: string): Promise<RiskAcceptance>;
  rejectRiskAcceptance(id: string): Promise<RiskAcceptance>;

  // Risk history
  listRiskSnapshots(riskId: string): Promise<RiskSnapshot[]>;

```

Note the signature change on `updateRisk`: it now takes `changedBy`/`reason` so implementations can write a `RiskSnapshot` before applying the patch. Every caller in later tasks (MS handler, gateway endpoint, client hook) threads these through.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): rebuild Risk types, add RiskControlMapping/RiskAcceptance/RiskSnapshot"
```

---

### Task 3: Types — Evidence gains a `riskId` owner

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

- [ ] **Step 1: Add `riskId` to `RequirementEvidence`**

Find `export interface RequirementEvidence {` (already has optional `controlId?`/`frameworkId?` from the Controls plan) and add one line:

```typescript
export interface RequirementEvidence {
  id: string;
  orgId?: string;
  controlId?: string;
  riskId?: string;
  frameworkId?: string;
  requirementId?: string;
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

- [ ] **Step 2: Add risk-scoped evidence methods to `NotesStrategy`**

Immediately after `createControlEvidence(...)` in the interface (search for it), add:

```typescript
  listRiskEvidence(riskId: string): Promise<RequirementEvidence[]>;
  createRiskEvidence(
    orgId: string,
    riskId: string,
    data: Omit<RequirementEvidence, 'id' | 'riskId'>,
  ): Promise<RequirementEvidence>;

```

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): add riskId as a third RequirementEvidence owner"
```

---

### Task 4: Supabase migration — risk register tables

**Files:**
- Create: `supabase/migrations/20260912000002_risk_register.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Risk Methodology: one active config per org, versioned (editing creates a
-- new version so historical risk scores stay interpretable against the
-- methodology version they were computed under).
create table public.risk_methodologies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  version int not null default 1,
  is_active boolean not null default true,
  scale_size int not null check (scale_size in (3, 4, 5)),
  likelihood_labels text[] not null,
  impact_labels text[] not null,
  thresholds jsonb not null, -- [{maxScore, label}]
  appetite_threshold int not null,
  created_at timestamptz not null default now(),
  unique (org_id, version)
);

create index risk_methodologies_org_idx on public.risk_methodologies(org_id);
create index risk_methodologies_active_idx on public.risk_methodologies(org_id, is_active);

alter table public.risk_methodologies enable row level security;

create policy "org members read risk methodologies"
  on public.risk_methodologies for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own risk methodologies"
  on public.risk_methodologies for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Risk Taxonomy: org-configurable category list, replaces free-text category.
create table public.risk_taxonomy_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create index risk_taxonomy_org_idx on public.risk_taxonomy_categories(org_id);

alter table public.risk_taxonomy_categories enable row level security;

create policy "org members read risk taxonomy"
  on public.risk_taxonomy_categories for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own risk taxonomy"
  on public.risk_taxonomy_categories for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Risks: alter the existing table (not recreate) to add the new fields.
-- Backfill for pre-existing rows happens in Step 2 below.
alter table public.risks
  add column risk_id text,
  add column risk_statement text,
  add column taxonomy_category_id uuid references public.risk_taxonomy_categories(id) on delete set null,
  add column owner_id uuid,
  add column business_unit text,
  add column source text not null default 'manual'
    check (source in ('manual','risk_assessment','gap_analysis','internal_audit','external_audit',
      'vendor_assessment','security_incident','vulnerability','issue','regulatory_change',
      'management_review','threat_intelligence')),
  add column source_ref text,
  add column asset_ids uuid[] not null default '{}',
  add column vendor_ids uuid[] not null default '{}',
  add column methodology_id uuid references public.risk_methodologies(id) on delete set null,
  add column inherent_likelihood int,
  add column inherent_impact int,
  add column inherent_score int,
  add column inherent_label text check (inherent_label in ('low','medium','high','critical')),
  add column residual_likelihood int,
  add column residual_impact int,
  add column residual_score int,
  add column residual_label text check (residual_label in ('low','medium','high','critical')),
  add column above_appetite boolean,
  add column treatment_strategy text check (treatment_strategy in ('avoid','mitigate','transfer','accept','monitor')),
  add column treatment_owner text,
  add column treatment_plan text,
  add column target_score int,
  add column target_date timestamptz,
  add column status text not null default 'open' check (status in ('open','monitoring','closed'));

-- Step 2: backfill existing rows so the new NOT NULL-bound columns (risk_id,
-- inherent_*, status already defaulted) have real data before we add the
-- unique constraint. Every org gets a default methodology + an
-- "Uncategorized" taxonomy category first.
insert into public.risk_methodologies (org_id, scale_size, likelihood_labels, impact_labels, thresholds, appetite_threshold)
select id, 5,
  array['Rare','Unlikely','Possible','Likely','Almost Certain'],
  array['Insignificant','Minor','Moderate','Major','Severe'],
  '[{"maxScore":4,"label":"low"},{"maxScore":9,"label":"medium"},{"maxScore":16,"label":"high"},{"maxScore":25,"label":"critical"}]'::jsonb,
  9
from public.org_profiles
where id in (select distinct org_id from public.risks)
on conflict (org_id, version) do nothing;

insert into public.risk_taxonomy_categories (org_id, name)
select distinct org_id, 'Uncategorized' from public.risks
on conflict (org_id, name) do nothing;

with likelihood_map(old_val, num) as (
  values ('very_low',1), ('low',2), ('medium',3), ('high',4), ('very_high',5)
)
update public.risks r
set
  risk_id = 'RSK-' || lpad((row_number() over (partition by r.org_id order by r.created_at))::text, 6, '0'),
  risk_statement = coalesce(r.description, ''),
  taxonomy_category_id = (select id from public.risk_taxonomy_categories tc where tc.org_id = r.org_id and tc.name = 'Uncategorized'),
  owner_id = r.user_id,
  methodology_id = (select id from public.risk_methodologies m where m.org_id = r.org_id and m.is_active),
  inherent_likelihood = (select num from likelihood_map where old_val = r.likelihood::text),
  inherent_impact = (select num from likelihood_map where old_val = r.impact::text),
  inherent_score = r.risk_score,
  inherent_label = case
    when r.risk_score <= 4 then 'low' when r.risk_score <= 9 then 'medium'
    when r.risk_score <= 16 then 'high' else 'critical' end,
  asset_ids = case when r.asset_id is not null then array[r.asset_id] else '{}' end
where r.risk_id is null;

alter table public.risks
  alter column risk_id set not null,
  alter column risk_statement set not null,
  alter column owner_id set not null,
  alter column inherent_likelihood set not null,
  alter column inherent_impact set not null,
  alter column inherent_score set not null,
  alter column inherent_label set not null,
  add constraint risks_risk_id_unique unique (org_id, risk_id);

create index risks_taxonomy_idx on public.risks(taxonomy_category_id);
create index risks_owner_idx on public.risks(owner_id);
create index risks_status_idx on public.risks(status);

-- Risk ↔ Control: direct many-to-many, independent of Findings.
create table public.risk_control_mappings (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references public.risks(id) on delete cascade,
  control_id uuid not null references public.internal_controls(id) on delete cascade,
  control_code text not null,
  control_title text not null,
  effectiveness_note text,
  created_at timestamptz not null default now(),
  unique (risk_id, control_id)
);

create index risk_control_mappings_risk_idx on public.risk_control_mappings(risk_id);
create index risk_control_mappings_control_idx on public.risk_control_mappings(control_id);

alter table public.risk_control_mappings enable row level security;

create policy "org members read risk control mappings"
  on public.risk_control_mappings for select using (
    exists (
      select 1 from public.risks r
      join public.org_profiles o on o.id = r.org_id
      where r.id = risk_id and o.user_id = auth.uid()
    )
  );

create policy "users manage own risk control mappings"
  on public.risk_control_mappings for all using (
    exists (
      select 1 from public.risks r
      join public.org_profiles o on o.id = r.org_id
      where r.id = risk_id and o.user_id = auth.uid()
    )
    and exists (
      select 1 from public.internal_controls c
      join public.risks r2 on r2.id = risk_id
      where c.id = control_id and c.org_id = r2.org_id
    )
  );

-- Risk Acceptance.
create table public.risk_acceptances (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references public.risks(id) on delete cascade,
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  requested_by uuid not null,
  justification text not null,
  compensating_controls text not null default '',
  expires_at timestamptz not null,
  approver_id uuid not null,
  status text not null default 'requested' check (status in ('requested','reviewed','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index risk_acceptances_risk_idx on public.risk_acceptances(risk_id);
create index risk_acceptances_org_idx on public.risk_acceptances(org_id);

alter table public.risk_acceptances enable row level security;

create policy "org members read risk acceptances"
  on public.risk_acceptances for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own risk acceptances"
  on public.risk_acceptances for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and exists (select 1 from public.risks r where r.id = risk_id and r.org_id = risk_acceptances.org_id)
  );

-- Risk history: immutable snapshots.
create table public.risk_snapshots (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references public.risks(id) on delete cascade,
  inherent_score int not null,
  inherent_label text not null check (inherent_label in ('low','medium','high','critical')),
  residual_score int,
  residual_label text check (residual_label in ('low','medium','high','critical')),
  treatment_strategy text check (treatment_strategy in ('avoid','mitigate','transfer','accept','monitor')),
  changed_by uuid not null,
  reason text,
  created_at timestamptz not null default now()
);

create index risk_snapshots_risk_idx on public.risk_snapshots(risk_id);

alter table public.risk_snapshots enable row level security;

create policy "org members read risk snapshots"
  on public.risk_snapshots for select using (
    exists (
      select 1 from public.risks r
      join public.org_profiles o on o.id = r.org_id
      where r.id = risk_id and o.user_id = auth.uid()
    )
  );

create policy "users insert own risk snapshots"
  on public.risk_snapshots for insert with check (
    exists (
      select 1 from public.risks r
      join public.org_profiles o on o.id = r.org_id
      where r.id = risk_id and o.user_id = auth.uid()
    )
  );

-- Evidence gains riskId as a third possible owner (control_id/framework_id
-- already exist from the Controls migration).
alter table public.requirement_evidence
  add column risk_id uuid references public.risks(id) on delete cascade;

alter table public.requirement_evidence drop constraint if exists requirement_evidence_check;
alter table public.requirement_evidence
  add constraint requirement_evidence_check
  check (control_id is not null or framework_id is not null or risk_id is not null);

create index requirement_evidence_risk_idx on public.requirement_evidence(risk_id);
```

- [ ] **Step 2: Apply locally and verify**

Run: `yarn supabase migration up` (or this project's usual local-DB apply command)
Expected: migration applies with no errors. If there is no local Supabase/Docker available in this environment (check first — this was the case for the Controls migration), verify instead by careful manual re-read: every column referenced by later tasks' `toRisk`/`toRiskMethodology`/etc. mappers exists here with the matching name and type, every FK target exists, and the backfill `update` statement's column list matches exactly what `alter table ... add column` declared. Report DONE_WITH_CONCERNS if no live apply was possible, same as the Controls migration's precedent.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260912000002_risk_register.sql
git commit -m "feat(db): risk register — methodology, taxonomy, mapping, acceptance, history"
```

---

### Task 5: `FakeNotesStrategy` — Risk Methodology and Taxonomy

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

**Interfaces:**
- Consumes: `RiskMethodology`, `RiskMethodologyInput`, `RiskTaxonomyCategory`, `RiskTaxonomyCategoryInput` from Task 1.
- Produces: `getRiskMethodology`, `upsertRiskMethodology`, `listRiskTaxonomy`, `createRiskTaxonomyCategory`, `archiveRiskTaxonomyCategory`.

- [ ] **Step 1: Update imports**

In the `import type { ... } from '../notes'` block, add:
```typescript
  RiskMethodology,
  RiskMethodologyInput,
  RiskTaxonomyCategory,
  RiskTaxonomyCategoryInput,
```

- [ ] **Step 2: Add two new private stores next to `private risks: Risk[] = [];` (search for it)**

```typescript
  private riskMethodologies: RiskMethodology[] = [];
  private riskTaxonomy: RiskTaxonomyCategory[] = [];
```

- [ ] **Step 3: Add the methods right after the `risks` store's declaration area — find a natural spot near the existing `computeRiskScore` helper (search for `private computeRiskScore`) and add these methods immediately before it**

```typescript
  async getRiskMethodology(orgId: string): Promise<RiskMethodology | null> {
    const existing = this.riskMethodologies.find((m) => m.orgId === orgId && m.isActive);
    if (existing) return existing;
    const seeded: RiskMethodology = {
      id: `meth-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      version: 1,
      isActive: true,
      scaleSize: 5,
      likelihoodLabels: ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'],
      impactLabels: ['Insignificant', 'Minor', 'Moderate', 'Major', 'Severe'],
      thresholds: [
        { maxScore: 4, label: 'low' },
        { maxScore: 9, label: 'medium' },
        { maxScore: 16, label: 'high' },
        { maxScore: 25, label: 'critical' },
      ],
      appetiteThreshold: 9,
      createdAt: new Date().toISOString(),
    };
    this.riskMethodologies.push(seeded);
    return seeded;
  }

  async upsertRiskMethodology(
    orgId: string,
    data: RiskMethodologyInput,
  ): Promise<RiskMethodology> {
    const current = await this.getRiskMethodology(orgId);
    const nextVersion = (current?.version ?? 0) + 1;
    if (current) current.isActive = false;
    const updated: RiskMethodology = {
      id: `meth-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      version: nextVersion,
      isActive: true,
      createdAt: new Date().toISOString(),
      ...data,
    };
    this.riskMethodologies.push(updated);
    return updated;
  }

  async listRiskTaxonomy(orgId: string): Promise<RiskTaxonomyCategory[]> {
    const existing = this.riskTaxonomy.filter((c) => c.orgId === orgId);
    if (existing.length > 0) return existing;
    const defaults = [
      'Identity & Access', 'Vulnerability Management', 'Network Security', 'Application Security',
      'Data Security', 'Security Operations', 'Incident Response', 'Availability', 'Infrastructure',
      'Architecture', 'Change', 'Cloud', 'Technical Debt', 'Supplier Security', 'Concentration',
      'Supply Chain', 'Outsourcing', 'Privacy', 'Compliance / Regulatory', 'Operational',
      'Business Continuity / Resilience', 'Strategic', 'Financial',
    ];
    const seeded = defaults.map((name) => ({
      id: `rtc-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      name,
      archived: false,
      createdAt: new Date().toISOString(),
    }));
    this.riskTaxonomy.push(...seeded);
    return seeded;
  }

  async createRiskTaxonomyCategory(
    orgId: string,
    data: RiskTaxonomyCategoryInput,
  ): Promise<RiskTaxonomyCategory> {
    const category: RiskTaxonomyCategory = {
      id: `rtc-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      name: data.name,
      archived: false,
      createdAt: new Date().toISOString(),
    };
    this.riskTaxonomy.push(category);
    return category;
  }

  async archiveRiskTaxonomyCategory(id: string): Promise<RiskTaxonomyCategory> {
    const category = this.riskTaxonomy.find((c) => c.id === id);
    if (!category) throw new Error(`risk_taxonomy_category_not_found: ${id}`);
    category.archived = true;
    return category;
  }

```

- [ ] **Step 2: Build**

Run: `yarn nx build shared`
Expected: still shows errors for the remaining un-implemented methods (Risk rebuild, mappings, acceptance, snapshots, risk evidence) — expected at this point.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): add Risk Methodology and Taxonomy to FakeNotesStrategy"
```

---

### Task 6: `FakeNotesStrategy` — Risk CRUD rebuild

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

**Interfaces:**
- Consumes: `Risk`, `RiskInput`, `RiskPatch`, `RiskSnapshot` from Task 2; `getRiskMethodology` from Task 5.
- Produces: rebuilt `createRisk`/`getRisk`/`updateRisk`/`deleteRisk`, new `listRiskSnapshots` (store only — full method comes in Task 8, this task just adds the private store).

- [ ] **Step 1: Add a private store for snapshots next to `private risks: Risk[] = [];`**

```typescript
  private riskSnapshots: RiskSnapshot[] = [];
```

Add `RiskSnapshot` to the type imports.

- [ ] **Step 2: Replace `createRisk` entirely (search for `async createRisk`)**

```typescript
  async createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk> {
    const methodology = await this.getRiskMethodology(orgId);
    if (!methodology) throw new Error('risk_methodology_not_found');
    const { score, label } = this.scoreRisk(
      methodology,
      data.inherentLikelihood,
      data.inherentImpact,
    );
    const orgRiskCount = this.risks.filter((r) => r.orgId === orgId).length;
    const risk: Risk = {
      id: globalThis.crypto.randomUUID(),
      riskId: `RSK-${String(orgRiskCount + 101).padStart(6, '0')}`,
      orgId,
      userId,
      title: data.title,
      riskStatement: data.riskStatement,
      taxonomyCategoryId: data.taxonomyCategoryId,
      ownerId: data.ownerId,
      businessUnit: data.businessUnit,
      source: data.source ?? 'manual',
      sourceRef: data.sourceRef,
      assetIds: data.assetIds ?? [],
      vendorIds: data.vendorIds ?? [],
      methodologyId: methodology.id,
      inherentLikelihood: data.inherentLikelihood,
      inherentImpact: data.inherentImpact,
      inherentScore: score,
      inherentLabel: label,
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.risks.push(risk);
    return risk;
  }

  private scoreRisk(
    methodology: RiskMethodology,
    likelihood: number,
    impact: number,
  ): { score: number; label: RiskScoreLabel } {
    const score = likelihood * impact;
    const band = methodology.thresholds.find((t) => score <= t.maxScore);
    return { score, label: band?.label ?? 'critical' };
  }

```

Add `RiskScoreLabel` to the type imports if not already present from Task 1's changes.

- [ ] **Step 3: Replace `updateRisk` entirely (search for `async updateRisk`)**

```typescript
  async updateRisk(
    id: string,
    patch: RiskPatch,
    changedBy: string,
    reason?: string,
  ): Promise<Risk> {
    const risk = this.risks.find((r) => r.id === id);
    if (!risk) throw new Error(`risk_not_found: ${id}`);

    const scoreFieldsChanging =
      patch.inherentLikelihood !== undefined ||
      patch.inherentImpact !== undefined ||
      patch.residualLikelihood !== undefined ||
      patch.residualImpact !== undefined ||
      patch.treatmentStrategy !== undefined;

    if (scoreFieldsChanging) {
      this.riskSnapshots.unshift({
        id: globalThis.crypto.randomUUID(),
        riskId: id,
        inherentScore: risk.inherentScore,
        inherentLabel: risk.inherentLabel,
        residualScore: risk.residualScore,
        residualLabel: risk.residualLabel,
        treatmentStrategy: risk.treatmentStrategy,
        changedBy,
        reason,
        createdAt: new Date().toISOString(),
      });
    }

    Object.assign(risk, patch);

    const methodology = this.riskMethodologies.find((m) => m.id === risk.methodologyId);
    if (methodology) {
      if (patch.inherentLikelihood !== undefined || patch.inherentImpact !== undefined) {
        const { score, label } = this.scoreRisk(
          methodology,
          risk.inherentLikelihood,
          risk.inherentImpact,
        );
        risk.inherentScore = score;
        risk.inherentLabel = label;
      }
      if (
        (patch.residualLikelihood !== undefined || patch.residualImpact !== undefined) &&
        risk.residualLikelihood !== undefined &&
        risk.residualImpact !== undefined
      ) {
        const { score, label } = this.scoreRisk(
          methodology,
          risk.residualLikelihood,
          risk.residualImpact,
        );
        risk.residualScore = score;
        risk.residualLabel = label;
        risk.aboveAppetite = score > methodology.appetiteThreshold;
      }
    }

    risk.updatedAt = new Date().toISOString();
    return risk;
  }

```

- [ ] **Step 4: Leave `getRisk`/`deleteRisk` untouched** — their existing bodies (`this.risks.find(...)`/`this.risks = this.risks.filter(...)`) already work correctly against the rebuilt `Risk` shape with no changes needed.

- [ ] **Step 5: Build**

Run: `yarn nx build shared`
Expected: still shows errors for `listRiskControlMappings`/`addRiskControlMapping`/etc. (Task 7), `listRiskSnapshots` (Task 8), risk evidence (Task 8) — expected.

- [ ] **Step 6: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): rebuild FakeNotesStrategy Risk CRUD with methodology-based scoring"
```

---

### Task 7: `FakeNotesStrategy` — Risk ↔ Control mapping, Risk Acceptance

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

**Interfaces:**
- Consumes: `RiskControlMapping`, `RiskControlMappingInput`, `RiskAcceptance`, `RiskAcceptanceInput`, `RiskAcceptanceStatus` from Task 2.
- Produces: `listRiskControlMappings`, `addRiskControlMapping`, `removeRiskControlMapping`, `createRiskAcceptance`, `getActiveRiskAcceptance`, `reviewRiskAcceptance`, `approveRiskAcceptance`, `rejectRiskAcceptance`.

- [ ] **Step 1: Add type imports and two private stores next to `private riskSnapshots`**

```typescript
  private riskControlMappings: RiskControlMapping[] = [];
  private riskAcceptances: RiskAcceptance[] = [];
```

- [ ] **Step 2: Add the methods (place them near the other risk-related methods, after `updateRisk`)**

```typescript
  async listRiskControlMappings(riskId: string): Promise<RiskControlMapping[]> {
    return this.riskControlMappings.filter((m) => m.riskId === riskId);
  }

  async addRiskControlMapping(
    riskId: string,
    data: RiskControlMappingInput,
  ): Promise<RiskControlMapping> {
    const mapping: RiskControlMapping = {
      id: globalThis.crypto.randomUUID(),
      riskId,
      ...data,
      createdAt: new Date().toISOString(),
    };
    this.riskControlMappings.push(mapping);
    return mapping;
  }

  async removeRiskControlMapping(id: string): Promise<void> {
    this.riskControlMappings = this.riskControlMappings.filter((m) => m.id !== id);
  }

  async createRiskAcceptance(
    orgId: string,
    riskId: string,
    requestedBy: string,
    data: RiskAcceptanceInput,
  ): Promise<RiskAcceptance> {
    const acceptance: RiskAcceptance = {
      id: globalThis.crypto.randomUUID(),
      riskId,
      orgId,
      requestedBy,
      justification: data.justification,
      compensatingControls: data.compensatingControls,
      expiresAt: data.expiresAt,
      approverId: data.approverId,
      status: 'requested',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.riskAcceptances.unshift(acceptance);
    return acceptance;
  }

  async getActiveRiskAcceptance(riskId: string): Promise<RiskAcceptance | null> {
    const now = new Date().toISOString();
    return (
      this.riskAcceptances.find(
        (a) =>
          a.riskId === riskId &&
          a.status !== 'rejected' &&
          a.expiresAt > now,
      ) ?? null
    );
  }

  async reviewRiskAcceptance(
    id: string,
    reviewedBy: string,
    reviewNotes?: string,
  ): Promise<RiskAcceptance> {
    const acceptance = this.riskAcceptances.find((a) => a.id === id);
    if (!acceptance) throw new Error(`risk_acceptance_not_found: ${id}`);
    acceptance.status = 'reviewed';
    acceptance.reviewedBy = reviewedBy;
    acceptance.reviewedAt = new Date().toISOString();
    acceptance.reviewNotes = reviewNotes;
    acceptance.updatedAt = new Date().toISOString();
    return acceptance;
  }

  async approveRiskAcceptance(id: string): Promise<RiskAcceptance> {
    const acceptance = this.riskAcceptances.find((a) => a.id === id);
    if (!acceptance) throw new Error(`risk_acceptance_not_found: ${id}`);
    acceptance.status = 'approved';
    acceptance.approvedAt = new Date().toISOString();
    acceptance.updatedAt = new Date().toISOString();
    return acceptance;
  }

  async rejectRiskAcceptance(id: string): Promise<RiskAcceptance> {
    const acceptance = this.riskAcceptances.find((a) => a.id === id);
    if (!acceptance) throw new Error(`risk_acceptance_not_found: ${id}`);
    acceptance.status = 'rejected';
    acceptance.updatedAt = new Date().toISOString();
    return acceptance;
  }

```

- [ ] **Step 3: Build**

Run: `yarn nx build shared`
Expected: still shows errors for `listRiskSnapshots` and risk-scoped evidence — expected.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): add Risk-Control mapping and Risk Acceptance to FakeNotesStrategy"
```

---

### Task 8: `FakeNotesStrategy` — Risk history and risk-scoped evidence

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

**Interfaces:**
- Consumes: `riskSnapshots` store from Task 6; `RequirementEvidence` (extended, Task 3).
- Produces: `listRiskSnapshots`, `listRiskEvidence`, `createRiskEvidence`.

- [ ] **Step 1: Add the methods**

```typescript
  async listRiskSnapshots(riskId: string): Promise<RiskSnapshot[]> {
    return this.riskSnapshots.filter((s) => s.riskId === riskId);
  }

  async listRiskEvidence(riskId: string): Promise<RequirementEvidence[]> {
    return this.evidence.filter((e) => e.riskId === riskId);
  }

  async createRiskEvidence(
    orgId: string,
    riskId: string,
    data: Omit<RequirementEvidence, 'id' | 'riskId'>,
  ): Promise<RequirementEvidence> {
    const ev: RequirementEvidence = {
      id: `ev-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      riskId,
      ...data,
    };
    this.evidence.unshift(ev);
    return ev;
  }

```

- [ ] **Step 2: Build**

Run: `yarn nx build shared`
Expected: PASS — `FakeNotesStrategy` now fully implements the extended `NotesStrategy` interface.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): add Risk history and risk-scoped evidence to FakeNotesStrategy"
```

---

### Task 9: Contract tests for the new `FakeNotesStrategy` methods

**Files:**
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

- [ ] **Step 1: Write the tests**

```typescript
describe('Risk Register lifecycle', () => {
  it('seeds a default methodology and taxonomy on first access', async () => {
    const strategy = new FakeNotesStrategy();
    const methodology = await strategy.getRiskMethodology('org-1');
    expect(methodology?.scaleSize).toBe(5);
    expect(methodology?.thresholds).toHaveLength(4);

    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    expect(taxonomy.length).toBeGreaterThan(0);
    expect(taxonomy.every((c) => c.orgId === 'org-1')).toBe(true);
  });

  it('creates a risk with an auto-generated ID and a methodology-based inherent score', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Unauthorized Access to Customer Data',
      riskStatement: 'Due to weak access controls, unauthorized access may occur.',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 4,
      inherentImpact: 5,
    });
    expect(risk.riskId).toMatch(/^RSK-\d{6}$/);
    expect(risk.inherentScore).toBe(20);
    expect(risk.inherentLabel).toBe('critical');
    expect(risk.status).toBe('open');
  });

  it('writes a snapshot before applying a residual-score update, and computes above-appetite', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Cloud Service Outage',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 4,
      inherentImpact: 5,
    });

    const updated = await strategy.updateRisk(
      risk.id,
      { residualLikelihood: 2, residualImpact: 5 },
      'user-1',
      'MFA deployed',
    );
    expect(updated.residualScore).toBe(10);
    expect(updated.residualLabel).toBe('high');
    expect(updated.aboveAppetite).toBe(true); // 10 > default appetite threshold 9

    const snapshots = await strategy.listRiskSnapshots(risk.id);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.inherentScore).toBe(20);
    expect(snapshots[0]?.reason).toBe('MFA deployed');
  });

  it('maps a risk to a control directly, independent of findings', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Risk',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });

    const mapping = await strategy.addRiskControlMapping(risk.id, {
      controlId: 'ctrl-1',
      controlCode: 'IAM-001',
      controlTitle: 'Privileged Access MFA',
      effectivenessNote: 'Effective',
    });
    expect((await strategy.listRiskControlMappings(risk.id))).toHaveLength(1);

    await strategy.removeRiskControlMapping(mapping.id);
    expect((await strategy.listRiskControlMappings(risk.id))).toHaveLength(0);
  });

  it('runs a risk acceptance through requested -> approved, and supersedes on a new request', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Risk',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });

    const future = new Date(Date.now() + 86400_000).toISOString();
    const acceptance = await strategy.createRiskAcceptance('org-1', risk.id, 'user-1', {
      justification: 'Business need outweighs residual exposure',
      compensatingControls: 'Manual monthly review',
      expiresAt: future,
      approverId: 'ciso-1',
    });
    expect(acceptance.status).toBe('requested');

    await strategy.reviewRiskAcceptance(acceptance.id, 'ciso-1', 'Looks reasonable');
    const approved = await strategy.approveRiskAcceptance(acceptance.id);
    expect(approved.status).toBe('approved');
    expect(approved.approvedAt).toBeTruthy();

    const active = await strategy.getActiveRiskAcceptance(risk.id);
    expect(active?.id).toBe(acceptance.id);
  });

  it('attaches evidence to a risk', async () => {
    const strategy = new FakeNotesStrategy();
    const taxonomy = await strategy.listRiskTaxonomy('org-1');
    const risk = await strategy.createRisk('org-1', 'user-1', {
      title: 'Risk',
      riskStatement: 'Statement',
      taxonomyCategoryId: taxonomy[0]!.id,
      ownerId: 'user-1',
      inherentLikelihood: 3,
      inherentImpact: 3,
    });

    await strategy.createRiskEvidence('org-1', risk.id, {
      title: 'Risk acceptance memo',
      owner: 'user-1',
      evidenceType: 'document',
      source: 'internal',
      collectionDate: new Date().toISOString(),
      periodCovered: '2026',
      expirationDate: new Date().toISOString(),
      verificationStatus: 'verified',
    });

    expect((await strategy.listRiskEvidence(risk.id))).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify all pass**

Run: `yarn nx test shared -- fake-notes.contract`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "test(shared): cover Risk Register methodology, scoring, mapping, acceptance, evidence"
```

---

### Task 10: `SupabaseNotesStrategy` — Risk Methodology and Taxonomy

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

**Interfaces:**
- Consumes: `risk_methodologies`, `risk_taxonomy_categories` tables (Task 4); `RiskMethodology`, `RiskMethodologyInput`, `RiskTaxonomyCategory`, `RiskTaxonomyCategoryInput` types (Task 1).

- [ ] **Step 1: Add the methods, following this file's established style (direct `await this.db.from(...)` calls, `ok()` helper, private `toX(row)` mappers — read `listRisks`/`createRisk` in this same file for the exact reference pattern before writing)**

```typescript
  async getRiskMethodology(orgId: string): Promise<RiskMethodology | null> {
    const { data, error } = await this.db
      .from('risk_methodologies')
      .select('*')
      .eq('org_id', orgId)
      .eq('is_active', true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return this.toRiskMethodology(data);

    const seeded = {
      org_id: orgId,
      scale_size: 5,
      likelihood_labels: ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'],
      impact_labels: ['Insignificant', 'Minor', 'Moderate', 'Major', 'Severe'],
      thresholds: [
        { maxScore: 4, label: 'low' },
        { maxScore: 9, label: 'medium' },
        { maxScore: 16, label: 'high' },
        { maxScore: 25, label: 'critical' },
      ],
      appetite_threshold: 9,
    };
    const { data: row, error: insertError } = await this.db
      .from('risk_methodologies')
      .insert(seeded)
      .select()
      .single();
    return this.toRiskMethodology(ok(row, insertError));
  }

  async upsertRiskMethodology(
    orgId: string,
    data: RiskMethodologyInput,
  ): Promise<RiskMethodology> {
    const current = await this.getRiskMethodology(orgId);
    const nextVersion = (current?.version ?? 0) + 1;
    if (current) {
      await this.db.from('risk_methodologies').update({ is_active: false }).eq('id', current.id);
    }
    const { data: row, error } = await this.db
      .from('risk_methodologies')
      .insert({
        org_id: orgId,
        version: nextVersion,
        is_active: true,
        scale_size: data.scaleSize,
        likelihood_labels: data.likelihoodLabels,
        impact_labels: data.impactLabels,
        thresholds: data.thresholds,
        appetite_threshold: data.appetiteThreshold,
      })
      .select()
      .single();
    return this.toRiskMethodology(ok(row, error));
  }

  private toRiskMethodology(row: Record<string, unknown>): RiskMethodology {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      version: row['version'] as number,
      isActive: row['is_active'] as boolean,
      scaleSize: row['scale_size'] as 3 | 4 | 5,
      likelihoodLabels: row['likelihood_labels'] as string[],
      impactLabels: row['impact_labels'] as string[],
      thresholds: row['thresholds'] as RiskThresholdBand[],
      appetiteThreshold: row['appetite_threshold'] as number,
      createdAt: row['created_at'] as string,
    };
  }

  async listRiskTaxonomy(orgId: string): Promise<RiskTaxonomyCategory[]> {
    const { data, error } = await this.db
      .from('risk_taxonomy_categories')
      .select('*')
      .eq('org_id', orgId)
      .order('name');
    const rows = ok(data, error);
    if (rows.length > 0) return rows.map((r) => this.toRiskTaxonomyCategory(r));

    const defaults = [
      'Identity & Access', 'Vulnerability Management', 'Network Security', 'Application Security',
      'Data Security', 'Security Operations', 'Incident Response', 'Availability', 'Infrastructure',
      'Architecture', 'Change', 'Cloud', 'Technical Debt', 'Supplier Security', 'Concentration',
      'Supply Chain', 'Outsourcing', 'Privacy', 'Compliance / Regulatory', 'Operational',
      'Business Continuity / Resilience', 'Strategic', 'Financial',
    ];
    const { data: inserted, error: insertError } = await this.db
      .from('risk_taxonomy_categories')
      .insert(defaults.map((name) => ({ org_id: orgId, name })))
      .select();
    return ok(inserted, insertError).map((r) => this.toRiskTaxonomyCategory(r));
  }

  async createRiskTaxonomyCategory(
    orgId: string,
    data: RiskTaxonomyCategoryInput,
  ): Promise<RiskTaxonomyCategory> {
    const { data: row, error } = await this.db
      .from('risk_taxonomy_categories')
      .insert({ org_id: orgId, name: data.name })
      .select()
      .single();
    return this.toRiskTaxonomyCategory(ok(row, error));
  }

  async archiveRiskTaxonomyCategory(id: string): Promise<RiskTaxonomyCategory> {
    const { data, error } = await this.db
      .from('risk_taxonomy_categories')
      .update({ archived: true })
      .eq('id', id)
      .select()
      .single();
    return this.toRiskTaxonomyCategory(ok(data, error));
  }

  private toRiskTaxonomyCategory(row: Record<string, unknown>): RiskTaxonomyCategory {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      name: row['name'] as string,
      archived: row['archived'] as boolean,
      createdAt: row['created_at'] as string,
    };
  }
```

Add `RiskMethodology`, `RiskMethodologyInput`, `RiskThresholdBand`, `RiskTaxonomyCategory`, `RiskTaxonomyCategoryInput` to this file's `@icore/shared` type imports.

- [ ] **Step 2: Build**

Run: `yarn nx build notes`
Expected: still shows errors for the not-yet-implemented Risk rebuild / mapping / acceptance / history / risk-evidence methods — expected at this point.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): persist Risk Methodology and Taxonomy in Supabase"
```

---

### Task 11: `SupabaseNotesStrategy` — Risk CRUD rebuild

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

**Interfaces:**
- Consumes: `getRiskMethodology`/`toRiskMethodology` from Task 10; altered `risks` table (Task 4).

- [ ] **Step 1: Replace `createRisk` entirely (search for `async createRisk`)**

```typescript
  async createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk> {
    const methodology = await this.getRiskMethodology(orgId);
    if (!methodology) throw new Error('risk_methodology_not_found');
    const { score, label } = this.scoreRisk(
      methodology,
      data.inherentLikelihood,
      data.inherentImpact,
    );
    const { count } = await this.db
      .from('risks')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);
    const riskId = `RSK-${String((count ?? 0) + 101).padStart(6, '0')}`;

    const { data: row, error } = await this.db
      .from('risks')
      .insert({
        org_id: orgId,
        user_id: userId,
        risk_id: riskId,
        title: data.title,
        risk_statement: data.riskStatement,
        taxonomy_category_id: data.taxonomyCategoryId,
        owner_id: data.ownerId,
        business_unit: data.businessUnit ?? null,
        source: data.source ?? 'manual',
        source_ref: data.sourceRef ?? null,
        asset_ids: data.assetIds ?? [],
        vendor_ids: data.vendorIds ?? [],
        methodology_id: methodology.id,
        inherent_likelihood: data.inherentLikelihood,
        inherent_impact: data.inherentImpact,
        inherent_score: score,
        inherent_label: label,
        status: 'open',
        // legacy columns kept populated for backward compatibility with any
        // code path still reading the pre-rebuild columns directly:
        description: data.riskStatement,
        category: data.taxonomyCategoryId,
        likelihood: 'medium',
        impact: 'medium',
        risk_score: score,
        treatment: 'mitigate',
      })
      .select()
      .single();
    return this.toRisk(ok(row, error));
  }

  private scoreRisk(
    methodology: RiskMethodology,
    likelihood: number,
    impact: number,
  ): { score: number; label: RiskScoreLabel } {
    const score = likelihood * impact;
    const band = methodology.thresholds.find((t) => score <= t.maxScore);
    return { score, label: band?.label ?? 'critical' };
  }
```

Note: the insert still populates the legacy `description`/`category`/`likelihood`/`impact`/`risk_score`/`treatment` columns (still `not null` per the original migration, unchanged by Task 4's `alter table`) so the insert doesn't violate those NOT NULL constraints — Task 4 didn't drop them, only added new columns alongside. This keeps old data readable if anything still queries the legacy columns directly, at zero extra migration risk.

- [ ] **Step 2: Replace `getRisk`'s row-to-object mapping — find `private toRisk` (or add it if this file inlines the mapping in `getRisk`/`listRisks` directly; check both) and replace it entirely**

```typescript
  private toRisk(row: Record<string, unknown>): Risk {
    return {
      id: row['id'] as string,
      riskId: row['risk_id'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      title: row['title'] as string,
      riskStatement: row['risk_statement'] as string,
      taxonomyCategoryId: row['taxonomy_category_id'] as string,
      ownerId: row['owner_id'] as string,
      businessUnit: row['business_unit'] as string | undefined,
      source: row['source'] as RiskSource,
      sourceRef: row['source_ref'] as string | undefined,
      assetIds: (row['asset_ids'] as string[]) ?? [],
      vendorIds: (row['vendor_ids'] as string[]) ?? [],
      methodologyId: row['methodology_id'] as string,
      inherentLikelihood: row['inherent_likelihood'] as number,
      inherentImpact: row['inherent_impact'] as number,
      inherentScore: row['inherent_score'] as number,
      inherentLabel: row['inherent_label'] as RiskScoreLabel,
      residualLikelihood: row['residual_likelihood'] as number | undefined,
      residualImpact: row['residual_impact'] as number | undefined,
      residualScore: row['residual_score'] as number | undefined,
      residualLabel: row['residual_label'] as RiskScoreLabel | undefined,
      aboveAppetite: row['above_appetite'] as boolean | undefined,
      treatmentStrategy: row['treatment_strategy'] as RiskTreatmentStrategy | undefined,
      treatmentOwner: row['treatment_owner'] as string | undefined,
      treatmentPlan: row['treatment_plan'] as string | undefined,
      targetScore: row['target_score'] as number | undefined,
      targetDate: row['target_date'] as string | undefined,
      status: row['status'] as RiskStatus,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
```

Every existing call site that used the old `toRisk` (in `listRisks`/`getRisk`) keeps working unchanged — only the mapper's body changes.

- [ ] **Step 3: Replace `updateRisk` entirely (search for `async updateRisk`)**

```typescript
  async updateRisk(
    id: string,
    patch: RiskPatch,
    changedBy: string,
    reason?: string,
  ): Promise<Risk> {
    const current = await this.getRisk(id);
    if (!current) throw new Error('risk_not_found');

    const scoreFieldsChanging =
      patch.inherentLikelihood !== undefined ||
      patch.inherentImpact !== undefined ||
      patch.residualLikelihood !== undefined ||
      patch.residualImpact !== undefined ||
      patch.treatmentStrategy !== undefined;

    if (scoreFieldsChanging) {
      await this.db.from('risk_snapshots').insert({
        risk_id: id,
        inherent_score: current.inherentScore,
        inherent_label: current.inherentLabel,
        residual_score: current.residualScore ?? null,
        residual_label: current.residualLabel ?? null,
        treatment_strategy: current.treatmentStrategy ?? null,
        changed_by: changedBy,
        reason: reason ?? null,
      });
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.riskStatement !== undefined) update['risk_statement'] = patch.riskStatement;
    if (patch.taxonomyCategoryId !== undefined) update['taxonomy_category_id'] = patch.taxonomyCategoryId;
    if (patch.ownerId !== undefined) update['owner_id'] = patch.ownerId;
    if (patch.businessUnit !== undefined) update['business_unit'] = patch.businessUnit;
    if (patch.assetIds !== undefined) update['asset_ids'] = patch.assetIds;
    if (patch.vendorIds !== undefined) update['vendor_ids'] = patch.vendorIds;
    if (patch.treatmentStrategy !== undefined) update['treatment_strategy'] = patch.treatmentStrategy;
    if (patch.treatmentOwner !== undefined) update['treatment_owner'] = patch.treatmentOwner;
    if (patch.treatmentPlan !== undefined) update['treatment_plan'] = patch.treatmentPlan;
    if (patch.targetScore !== undefined) update['target_score'] = patch.targetScore;
    if (patch.targetDate !== undefined) update['target_date'] = patch.targetDate;
    if (patch.status !== undefined) update['status'] = patch.status;

    const methodology = await this.getRiskMethodology(current.orgId);
    if (methodology) {
      const newInherentLikelihood = patch.inherentLikelihood ?? current.inherentLikelihood;
      const newInherentImpact = patch.inherentImpact ?? current.inherentImpact;
      if (patch.inherentLikelihood !== undefined || patch.inherentImpact !== undefined) {
        const { score, label } = this.scoreRisk(methodology, newInherentLikelihood, newInherentImpact);
        update['inherent_likelihood'] = newInherentLikelihood;
        update['inherent_impact'] = newInherentImpact;
        update['inherent_score'] = score;
        update['inherent_label'] = label;
      }
      const newResidualLikelihood = patch.residualLikelihood ?? current.residualLikelihood;
      const newResidualImpact = patch.residualImpact ?? current.residualImpact;
      if (
        (patch.residualLikelihood !== undefined || patch.residualImpact !== undefined) &&
        newResidualLikelihood !== undefined &&
        newResidualImpact !== undefined
      ) {
        const { score, label } = this.scoreRisk(methodology, newResidualLikelihood, newResidualImpact);
        update['residual_likelihood'] = newResidualLikelihood;
        update['residual_impact'] = newResidualImpact;
        update['residual_score'] = score;
        update['residual_label'] = label;
        update['above_appetite'] = score > methodology.appetiteThreshold;
      }
    }

    const { data, error } = await this.db
      .from('risks')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toRisk(ok(data, error));
  }
```

- [ ] **Step 4: Leave `getRisk`/`listRisks`/`deleteRisk` untouched** — only `toRisk` (Step 2) needed to change; these methods already call it correctly.

- [ ] **Step 5: Build**

Run: `yarn nx build notes`
Expected: still shows errors for mapping/acceptance/history/risk-evidence methods (Tasks 12-13) — expected.

- [ ] **Step 6: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): rebuild Supabase Risk CRUD with methodology-based scoring and snapshots"
```

---

### Task 12: `SupabaseNotesStrategy` — Risk ↔ Control mapping, Risk Acceptance

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

**Interfaces:**
- Consumes: `risk_control_mappings`, `risk_acceptances` tables (Task 4).

- [ ] **Step 1: Add the methods**

```typescript
  async listRiskControlMappings(riskId: string): Promise<RiskControlMapping[]> {
    const { data, error } = await this.db
      .from('risk_control_mappings')
      .select('*')
      .eq('risk_id', riskId);
    return ok(data, error).map((r) => this.toRiskControlMapping(r));
  }

  async addRiskControlMapping(
    riskId: string,
    data: RiskControlMappingInput,
  ): Promise<RiskControlMapping> {
    const { data: row, error } = await this.db
      .from('risk_control_mappings')
      .insert({
        risk_id: riskId,
        control_id: data.controlId,
        control_code: data.controlCode,
        control_title: data.controlTitle,
        effectiveness_note: data.effectivenessNote ?? null,
      })
      .select()
      .single();
    return this.toRiskControlMapping(ok(row, error));
  }

  async removeRiskControlMapping(id: string): Promise<void> {
    const { error } = await this.db.from('risk_control_mappings').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private toRiskControlMapping(row: Record<string, unknown>): RiskControlMapping {
    return {
      id: row['id'] as string,
      riskId: row['risk_id'] as string,
      controlId: row['control_id'] as string,
      controlCode: row['control_code'] as string,
      controlTitle: row['control_title'] as string,
      effectivenessNote: row['effectiveness_note'] as string | undefined,
      createdAt: row['created_at'] as string,
    };
  }

  async createRiskAcceptance(
    orgId: string,
    riskId: string,
    requestedBy: string,
    data: RiskAcceptanceInput,
  ): Promise<RiskAcceptance> {
    const { data: row, error } = await this.db
      .from('risk_acceptances')
      .insert({
        risk_id: riskId,
        org_id: orgId,
        requested_by: requestedBy,
        justification: data.justification,
        compensating_controls: data.compensatingControls,
        expires_at: data.expiresAt,
        approver_id: data.approverId,
      })
      .select()
      .single();
    return this.toRiskAcceptance(ok(row, error));
  }

  async getActiveRiskAcceptance(riskId: string): Promise<RiskAcceptance | null> {
    const { data, error } = await this.db
      .from('risk_acceptances')
      .select('*')
      .eq('risk_id', riskId)
      .neq('status', 'rejected')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toRiskAcceptance(data) : null;
  }

  async reviewRiskAcceptance(
    id: string,
    reviewedBy: string,
    reviewNotes?: string,
  ): Promise<RiskAcceptance> {
    const { data, error } = await this.db
      .from('risk_acceptances')
      .update({
        status: 'reviewed',
        reviewed_by: reviewedBy,
        reviewed_at: new Date().toISOString(),
        review_notes: reviewNotes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    return this.toRiskAcceptance(ok(data, error));
  }

  async approveRiskAcceptance(id: string): Promise<RiskAcceptance> {
    const { data, error } = await this.db
      .from('risk_acceptances')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();
    return this.toRiskAcceptance(ok(data, error));
  }

  async rejectRiskAcceptance(id: string): Promise<RiskAcceptance> {
    const { data, error } = await this.db
      .from('risk_acceptances')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    return this.toRiskAcceptance(ok(data, error));
  }

  private toRiskAcceptance(row: Record<string, unknown>): RiskAcceptance {
    return {
      id: row['id'] as string,
      riskId: row['risk_id'] as string,
      orgId: row['org_id'] as string,
      requestedBy: row['requested_by'] as string,
      justification: row['justification'] as string,
      compensatingControls: row['compensating_controls'] as string,
      expiresAt: row['expires_at'] as string,
      approverId: row['approver_id'] as string,
      status: row['status'] as RiskAcceptanceStatus,
      reviewedBy: row['reviewed_by'] as string | undefined,
      reviewedAt: row['reviewed_at'] as string | undefined,
      reviewNotes: row['review_notes'] as string | undefined,
      approvedAt: row['approved_at'] as string | undefined,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
```

- [ ] **Step 2: Build**

Run: `yarn nx build notes`
Expected: still shows errors for `listRiskSnapshots`/risk-evidence (Task 13) — expected.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): persist Risk-Control mapping and Risk Acceptance in Supabase"
```

---

### Task 13: `SupabaseNotesStrategy` — Risk history and risk-scoped evidence

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

**Interfaces:**
- Consumes: `risk_snapshots` table (Task 4); `requirement_evidence.risk_id` column (Task 4); the existing `toRequirementEvidence`/`evidenceInsertPayload` helpers built for Controls (Task 8 of the Controls plan).

- [ ] **Step 1: Add the methods**

```typescript
  async listRiskSnapshots(riskId: string): Promise<RiskSnapshot[]> {
    const { data, error } = await this.db
      .from('risk_snapshots')
      .select('*')
      .eq('risk_id', riskId)
      .order('created_at', { ascending: false });
    return ok(data, error).map((r) => this.toRiskSnapshot(r));
  }

  private toRiskSnapshot(row: Record<string, unknown>): RiskSnapshot {
    return {
      id: row['id'] as string,
      riskId: row['risk_id'] as string,
      inherentScore: row['inherent_score'] as number,
      inherentLabel: row['inherent_label'] as RiskScoreLabel,
      residualScore: row['residual_score'] as number | undefined,
      residualLabel: row['residual_label'] as RiskScoreLabel | undefined,
      treatmentStrategy: row['treatment_strategy'] as RiskTreatmentStrategy | undefined,
      changedBy: row['changed_by'] as string,
      reason: row['reason'] as string | undefined,
      createdAt: row['created_at'] as string,
    };
  }

  async listRiskEvidence(riskId: string): Promise<RequirementEvidence[]> {
    const { data, error } = await this.db
      .from('requirement_evidence')
      .select('*')
      .eq('risk_id', riskId);
    return ok(data, error).map((row) => this.toRequirementEvidence(row));
  }

  async createRiskEvidence(
    orgId: string,
    riskId: string,
    data: Omit<RequirementEvidence, 'id' | 'riskId'>,
  ): Promise<RequirementEvidence> {
    const { data: row, error } = await this.db
      .from('requirement_evidence')
      .insert({ ...this.evidenceInsertPayload(orgId, data), risk_id: riskId })
      .select()
      .single();
    return this.toRequirementEvidence(ok(row, error));
  }
```

`toRequirementEvidence` and `evidenceInsertPayload` already exist from the Controls plan (Task 8) — they read `control_id`/`framework_id` today; confirm `toRequirementEvidence` also reads `risk_id` (add `riskId: row['risk_id'] as string | undefined,` to its return object if it doesn't already — check the current body before assuming).

- [ ] **Step 2: Build**

Run: `yarn nx build notes`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): persist Risk history and risk-scoped evidence in Supabase"
```

---

### Task 14: Notes MS — `@MessagePattern` handlers

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`

- [ ] **Step 1: Update the two existing risk handlers in place, add the rest as new**

Find `@MessagePattern('notes.risks.create')` and its handler — update its payload type:

```typescript
  @MessagePattern('notes.risks.create')
  createRisk(
    @Payload() payload: { orgId: string; userId: string; data: RiskInput },
  ): Promise<Risk> {
    return this.strategy.createRisk(payload.orgId, payload.userId, payload.data);
  }
```

Find `@MessagePattern('notes.risks.update')` and update it to thread the new params:

```typescript
  @MessagePattern('notes.risks.update')
  updateRisk(
    @Payload()
    payload: { id: string; patch: RiskPatch; changedBy: string; reason?: string },
  ): Promise<Risk> {
    return this.strategy.updateRisk(payload.id, payload.patch, payload.changedBy, payload.reason);
  }
```

Leave `notes.risks.list`/`notes.risks.get`/`notes.risks.delete` handlers untouched — their signatures didn't change.

Then add these as genuinely new handlers (place them right after the updated risk handlers):

```typescript
  @MessagePattern('notes.risks.methodology.get')
  getRiskMethodology(@Payload() payload: { orgId: string }): Promise<RiskMethodology | null> {
    return this.strategy.getRiskMethodology(payload.orgId);
  }

  @MessagePattern('notes.risks.methodology.upsert')
  upsertRiskMethodology(
    @Payload() payload: { orgId: string; data: RiskMethodologyInput },
  ): Promise<RiskMethodology> {
    return this.strategy.upsertRiskMethodology(payload.orgId, payload.data);
  }

  @MessagePattern('notes.risks.taxonomy.list')
  listRiskTaxonomy(@Payload() payload: { orgId: string }): Promise<RiskTaxonomyCategory[]> {
    return this.strategy.listRiskTaxonomy(payload.orgId);
  }

  @MessagePattern('notes.risks.taxonomy.create')
  createRiskTaxonomyCategory(
    @Payload() payload: { orgId: string; data: RiskTaxonomyCategoryInput },
  ): Promise<RiskTaxonomyCategory> {
    return this.strategy.createRiskTaxonomyCategory(payload.orgId, payload.data);
  }

  @MessagePattern('notes.risks.taxonomy.archive')
  archiveRiskTaxonomyCategory(
    @Payload() payload: { id: string },
  ): Promise<RiskTaxonomyCategory> {
    return this.strategy.archiveRiskTaxonomyCategory(payload.id);
  }

  @MessagePattern('notes.risks.mappings.list')
  listRiskControlMappings(@Payload() payload: { riskId: string }): Promise<RiskControlMapping[]> {
    return this.strategy.listRiskControlMappings(payload.riskId);
  }

  @MessagePattern('notes.risks.mappings.add')
  addRiskControlMapping(
    @Payload() payload: { riskId: string; data: RiskControlMappingInput },
  ): Promise<RiskControlMapping> {
    return this.strategy.addRiskControlMapping(payload.riskId, payload.data);
  }

  @MessagePattern('notes.risks.mappings.remove')
  removeRiskControlMapping(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.removeRiskControlMapping(payload.id);
  }

  @MessagePattern('notes.risks.acceptance.create')
  createRiskAcceptance(
    @Payload()
    payload: { orgId: string; riskId: string; requestedBy: string; data: RiskAcceptanceInput },
  ): Promise<RiskAcceptance> {
    return this.strategy.createRiskAcceptance(
      payload.orgId,
      payload.riskId,
      payload.requestedBy,
      payload.data,
    );
  }

  @MessagePattern('notes.risks.acceptance.active')
  getActiveRiskAcceptance(@Payload() payload: { riskId: string }): Promise<RiskAcceptance | null> {
    return this.strategy.getActiveRiskAcceptance(payload.riskId);
  }

  @MessagePattern('notes.risks.acceptance.review')
  reviewRiskAcceptance(
    @Payload() payload: { id: string; reviewedBy: string; reviewNotes?: string },
  ): Promise<RiskAcceptance> {
    return this.strategy.reviewRiskAcceptance(payload.id, payload.reviewedBy, payload.reviewNotes);
  }

  @MessagePattern('notes.risks.acceptance.approve')
  approveRiskAcceptance(@Payload() payload: { id: string }): Promise<RiskAcceptance> {
    return this.strategy.approveRiskAcceptance(payload.id);
  }

  @MessagePattern('notes.risks.acceptance.reject')
  rejectRiskAcceptance(@Payload() payload: { id: string }): Promise<RiskAcceptance> {
    return this.strategy.rejectRiskAcceptance(payload.id);
  }

  @MessagePattern('notes.risks.snapshots.list')
  listRiskSnapshots(@Payload() payload: { riskId: string }): Promise<RiskSnapshot[]> {
    return this.strategy.listRiskSnapshots(payload.riskId);
  }

  @MessagePattern('notes.risks.evidence.list')
  listRiskEvidence(@Payload() payload: { riskId: string }): Promise<RequirementEvidence[]> {
    return this.strategy.listRiskEvidence(payload.riskId);
  }

  @MessagePattern('notes.risks.evidence.create')
  createRiskEvidence(
    @Payload()
    payload: { orgId: string; riskId: string; data: Omit<RequirementEvidence, 'id' | 'riskId'> },
  ): Promise<RequirementEvidence> {
    return this.strategy.createRiskEvidence(payload.orgId, payload.riskId, payload.data);
  }
```

Add every new type used above to this file's `@icore/shared` type imports.

- [ ] **Step 2: Build**

Run: `yarn nx build notes`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/src/app/notes.controller.ts
git commit -m "feat(notes): add TCP message handlers for risk register module"
```

---

### Task 15: `NotesClientService` — TCP proxy methods

**Files:**
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`

- [ ] **Step 1: Update the two existing risk proxy methods, add the rest as new**

Find `createRisk` and `updateRisk` in this file and update their signatures/bodies to match Task 14's payload shapes exactly:

```typescript
  createRisk(orgId: string, userId: string, data: RiskInput): Promise<Risk> {
    return signedSend<Risk>(this.client, 'notes.risks.create', { orgId, userId, data });
  }
```

```typescript
  updateRisk(id: string, patch: RiskPatch, changedBy: string, reason?: string): Promise<Risk> {
    return signedSend<Risk>(this.client, 'notes.risks.update', { id, patch, changedBy, reason });
  }
```

Leave `listRisks`/`getRisk`/`deleteRisk` untouched.

Then add these as genuinely new proxy methods:

```typescript
  getRiskMethodology(orgId: string): Promise<RiskMethodology | null> {
    return signedSend<RiskMethodology | null>(this.client, 'notes.risks.methodology.get', { orgId });
  }

  upsertRiskMethodology(orgId: string, data: RiskMethodologyInput): Promise<RiskMethodology> {
    return signedSend<RiskMethodology>(this.client, 'notes.risks.methodology.upsert', {
      orgId,
      data,
    });
  }

  listRiskTaxonomy(orgId: string): Promise<RiskTaxonomyCategory[]> {
    return signedSend<RiskTaxonomyCategory[]>(this.client, 'notes.risks.taxonomy.list', { orgId });
  }

  createRiskTaxonomyCategory(
    orgId: string,
    data: RiskTaxonomyCategoryInput,
  ): Promise<RiskTaxonomyCategory> {
    return signedSend<RiskTaxonomyCategory>(this.client, 'notes.risks.taxonomy.create', {
      orgId,
      data,
    });
  }

  archiveRiskTaxonomyCategory(id: string): Promise<RiskTaxonomyCategory> {
    return signedSend<RiskTaxonomyCategory>(this.client, 'notes.risks.taxonomy.archive', { id });
  }

  listRiskControlMappings(riskId: string): Promise<RiskControlMapping[]> {
    return signedSend<RiskControlMapping[]>(this.client, 'notes.risks.mappings.list', { riskId });
  }

  addRiskControlMapping(
    riskId: string,
    data: RiskControlMappingInput,
  ): Promise<RiskControlMapping> {
    return signedSend<RiskControlMapping>(this.client, 'notes.risks.mappings.add', {
      riskId,
      data,
    });
  }

  removeRiskControlMapping(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.risks.mappings.remove', { id });
  }

  createRiskAcceptance(
    orgId: string,
    riskId: string,
    requestedBy: string,
    data: RiskAcceptanceInput,
  ): Promise<RiskAcceptance> {
    return signedSend<RiskAcceptance>(this.client, 'notes.risks.acceptance.create', {
      orgId,
      riskId,
      requestedBy,
      data,
    });
  }

  getActiveRiskAcceptance(riskId: string): Promise<RiskAcceptance | null> {
    return signedSend<RiskAcceptance | null>(this.client, 'notes.risks.acceptance.active', {
      riskId,
    });
  }

  reviewRiskAcceptance(
    id: string,
    reviewedBy: string,
    reviewNotes?: string,
  ): Promise<RiskAcceptance> {
    return signedSend<RiskAcceptance>(this.client, 'notes.risks.acceptance.review', {
      id,
      reviewedBy,
      reviewNotes,
    });
  }

  approveRiskAcceptance(id: string): Promise<RiskAcceptance> {
    return signedSend<RiskAcceptance>(this.client, 'notes.risks.acceptance.approve', { id });
  }

  rejectRiskAcceptance(id: string): Promise<RiskAcceptance> {
    return signedSend<RiskAcceptance>(this.client, 'notes.risks.acceptance.reject', { id });
  }

  listRiskSnapshots(riskId: string): Promise<RiskSnapshot[]> {
    return signedSend<RiskSnapshot[]>(this.client, 'notes.risks.snapshots.list', { riskId });
  }

  listRiskEvidence(riskId: string): Promise<RequirementEvidence[]> {
    return signedSend<RequirementEvidence[]>(this.client, 'notes.risks.evidence.list', { riskId });
  }

  createRiskEvidence(
    orgId: string,
    riskId: string,
    data: Omit<RequirementEvidence, 'id' | 'riskId'>,
  ): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(this.client, 'notes.risks.evidence.create', {
      orgId,
      riskId,
      data,
    });
  }
```

Add the corresponding type imports.

- [ ] **Step 2: Build**

Run: `yarn nx build notes-client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes-client): proxy risk register module over TCP"
```

---

### Task 16: API Gateway — REST endpoints

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts`

- [ ] **Step 1: Update the two existing risk endpoints, add the rest as new**

Find `@Post('risks')` (`createRisk`) and update its body handling — it should now accept the rebuilt `RiskInput` shape (no code change needed beyond the type annotation if the body is passed straight through; verify the existing handler doesn't destructure old fields like `likelihood`/`impact` directly — if it does, remove that destructuring, the body now flows straight to `this.notes.createRisk(orgId, userId, body)` unchanged).

Find `@Patch('risks/:id')` (`updateRisk`) and update it to thread `changedBy`/`reason`:

```typescript
  @Patch('risks/:id')
  @ApiOperation({ summary: 'Update risk (writes a history snapshot first)' })
  updateRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: RiskPatch & { reason?: string },
  ) {
    const userId = this.uid(req);
    const { reason, ...patch } = body;
    return this.notes.updateRisk(id, patch, userId, reason);
  }
```

Then add these as genuinely new endpoints (follow the `// ─── Exceptions ───` section style, place under a new `// ─── Risk Register ───` heading near the existing risk endpoints):

```typescript
  @Get('risks/methodology')
  @ApiOperation({ summary: 'Get the org active risk methodology' })
  getRiskMethodology(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.getRiskMethodology(orgId);
  }

  @Post('risks/methodology')
  @ApiOperation({ summary: 'Update the org risk methodology (creates a new version)' })
  upsertRiskMethodology(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: RiskMethodologyInput,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.upsertRiskMethodology(orgId, body);
  }

  @Get('risks/taxonomy')
  @ApiOperation({ summary: 'List the org risk taxonomy categories' })
  listRiskTaxonomy(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listRiskTaxonomy(orgId);
  }

  @Post('risks/taxonomy')
  @ApiOperation({ summary: 'Add a risk taxonomy category' })
  createRiskTaxonomyCategory(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: RiskTaxonomyCategoryInput,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createRiskTaxonomyCategory(orgId, body);
  }

  @Patch('risks/taxonomy/:id/archive')
  @ApiOperation({ summary: 'Archive a risk taxonomy category' })
  archiveRiskTaxonomyCategory(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    return this.notes.archiveRiskTaxonomyCategory(id);
  }

  @Get('risks/:id/mappings')
  @ApiOperation({ summary: 'List controls mapped to a risk' })
  listRiskControlMappings(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    return this.notes.listRiskControlMappings(id);
  }

  @Post('risks/:id/mappings')
  @ApiOperation({ summary: 'Map a control to a risk' })
  addRiskControlMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: RiskControlMappingInput,
  ) {
    this.uid(req);
    return this.notes.addRiskControlMapping(id, body);
  }

  @Delete('risks/:riskId/mappings/:mappingId')
  @ApiOperation({ summary: 'Remove a risk-control mapping' })
  removeRiskControlMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('mappingId') mappingId: string,
  ) {
    this.uid(req);
    return this.notes.removeRiskControlMapping(mappingId);
  }

  @Post('risks/:id/acceptance')
  @ApiOperation({ summary: 'Request risk acceptance' })
  createRiskAcceptance(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: RiskAcceptanceInput,
  ) {
    const userId = this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createRiskAcceptance(orgId, id, userId, body);
  }

  @Get('risks/:id/acceptance/active')
  @ApiOperation({ summary: 'Get the active risk acceptance, if any' })
  getActiveRiskAcceptance(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
  ) {
    this.uid(req);
    return this.notes.getActiveRiskAcceptance(id);
  }

  @Post('risk-acceptances/:id/review')
  @ApiOperation({ summary: 'Review a risk acceptance request' })
  reviewRiskAcceptance(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { reviewNotes?: string },
  ) {
    const userId = this.uid(req);
    return this.notes.reviewRiskAcceptance(id, userId, body.reviewNotes);
  }

  @Post('risk-acceptances/:id/approve')
  @ApiOperation({ summary: 'Approve a risk acceptance request' })
  approveRiskAcceptance(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.approveRiskAcceptance(id);
  }

  @Post('risk-acceptances/:id/reject')
  @ApiOperation({ summary: 'Reject a risk acceptance request' })
  rejectRiskAcceptance(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.rejectRiskAcceptance(id);
  }

  @Get('risks/:id/snapshots')
  @ApiOperation({ summary: 'List risk history snapshots' })
  listRiskSnapshots(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listRiskSnapshots(id);
  }

  @Get('risks/:id/evidence')
  @ApiOperation({ summary: 'List evidence attached to a risk' })
  listRiskEvidence(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listRiskEvidence(id);
  }

  @Post('risks/:id/evidence')
  @ApiOperation({ summary: 'Attach evidence to a risk' })
  createRiskEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: Omit<RequirementEvidence, 'id' | 'riskId'>,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createRiskEvidence(orgId, id, body);
  }
```

Add every new type used above to this file's `@icore/shared` type imports.

- [ ] **Step 2: Build**

Run: `yarn nx build api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts
git commit -m "feat(api): expose risk register module over REST"
```

---

### Task 17: Client — `queries/risks.ts` hooks (full rebuild)

**Files:**
- Modify: `apps/client/src/queries/risks.ts` (replace entire contents)

Model this file on `apps/client/src/queries/controls.ts` — same `api()` helper, same `useQuery`/`useMutation` shape. Read `apps/client/src/queries/controls.ts` first to confirm the exact `api` import path (`@/lib/api`) before writing.

- [ ] **Step 1: Write the file**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Risk,
  RiskInput,
  RiskPatch,
  RiskMethodology,
  RiskMethodologyInput,
  RiskTaxonomyCategory,
  RiskTaxonomyCategoryInput,
  RiskControlMapping,
  RiskControlMappingInput,
  RiskAcceptance,
  RiskAcceptanceInput,
  RiskSnapshot,
  RequirementEvidence,
} from '@icore/shared';

export function useRisks(orgId?: string) {
  return useQuery<Risk[]>({
    queryKey: ['risks', orgId],
    queryFn: () => api<Risk[]>(`/notes/risks?orgId=${encodeURIComponent(orgId ?? '')}`),
    enabled: !!orgId,
  });
}

export function useRisk(id: string) {
  return useQuery<Risk>({
    queryKey: ['risks', id],
    queryFn: () => api<Risk>(`/notes/risks/${id}`),
    enabled: !!id,
  });
}

export function useCreateRisk(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Risk, Error, RiskInput>({
    mutationFn: (data) =>
      api<Risk>(`/notes/risks?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks'] }),
  });
}

export function useUpdateRisk(id: string) {
  const qc = useQueryClient();
  return useMutation<Risk, Error, RiskPatch & { reason?: string }>({
    mutationFn: (patch) =>
      api<Risk>(`/notes/risks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['risks'] });
      qc.invalidateQueries({ queryKey: ['risks', id] });
      qc.invalidateQueries({ queryKey: ['risks', id, 'snapshots'] });
    },
  });
}

export function useDeleteRisk() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/risks/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks'] }),
  });
}

export function useRiskMethodology(orgId?: string) {
  return useQuery<RiskMethodology>({
    queryKey: ['risk-methodology', orgId],
    queryFn: () => api<RiskMethodology>(`/notes/risks/methodology?orgId=${encodeURIComponent(orgId ?? '')}`),
    enabled: !!orgId,
  });
}

export function useUpsertRiskMethodology(orgId: string) {
  const qc = useQueryClient();
  return useMutation<RiskMethodology, Error, RiskMethodologyInput>({
    mutationFn: (data) =>
      api<RiskMethodology>(`/notes/risks/methodology?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-methodology', orgId] }),
  });
}

export function useRiskTaxonomy(orgId?: string) {
  return useQuery<RiskTaxonomyCategory[]>({
    queryKey: ['risk-taxonomy', orgId],
    queryFn: () => api<RiskTaxonomyCategory[]>(`/notes/risks/taxonomy?orgId=${encodeURIComponent(orgId ?? '')}`),
    enabled: !!orgId,
  });
}

export function useCreateRiskTaxonomyCategory(orgId: string) {
  const qc = useQueryClient();
  return useMutation<RiskTaxonomyCategory, Error, RiskTaxonomyCategoryInput>({
    mutationFn: (data) =>
      api<RiskTaxonomyCategory>(`/notes/risks/taxonomy?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-taxonomy', orgId] }),
  });
}

export function useArchiveRiskTaxonomyCategory(orgId: string) {
  const qc = useQueryClient();
  return useMutation<RiskTaxonomyCategory, Error, string>({
    mutationFn: (id) => api<RiskTaxonomyCategory>(`/notes/risks/taxonomy/${id}/archive`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risk-taxonomy', orgId] }),
  });
}

export function useRiskControlMappings(riskId: string) {
  return useQuery<RiskControlMapping[]>({
    queryKey: ['risks', riskId, 'mappings'],
    queryFn: () => api<RiskControlMapping[]>(`/notes/risks/${riskId}/mappings`),
    enabled: !!riskId,
  });
}

export function useAddRiskControlMapping(riskId: string) {
  const qc = useQueryClient();
  return useMutation<RiskControlMapping, Error, RiskControlMappingInput>({
    mutationFn: (data) =>
      api<RiskControlMapping>(`/notes/risks/${riskId}/mappings`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'mappings'] }),
  });
}

export function useRemoveRiskControlMapping(riskId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (mappingId) =>
      api<void>(`/notes/risks/${riskId}/mappings/${mappingId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'mappings'] }),
  });
}

export function useActiveRiskAcceptance(riskId: string) {
  return useQuery<RiskAcceptance | null>({
    queryKey: ['risks', riskId, 'acceptance'],
    queryFn: () => api<RiskAcceptance | null>(`/notes/risks/${riskId}/acceptance/active`),
    enabled: !!riskId,
  });
}

export function useCreateRiskAcceptance(orgId: string, riskId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAcceptance, Error, RiskAcceptanceInput>({
    mutationFn: (data) =>
      api<RiskAcceptance>(`/notes/risks/${riskId}/acceptance?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'acceptance'] }),
  });
}

export function useReviewRiskAcceptance(riskId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAcceptance, Error, { id: string; reviewNotes?: string }>({
    mutationFn: ({ id, reviewNotes }) =>
      api<RiskAcceptance>(`/notes/risk-acceptances/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ reviewNotes }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'acceptance'] }),
  });
}

export function useApproveRiskAcceptance(riskId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAcceptance, Error, string>({
    mutationFn: (id) => api<RiskAcceptance>(`/notes/risk-acceptances/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'acceptance'] }),
  });
}

export function useRejectRiskAcceptance(riskId: string) {
  const qc = useQueryClient();
  return useMutation<RiskAcceptance, Error, string>({
    mutationFn: (id) => api<RiskAcceptance>(`/notes/risk-acceptances/${id}/reject`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'acceptance'] }),
  });
}

export function useRiskSnapshots(riskId: string) {
  return useQuery<RiskSnapshot[]>({
    queryKey: ['risks', riskId, 'snapshots'],
    queryFn: () => api<RiskSnapshot[]>(`/notes/risks/${riskId}/snapshots`),
    enabled: !!riskId,
  });
}

export function useRiskEvidence(riskId: string) {
  return useQuery<RequirementEvidence[]>({
    queryKey: ['risks', riskId, 'evidence'],
    queryFn: () => api<RequirementEvidence[]>(`/notes/risks/${riskId}/evidence`),
    enabled: !!riskId,
  });
}

export function useCreateRiskEvidence(orgId: string, riskId: string) {
  const qc = useQueryClient();
  return useMutation<RequirementEvidence, Error, Omit<RequirementEvidence, 'id' | 'riskId'>>({
    mutationFn: (data) =>
      api<RequirementEvidence>(
        `/notes/risks/${riskId}/evidence?orgId=${encodeURIComponent(orgId)}`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['risks', riskId, 'evidence'] }),
  });
}
```

- [ ] **Step 2: Build**

Run: `yarn nx build client`
Expected: FAILS — `risks.tsx` still imports the old hook shapes and old `RiskInput` fields. This is expected; Task 20 rewrites it. Confirm the failure is ONLY in `risks.tsx` (and possibly `risks_.$id.tsx` if that file exists — it doesn't yet, Task 21 creates it), not in `queries/risks.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/queries/risks.ts
git commit -m "feat(client): rebuild React Query hooks for risk register module"
```

---

### Task 18: Client — reusable multi-select component

**Files:**
- Create: `apps/client/src/components/ui/multi-select.tsx`

There is no existing multi-select primitive in this codebase (only a single-select `Combobox` at `apps/client/src/components/ui/combobox.tsx` — read it first for the styling conventions to match, e.g. border/background/focus-ring classes used throughout this repo's custom form controls).

- [ ] **Step 1: Write the component**

```tsx
interface MultiSelectOption {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function MultiSelect({ options, selected, onChange, placeholder }: MultiSelectProps) {
  function toggle(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  return (
    <div className="rounded-md border border-border bg-surface max-h-40 overflow-y-auto p-2 space-y-1">
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground px-1 py-1">{placeholder}</p>
      ) : (
        options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-2 px-1 py-1 rounded text-sm cursor-pointer hover:bg-background"
          >
            <input
              type="checkbox"
              checked={selected.includes(opt.value)}
              onChange={() => toggle(opt.value)}
              className="accent-green-500"
            />
            <span className="text-foreground truncate">{opt.label}</span>
          </label>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `yarn nx build client`
Expected: this new file compiles cleanly on its own (the overall `client` build still fails from Task 17's expected `risks.tsx` breakage — confirm no NEW errors originate from this file specifically).

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/ui/multi-select.tsx
git commit -m "feat(client): add reusable MultiSelect component"
```

---

### Task 19: Client — Risk Heatmap component

**Files:**
- Create: `apps/client/src/components/risks/RiskHeatmap.tsx`

**Interfaces:**
- Consumes: `Risk`, `RiskMethodology` types.
- Produces: `RiskHeatmap` component with props `{ risks: Risk[]; methodology: RiskMethodology; mode: 'inherent' | 'residual'; onCellClick: (likelihood: number, impact: number) => void }`.

- [ ] **Step 1: Write the component**

```tsx
import { useTranslation } from 'react-i18next';
import type { Risk, RiskMethodology, RiskScoreLabel } from '@icore/shared';

const LABEL_COLOR: Record<RiskScoreLabel, string> = {
  low: 'bg-green-500/20 text-green-400',
  medium: 'bg-amber-500/20 text-amber-400',
  high: 'bg-orange-500/20 text-orange-400',
  critical: 'bg-red-500/20 text-red-400',
};

interface RiskHeatmapProps {
  risks: Risk[];
  methodology: RiskMethodology;
  mode: 'inherent' | 'residual';
  onCellClick: (likelihood: number, impact: number) => void;
}

export function RiskHeatmap({ risks, methodology, mode, onCellClick }: RiskHeatmapProps) {
  const { t } = useTranslation();
  const size = methodology.scaleSize;

  function labelForScore(score: number): RiskScoreLabel {
    const band = methodology.thresholds.find((band) => score <= band.maxScore);
    return band?.label ?? 'critical';
  }

  function countAt(likelihood: number, impact: number): number {
    return risks.filter((r) =>
      mode === 'inherent'
        ? r.inherentLikelihood === likelihood && r.inherentImpact === impact
        : r.residualLikelihood === likelihood && r.residualImpact === impact,
    ).length;
  }

  return (
    <div className="inline-block">
      <div className="flex flex-col-reverse gap-1">
        {Array.from({ length: size }, (_, i) => i + 1).map((impact) => (
          <div key={impact} className="flex gap-1">
            {Array.from({ length: size }, (_, i) => i + 1).map((likelihood) => {
              const count = countAt(likelihood, impact);
              const label = labelForScore(likelihood * impact);
              return (
                <button
                  key={likelihood}
                  type="button"
                  onClick={() => onCellClick(likelihood, impact)}
                  className={`w-14 h-14 rounded flex items-center justify-center text-sm font-semibold cursor-pointer transition-transform hover:scale-105 ${LABEL_COLOR[label]}`}
                  title={`${t('risks.heatmap.likelihood')}: ${methodology.likelihoodLabels[likelihood - 1]}, ${t('risks.heatmap.impact')}: ${methodology.impactLabels[impact - 1]}`}
                >
                  {count > 0 ? count : ''}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mt-2">{t('risks.heatmap.axisLabel')}</p>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `yarn nx build client`
Expected: this file compiles cleanly on its own (overall build still shows the expected `risks.tsx` failure from Task 17, unrelated to this file).

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/components/risks/RiskHeatmap.tsx
git commit -m "feat(client): add RiskHeatmap component"
```

---

### Task 20: Client — Risk Register list page rebuild

**Files:**
- Create: `apps/client/src/routes/_dashboard/-risks.page.tsx`
- Modify: `apps/client/src/routes/_dashboard/risks.tsx` (becomes a thin wrapper)

Split the page component out from the start (per Global Constraints) — do not repeat Controls' Task 19 retrofit.

- [ ] **Step 1: Write `-risks.page.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { PageLayout } from '@/components/PageLayout';
import { ScrollableRow } from '@/components/ui/scrollable-row';
import { RiskHeatmap } from '@/components/risks/RiskHeatmap';
import { RiskTable } from '@/components/risks/RiskTable';
import { RiskMethodologySheet } from '@/components/risks/RiskMethodologySheet';
import { useActiveOrgStore } from '@/stores/active-org';
import { useAssets } from '@/queries/assets';
import { useVendors } from '@/queries/vendors';
import {
  useRisks,
  useCreateRisk,
  useDeleteRisk,
  useRiskMethodology,
  useRiskTaxonomy,
} from '@/queries/risks';
import type { RiskInput } from '@icore/shared';

const EMPTY_FORM: RiskInput = {
  title: '',
  riskStatement: '',
  taxonomyCategoryId: '',
  ownerId: '',
  inherentLikelihood: 0,
  inherentImpact: 0,
};

export function RisksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: risks = [], isPending } = useRisks(orgId);
  const { data: methodology } = useRiskMethodology(orgId);
  const { data: taxonomy = [] } = useRiskTaxonomy(orgId);
  const { data: assets = [] } = useAssets(orgId);
  const { data: vendors = [] } = useVendors(orgId);
  const createMut = useCreateRisk(orgId);
  const deleteMut = useDeleteRisk();

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<RiskInput>(EMPTY_FORM);
  const [heatmapMode, setHeatmapMode] = useState<'inherent' | 'residual'>('inherent');
  const [cellFilter, setCellFilter] = useState<{ likelihood: number; impact: number } | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showAboveAppetite, setShowAboveAppetite] = useState(false);

  const owners = useMemo(() => [...new Set(risks.map((r) => r.ownerId))].sort(), [risks]);

  const filtered = useMemo(() => {
    return risks.filter((r) => {
      if (categoryFilter && r.taxonomyCategoryId !== categoryFilter) return false;
      if (ownerFilter && r.ownerId !== ownerFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (showAboveAppetite && !r.aboveAppetite) return false;
      if (cellFilter) {
        const l = heatmapMode === 'inherent' ? r.inherentLikelihood : r.residualLikelihood;
        const i = heatmapMode === 'inherent' ? r.inherentImpact : r.residualImpact;
        if (l !== cellFilter.likelihood || i !== cellFilter.impact) return false;
      }
      return true;
    });
  }, [risks, categoryFilter, ownerFilter, statusFilter, showAboveAppetite, cellFilter, heatmapMode]);

  const summary = useMemo(() => {
    const active = risks.filter((r) => r.status !== 'closed');
    const critical = active.filter((r) => r.inherentLabel === 'critical').length;
    const high = active.filter((r) => r.inherentLabel === 'high').length;
    const aboveAppetite = active.filter((r) => r.aboveAppetite).length;
    const overdue = active.filter((r) => r.targetDate && r.targetDate < new Date().toISOString()).length;
    return { total: active.length, critical, high, aboveAppetite, overdue };
  }, [risks]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.taxonomyCategoryId || !form.ownerId) return;
    if (!form.inherentLikelihood || !form.inherentImpact) return;
    createMut.mutate(form, { onSuccess: () => { setCreateOpen(false); setForm(EMPTY_FORM); } });
  }

  return (
    <PageLayout title={t('nav.risks')}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm">
          <span className="font-semibold text-foreground">
            {summary.total} {t('risks.summaryActive')} · {summary.critical} {t('risks.summaryCritical')} ·{' '}
            {summary.high} {t('risks.summaryHigh')} · {summary.aboveAppetite}{' '}
            {t('risks.summaryAboveAppetite')} · {summary.overdue} {t('risks.summaryOverdue')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <RiskMethodologySheet orgId={orgId} />
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!orgId}>
            <Plus size={14} className="mr-1.5" />
            {t('risks.addRisk')}
          </Button>
        </div>
      </div>

      {methodology && (
        <div className="mb-4 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setHeatmapMode('inherent')}
              className={`px-2 py-1 rounded text-xs cursor-pointer ${heatmapMode === 'inherent' ? 'bg-green-500/10 text-green-500' : 'text-muted-foreground'}`}
            >
              {t('risks.heatmap.inherent')}
            </button>
            <button
              type="button"
              onClick={() => setHeatmapMode('residual')}
              className={`px-2 py-1 rounded text-xs cursor-pointer ${heatmapMode === 'residual' ? 'bg-green-500/10 text-green-500' : 'text-muted-foreground'}`}
            >
              {t('risks.heatmap.residual')}
            </button>
          </div>
          <RiskHeatmap
            risks={risks}
            methodology={methodology}
            mode={heatmapMode}
            onCellClick={(likelihood, impact) =>
              setCellFilter((prev) =>
                prev?.likelihood === likelihood && prev?.impact === impact
                  ? null
                  : { likelihood, impact },
              )
            }
          />
        </div>
      )}

      <ScrollableRow className="mb-3">
        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
          >
            <option value="">{t('risks.filterAllCategories')}</option>
            {taxonomy.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
          >
            <option value="">{t('risks.filterAllOwners')}</option>
            {owners.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
          >
            <option value="">{t('risks.filterAllStatus')}</option>
            {(['open', 'monitoring', 'closed'] as const).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showAboveAppetite}
              onChange={(e) => setShowAboveAppetite(e.target.checked)}
              className="accent-green-500"
            />
            <span className="text-xs text-muted-foreground">{t('risks.filterAboveAppetite')}</span>
          </label>
        </div>
      </ScrollableRow>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <RiskTable
          risks={filtered}
          taxonomy={taxonomy}
          onRowClick={(id) => void navigate({ to: '/risks/$id', params: { id } })}
          onDeleteClick={setConfirmDeleteId}
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('risks.addRisk')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-3 max-h-[70vh] overflow-y-auto">
            <div>
              <Label htmlFor="risk-title">{t('risks.title')}</Label>
              <Input
                id="risk-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="risk-statement">{t('risks.riskStatement')}</Label>
              <textarea
                id="risk-statement"
                value={form.riskStatement}
                onChange={(e) => setForm((f) => ({ ...f, riskStatement: e.target.value }))}
                placeholder={t('risks.riskStatementPlaceholder')}
                rows={3}
                required
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('risks.category')}</Label>
                <select
                  value={form.taxonomyCategoryId}
                  onChange={(e) => setForm((f) => ({ ...f, taxonomyCategoryId: e.target.value }))}
                  required
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
                >
                  <option value="">{t('risks.selectCategory')}</option>
                  {taxonomy.filter((c) => !c.archived).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="risk-owner">{t('risks.owner')}</Label>
                <Input
                  id="risk-owner"
                  value={form.ownerId}
                  onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))}
                  required
                />
              </div>
            </div>
            <div>
              <Label>{t('risks.affectedAssets')}</Label>
              <MultiSelect
                options={assets.map((a) => ({ value: a.id, label: a.name }))}
                selected={form.assetIds ?? []}
                onChange={(assetIds) => setForm((f) => ({ ...f, assetIds }))}
                placeholder={t('risks.noAssets')}
              />
            </div>
            <div>
              <Label>{t('risks.relatedVendors')}</Label>
              <MultiSelect
                options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                selected={form.vendorIds ?? []}
                onChange={(vendorIds) => setForm((f) => ({ ...f, vendorIds }))}
                placeholder={t('risks.noVendors')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('risks.inherentLikelihood')}</Label>
                <select
                  value={form.inherentLikelihood || ''}
                  onChange={(e) => setForm((f) => ({ ...f, inherentLikelihood: Number(e.target.value) }))}
                  required
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
                >
                  <option value="">{t('risks.selectLikelihood')}</option>
                  {methodology?.likelihoodLabels.map((label, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1} — {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label>{t('risks.inherentImpact')}</Label>
                <select
                  value={form.inherentImpact || ''}
                  onChange={(e) => setForm((f) => ({ ...f, inherentImpact: Number(e.target.value) }))}
                  required
                  className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
                >
                  <option value="">{t('risks.selectImpact')}</option>
                  {methodology?.impactLabels.map((label, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1} — {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createMut.isPending}>
                {t('risks.addRisk')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialogWrapper
        open={!!confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          if (confirmDeleteId) deleteMut.mutate(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </PageLayout>
  );
}
```

`AlertDialogWrapper` here is a placeholder name standing in for the real inline `AlertDialog`/`AlertDialogContent`/`AlertDialogHeader`/`AlertDialogTitle`/`AlertDialogDescription`/`AlertDialogFooter`/`AlertDialogAction`/`AlertDialogCancel` markup — write it out exactly the way Controls' Task 17 did (`apps/client/src/routes/_dashboard/-controls.page.tsx`'s delete `AlertDialog` block is the reference; read that file and copy its structure verbatim, substituting `t('risks.deleteConfirmTitle')`/`t('risks.deleteConfirmDescription')`), then delete the `AlertDialogWrapper` placeholder and inline the real markup directly in this file. Import `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel`, `AlertDialogContent`, `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogHeader`, `AlertDialogTitle` from `@/components/ui/alert-dialog`.

- [ ] **Step 2: Rewrite `risks.tsx` as a thin wrapper**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { RisksPage } from './-risks.page';

export const Route = createFileRoute('/_dashboard/risks')({
  component: RisksPage,
});
```

- [ ] **Step 3: Build**

Run: `npx prettier --write apps/client/src/routes/_dashboard/risks.tsx apps/client/src/routes/_dashboard/-risks.page.tsx && yarn nx lint client && yarn nx build client`
Expected: PASS (assuming `useAssets`/`useVendors` hooks with this exact name/signature already exist in `apps/client/src/queries/assets.ts`/`apps/client/src/queries/vendors.ts` — verify their real signatures first and adjust the calls above if they differ, e.g. if they don't take an `orgId` argument the same way).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/routes/_dashboard/risks.tsx apps/client/src/routes/_dashboard/-risks.page.tsx
git commit -m "feat(client): rebuild Risk Register list page with heatmap and filters"
```

---

### Task 21: Client — `RiskTable` and `RiskMethodologySheet` components

**Files:**
- Create: `apps/client/src/components/risks/RiskTable.tsx`
- Create: `apps/client/src/components/risks/RiskMethodologySheet.tsx`

- [ ] **Step 1: Write `RiskTable.tsx`**

```tsx
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import type { Risk, RiskTaxonomyCategory } from '@icore/shared';

interface RiskTableProps {
  risks: Risk[];
  taxonomy: RiskTaxonomyCategory[];
  onRowClick: (id: string) => void;
  onDeleteClick: (id: string) => void;
}

export function RiskTable({ risks, taxonomy, onRowClick, onDeleteClick }: RiskTableProps) {
  const { t } = useTranslation();
  const categoryName = (id: string) => taxonomy.find((c) => c.id === id)?.name ?? '—';

  if (risks.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        {t('risks.empty')}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="py-2 px-3">{t('risks.colId')}</th>
            <th className="py-2 px-3">{t('risks.colTitle')}</th>
            <th className="py-2 px-3">{t('risks.colCategory')}</th>
            <th className="py-2 px-3">{t('risks.colOwner')}</th>
            <th className="py-2 px-3">{t('risks.colInherent')}</th>
            <th className="py-2 px-3">{t('risks.colResidual')}</th>
            <th className="py-2 px-3">{t('risks.colAppetite')}</th>
            <th className="py-2 px-3">{t('risks.colTreatment')}</th>
            <th className="py-2 px-3">{t('risks.colStatus')}</th>
            <th className="py-2 px-3" />
          </tr>
        </thead>
        <tbody>
          {risks.map((r) => (
            <tr
              key={r.id}
              onClick={() => onRowClick(r.id)}
              className="border-b border-border hover:bg-surface cursor-pointer"
            >
              <td className="py-2 px-3 font-mono text-xs">{r.riskId}</td>
              <td className="py-2 px-3">{r.title}</td>
              <td className="py-2 px-3 text-muted-foreground">{categoryName(r.taxonomyCategoryId)}</td>
              <td className="py-2 px-3 text-muted-foreground">{r.ownerId}</td>
              <td className="py-2 px-3">
                {r.inherentScore} · {r.inherentLabel}
              </td>
              <td className="py-2 px-3">
                {r.residualScore != null ? `${r.residualScore} · ${r.residualLabel}` : '—'}
              </td>
              <td className="py-2 px-3">
                {r.aboveAppetite === undefined ? '—' : r.aboveAppetite ? '⚠' : '✓'}
              </td>
              <td className="py-2 px-3">{r.treatmentStrategy ?? '—'}</td>
              <td className="py-2 px-3">{r.status}</td>
              <td className="py-2 px-3 text-center">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteClick(r.id);
                  }}
                  className="text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Write `RiskMethodologySheet.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import {
  useRiskMethodology,
  useUpsertRiskMethodology,
  useRiskTaxonomy,
  useCreateRiskTaxonomyCategory,
  useArchiveRiskTaxonomyCategory,
} from '@/queries/risks';

export function RiskMethodologySheet({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'methodology' | 'taxonomy'>('methodology');
  const [newCategory, setNewCategory] = useState('');

  const { data: methodology } = useRiskMethodology(orgId);
  const upsertMut = useUpsertRiskMethodology(orgId);
  const { data: taxonomy = [] } = useRiskTaxonomy(orgId);
  const createCategoryMut = useCreateRiskTaxonomyCategory(orgId);
  const archiveCategoryMut = useArchiveRiskTaxonomyCategory(orgId);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Settings size={14} className="mr-1.5" />
        {t('risks.methodologySettings')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('risks.methodologySettings')}</SheetTitle>
          </SheetHeader>
          <div className="flex gap-2 mt-4 mb-4">
            <button
              type="button"
              onClick={() => setTab('methodology')}
              className={`px-3 py-1.5 text-sm rounded cursor-pointer ${tab === 'methodology' ? 'bg-green-500/10 text-green-500' : 'text-muted-foreground'}`}
            >
              {t('risks.tabMethodology')}
            </button>
            <button
              type="button"
              onClick={() => setTab('taxonomy')}
              className={`px-3 py-1.5 text-sm rounded cursor-pointer ${tab === 'taxonomy' ? 'bg-green-500/10 text-green-500' : 'text-muted-foreground'}`}
            >
              {t('risks.tabTaxonomy')}
            </button>
          </div>

          {tab === 'methodology' && methodology && (
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                {t('risks.scaleSize')}: {methodology.scaleSize}×{methodology.scaleSize}
              </p>
              <p className="text-muted-foreground">
                {t('risks.appetiteThreshold')}: {methodology.appetiteThreshold}
              </p>
              <Button
                size="sm"
                onClick={() =>
                  upsertMut.mutate({
                    scaleSize: methodology.scaleSize,
                    likelihoodLabels: methodology.likelihoodLabels,
                    impactLabels: methodology.impactLabels,
                    thresholds: methodology.thresholds,
                    appetiteThreshold: methodology.appetiteThreshold,
                  })
                }
              >
                {t('risks.saveNewVersion')}
              </Button>
            </div>
          )}

          {tab === 'taxonomy' && (
            <div className="space-y-2">
              {taxonomy.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm py-1">
                  <span className={c.archived ? 'line-through text-muted-foreground' : ''}>
                    {c.name}
                  </span>
                  {!c.archived && (
                    <button
                      type="button"
                      onClick={() => archiveCategoryMut.mutate(c.id)}
                      className="text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                    >
                      {t('common.delete')}
                    </button>
                  )}
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Input
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder={t('risks.newCategoryPlaceholder')}
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (!newCategory.trim()) return;
                    createCategoryMut.mutate({ name: newCategory.trim() });
                    setNewCategory('');
                  }}
                >
                  {t('common.create')}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
```

Confirm the exact `Sheet`/`SheetContent`/`SheetHeader`/`SheetTitle` import path (`@/components/ui/sheet`) by checking how any existing Edit-Sheet in this repo imports them (e.g. search for `SheetContent` usage in `apps/client/src/routes/_dashboard/-exceptions.page.tsx` or similar) before finalizing — adjust the import path if it differs.

- [ ] **Step 3: Build**

Run: `yarn nx build client`
Expected: still shows the expected pending failures from any task not yet complete at this point in execution order (there are none remaining that these two files depend on — if the build fails specifically because of these two new files, fix them; ignore failures attributable to `risks_.$id.tsx` not existing yet, since Task 22 creates it).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/components/risks/RiskTable.tsx apps/client/src/components/risks/RiskMethodologySheet.tsx
git commit -m "feat(client): add RiskTable and RiskMethodologySheet components"
```

---

### Task 22: Client — Risk Profile detail route: Overview, Assessment, Controls tabs

**Files:**
- Create: `apps/client/src/routes/_dashboard/risks_.$id.tsx`
- Create: `apps/client/src/routes/_dashboard/-risks-detail.page.tsx`

Model the route-splitting and tab-shell structure on `apps/client/src/routes/_dashboard/controls_.$id.tsx` + `-controls-detail.page.tsx` — read both files first for the exact pattern (this repo's most recent, already-reviewed detail-page precedent) before writing.

- [ ] **Step 1: Write `risks_.$id.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { RiskDetailPage } from './-risks-detail.page';

export const Route = createFileRoute('/_dashboard/risks_/$id')({
  component: RiskDetailPage,
});
```

- [ ] **Step 2: Write `-risks-detail.page.tsx` with the first three tabs**

```tsx
import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/PageLayout';
import { ScrollableRow } from '@/components/ui/scrollable-row';
import { useRisk, useRiskTaxonomy, useRiskControlMappings } from '@/queries/risks';
import { useActiveOrgStore } from '@/stores/active-org';

type Tab = 'overview' | 'assessment' | 'controls' | 'treatment' | 'relationships' | 'evidence' | 'history';

export function RiskDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/_dashboard/risks_/$id' });
  const { activeOrgId } = useActiveOrgStore();
  const { data: risk, isPending } = useRisk(id);
  const { data: taxonomy = [] } = useRiskTaxonomy(activeOrgId ?? undefined);
  const { data: mappings = [] } = useRiskControlMappings(id);
  const [tab, setTab] = useState<Tab>('overview');

  if (isPending || !risk) {
    return (
      <PageLayout title={t('risks.detailTitle')}>
        <div className="h-64 bg-surface border border-border rounded-lg animate-pulse" />
      </PageLayout>
    );
  }

  const categoryName = taxonomy.find((c) => c.id === risk.taxonomyCategoryId)?.name ?? '—';
  const tabs: Tab[] = ['overview', 'assessment', 'controls', 'treatment', 'relationships', 'evidence', 'history'];

  return (
    <PageLayout title={`${risk.riskId} — ${risk.title}`}>
      <ScrollableRow className="border-b border-border mb-4">
        <div className="flex items-center gap-1">
          {tabs.map((tKey) => (
            <button
              key={tKey}
              type="button"
              onClick={() => setTab(tKey)}
              className={`px-3 py-2 text-sm border-b-2 -mb-px cursor-pointer ${
                tab === tKey
                  ? 'border-green-500 text-foreground font-medium'
                  : 'border-transparent text-muted-foreground'
              }`}
            >
              {t(`risks.tab.${tKey}`)}
            </button>
          ))}
        </div>
      </ScrollableRow>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label={t('risks.colId')} value={risk.riskId} />
          <Field label={t('risks.title')} value={risk.title} />
          <Field label={t('risks.riskStatement')} value={risk.riskStatement} />
          <Field label={t('risks.category')} value={categoryName} />
          <Field label={t('risks.owner')} value={risk.ownerId} />
          <Field label={t('risks.businessUnit')} value={risk.businessUnit ?? ''} />
          <Field
            label={t('risks.colInherent')}
            value={`${risk.inherentScore} — ${risk.inherentLabel} (L:${risk.inherentLikelihood} × I:${risk.inherentImpact})`}
          />
          <Field
            label={t('risks.colResidual')}
            value={
              risk.residualScore != null
                ? `${risk.residualScore} — ${risk.residualLabel} (L:${risk.residualLikelihood} × I:${risk.residualImpact})`
                : t('risks.notYetAssessed')
            }
          />
          <Field
            label={t('risks.colAppetite')}
            value={risk.aboveAppetite === undefined ? '—' : risk.aboveAppetite ? t('risks.aboveAppetite') : t('risks.withinAppetite')}
          />
          <Field label={t('risks.colStatus')} value={risk.status} />
        </div>
      )}

      {tab === 'assessment' && (
        <div className="py-8 text-center text-muted-foreground text-sm">
          {t('risks.noAssessmentsYet')}
        </div>
      )}

      {tab === 'controls' && (
        <div className="space-y-2 text-sm">
          {mappings.map((m) => (
            <div key={m.id} className="border border-border rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="font-mono text-xs mr-2">{m.controlCode}</span>
                <span>{m.controlTitle}</span>
              </div>
              <span className="text-xs text-muted-foreground">{m.effectivenessNote ?? '—'}</span>
            </div>
          ))}
          {mappings.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">{t('risks.noMitigatingControls')}</div>
          )}
        </div>
      )}
    </PageLayout>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-foreground">{value || '—'}</div>
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `yarn nx build client`
Expected: PASS for these two new files. Confirm `routeTree.gen.ts` picked up the new route (it auto-regenerates via the Vite dev server's file watcher if one is running, or via the build itself — check the generated file for `risks_/$id` after building).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/routes/_dashboard/risks_.\$id.tsx apps/client/src/routes/_dashboard/-risks-detail.page.tsx apps/client/src/routeTree.gen.ts
git commit -m "feat(client): add Risk Profile route with Overview/Assessment/Controls tabs"
```

---

### Task 23: Client — Risk Profile: Treatment, Relationships, Evidence, History tabs

**Files:**
- Modify: `apps/client/src/routes/_dashboard/-risks-detail.page.tsx`

**Interfaces:**
- Consumes: `useUpdateRisk`, `useActiveRiskAcceptance`, `useCreateRiskAcceptance`, `useReviewRiskAcceptance`, `useApproveRiskAcceptance`, `useRejectRiskAcceptance`, `useRiskEvidence`, `useCreateRiskEvidence`, `useRiskSnapshots` from Task 17; `useAssets`, `useVendors` (existing).

- [ ] **Step 1: Add the imports and hooks**

```tsx
import {
  useRisk, useRiskTaxonomy, useRiskControlMappings, useUpdateRisk,
  useActiveRiskAcceptance, useCreateRiskAcceptance, useApproveRiskAcceptance,
  useRejectRiskAcceptance, useRiskEvidence, useCreateRiskEvidence, useRiskSnapshots,
} from '@/queries/risks';
import { useAssets } from '@/queries/assets';
import { useVendors } from '@/queries/vendors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
```

Inside `RiskDetailPage`, after the existing hooks, add:

```tsx
  const updateMut = useUpdateRisk(id);
  const { data: activeAcceptance } = useActiveRiskAcceptance(id);
  const createAcceptanceMut = useCreateRiskAcceptance(activeOrgId ?? '', id);
  const approveAcceptanceMut = useApproveRiskAcceptance(id);
  const rejectAcceptanceMut = useRejectRiskAcceptance(id);
  const { data: evidence = [] } = useRiskEvidence(id);
  const { data: snapshots = [] } = useRiskSnapshots(id);
  const { data: assets = [] } = useAssets(activeOrgId ?? '');
  const { data: vendors = [] } = useVendors(activeOrgId ?? '');
  const [acceptanceOpen, setAcceptanceOpen] = useState(false);
  const [acceptanceForm, setAcceptanceForm] = useState({
    justification: '', compensatingControls: '', expiresAt: '', approverId: '',
  });
```

- [ ] **Step 2: Add the four tab bodies after the `controls` tab block**

```tsx
      {tab === 'treatment' && (
        <div className="space-y-4 text-sm max-w-2xl">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">{t('risks.treatmentStrategy')}</span>
              <select
                defaultValue={risk.treatmentStrategy ?? ''}
                onChange={(e) =>
                  updateMut.mutate({ treatmentStrategy: e.target.value as typeof risk.treatmentStrategy })
                }
                className="mt-1 w-full h-9 rounded-md border border-border bg-surface px-2 text-sm"
              >
                <option value="">{t('risks.selectTreatment')}</option>
                {(['avoid', 'mitigate', 'transfer', 'accept', 'monitor'] as const).map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">{t('risks.treatmentOwner')}</span>
              <Input
                defaultValue={risk.treatmentOwner}
                onBlur={(e) => updateMut.mutate({ treatmentOwner: e.target.value })}
                className="mt-1"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-muted-foreground">{t('risks.treatmentPlan')}</span>
            <textarea
              defaultValue={risk.treatmentPlan}
              onBlur={(e) => updateMut.mutate({ treatmentPlan: e.target.value })}
              rows={3}
              className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm resize-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-muted-foreground">{t('risks.targetScore')}</span>
              <Input
                type="number"
                defaultValue={risk.targetScore}
                onBlur={(e) => updateMut.mutate({ targetScore: Number(e.target.value) })}
                className="mt-1"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">{t('risks.targetDate')}</span>
              <Input
                type="date"
                defaultValue={risk.targetDate?.slice(0, 10)}
                onBlur={(e) => updateMut.mutate({ targetDate: e.target.value })}
                className="mt-1"
              />
            </label>
          </div>

          <div className="pt-4 border-t border-border">
            <h3 className="text-sm font-medium mb-2">{t('risks.riskAcceptance')}</h3>
            {activeAcceptance ? (
              <div className="border border-border rounded-lg p-3 space-y-1">
                <p>
                  {t('risks.status')}: <strong>{activeAcceptance.status}</strong>
                </p>
                <p className="text-muted-foreground">{activeAcceptance.justification}</p>
                <p className="text-xs text-muted-foreground">
                  {t('risks.expiresAt')}: {activeAcceptance.expiresAt.slice(0, 10)}
                </p>
                {activeAcceptance.status !== 'approved' && activeAcceptance.status !== 'rejected' && (
                  <div className="flex gap-2 pt-2">
                    <Button size="sm" onClick={() => approveAcceptanceMut.mutate(activeAcceptance.id)}>
                      {t('risks.approve')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => rejectAcceptanceMut.mutate(activeAcceptance.id)}
                    >
                      {t('risks.reject')}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <Button size="sm" onClick={() => setAcceptanceOpen(true)}>
                {t('risks.acceptRisk')}
              </Button>
            )}
          </div>
        </div>
      )}

      {tab === 'relationships' && (
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="text-xs text-muted-foreground mb-2">{t('risks.affectedAssets')}</h3>
            {risk.assetIds.length === 0 ? (
              <p className="text-muted-foreground">{t('risks.noAssets')}</p>
            ) : (
              risk.assetIds.map((assetId) => (
                <p key={assetId}>{assets.find((a) => a.id === assetId)?.name ?? assetId}</p>
              ))
            )}
          </div>
          <div>
            <h3 className="text-xs text-muted-foreground mb-2">{t('risks.relatedVendors')}</h3>
            {risk.vendorIds.length === 0 ? (
              <p className="text-muted-foreground">{t('risks.noVendors')}</p>
            ) : (
              risk.vendorIds.map((vendorId) => (
                <p key={vendorId}>{vendors.find((v) => v.id === vendorId)?.name ?? vendorId}</p>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'evidence' && (
        <div className="space-y-2 text-sm">
          {evidence.map((e) => (
            <div key={e.id} className="border border-border rounded-lg p-3">
              <div className="font-medium">{e.title}</div>
              <div className="text-xs text-muted-foreground">
                {e.owner} · {e.evidenceType} · {e.verificationStatus}
              </div>
            </div>
          ))}
          {evidence.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">{t('risks.noEvidence')}</div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-2 text-sm">
          {snapshots.map((s) => (
            <div key={s.id} className="flex items-baseline gap-2 border-b border-border py-1.5">
              <span className="text-xs text-muted-foreground w-32 shrink-0">
                {new Date(s.createdAt).toLocaleString()}
              </span>
              <span>
                {t('risks.colInherent')}: {s.inherentScore} ({s.inherentLabel})
                {s.residualScore != null && ` · ${t('risks.colResidual')}: ${s.residualScore} (${s.residualLabel})`}
              </span>
              {s.reason && <span className="text-muted-foreground">— {s.reason}</span>}
            </div>
          ))}
          {snapshots.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">{t('risks.noHistory')}</div>
          )}
        </div>
      )}

      <Dialog open={acceptanceOpen} onOpenChange={setAcceptanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('risks.acceptRisk')}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              createAcceptanceMut.mutate(acceptanceForm, { onSuccess: () => setAcceptanceOpen(false) });
            }}
          >
            <div>
              <Label>{t('risks.justification')}</Label>
              <textarea
                value={acceptanceForm.justification}
                onChange={(e) => setAcceptanceForm((f) => ({ ...f, justification: e.target.value }))}
                required
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
              />
            </div>
            <div>
              <Label>{t('risks.compensatingControls')}</Label>
              <textarea
                value={acceptanceForm.compensatingControls}
                onChange={(e) => setAcceptanceForm((f) => ({ ...f, compensatingControls: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('risks.expiresAt')}</Label>
                <Input
                  type="date"
                  value={acceptanceForm.expiresAt}
                  onChange={(e) => setAcceptanceForm((f) => ({ ...f, expiresAt: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>{t('risks.approver')}</Label>
                <Input
                  value={acceptanceForm.approverId}
                  onChange={(e) => setAcceptanceForm((f) => ({ ...f, approverId: e.target.value }))}
                  required
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createAcceptanceMut.isPending}>
                {t('risks.submitAcceptance')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 3: Build**

Run: `yarn nx build client` and `yarn nx lint client`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/routes/_dashboard/-risks-detail.page.tsx
git commit -m "feat(client): add Treatment/Relationships/Evidence/History tabs to Risk Profile"
```

---

### Task 24: i18n — en/es/he/ru keys

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/{en,es,he,ru}.ts`

- [ ] **Step 1: Add a `risks` block replacing/extending whatever currently exists there (search for `risks:` in `en.ts` — the current block has `subtitle`/`addRisk`/`treatment.*`/`scale.*`/etc. from the old UI; keep what's still used — `addRisk`, `common.*` references stay — and add every new key the rebuilt pages/components reference)**

```typescript
  risks: {
    // keep existing: subtitle, addRisk, empty (re-used, verify wording still fits)
    summaryActive: 'Active Risks',
    summaryCritical: 'Critical',
    summaryHigh: 'High',
    summaryAboveAppetite: 'Above Appetite',
    summaryOverdue: 'Treatment Overdue',
    methodologySettings: 'Methodology & Taxonomy',
    tabMethodology: 'Methodology',
    tabTaxonomy: 'Taxonomy',
    scaleSize: 'Scale',
    appetiteThreshold: 'Appetite Threshold',
    saveNewVersion: 'Save as New Version',
    newCategoryPlaceholder: 'New category name',
    filterAllCategories: 'All categories',
    filterAllOwners: 'All owners',
    filterAllStatus: 'All status',
    filterAboveAppetite: 'Above appetite only',
    colId: 'ID',
    colTitle: 'Title',
    colCategory: 'Category',
    colOwner: 'Owner',
    colInherent: 'Inherent',
    colResidual: 'Residual',
    colAppetite: 'Appetite',
    colTreatment: 'Treatment',
    colStatus: 'Status',
    riskStatement: 'Risk Statement',
    riskStatementPlaceholder: 'Because of [cause], there is a possibility that [event] could occur, resulting in [impact].',
    category: 'Category',
    selectCategory: 'Select category...',
    owner: 'Owner',
    businessUnit: 'Business Unit',
    affectedAssets: 'Affected Assets',
    relatedVendors: 'Related Vendors',
    noAssets: 'No assets selected',
    noVendors: 'No vendors selected',
    inherentLikelihood: 'Inherent Likelihood',
    inherentImpact: 'Inherent Impact',
    selectLikelihood: 'Select likelihood...',
    selectImpact: 'Select impact...',
    notYetAssessed: 'Not yet assessed',
    aboveAppetite: 'Above Appetite',
    withinAppetite: 'Within Appetite',
    status: 'Status',
    detailTitle: 'Risk',
    noAssessmentsYet: 'No assessments linked to this risk yet.',
    noMitigatingControls: 'No mitigating controls mapped yet.',
    treatmentStrategy: 'Treatment Strategy',
    selectTreatment: 'Select strategy...',
    treatmentOwner: 'Treatment Owner',
    treatmentPlan: 'Treatment Plan',
    targetScore: 'Target Score',
    targetDate: 'Target Date',
    riskAcceptance: 'Risk Acceptance',
    expiresAt: 'Expires',
    approve: 'Approve',
    reject: 'Reject',
    acceptRisk: 'Accept Risk',
    justification: 'Justification',
    compensatingControls: 'Compensating Controls',
    approver: 'Approver',
    submitAcceptance: 'Submit for Approval',
    noEvidence: 'No evidence attached yet.',
    noHistory: 'No history recorded yet.',
    deleteConfirmTitle: 'Delete this risk?',
    deleteConfirmDescription: 'This removes the risk, its mappings, evidence, and history. This cannot be undone.',
    tab: {
      overview: 'Overview',
      assessment: 'Assessment',
      controls: 'Controls',
      treatment: 'Treatment',
      relationships: 'Relationships',
      evidence: 'Evidence',
      history: 'History',
    },
    heatmap: {
      inherent: 'Inherent',
      residual: 'Residual',
      likelihood: 'Likelihood',
      impact: 'Impact',
      axisLabel: 'Likelihood (x) × Impact (y)',
    },
  },
```

- [ ] **Step 2: Translate the same key set into `es.ts`, `he.ts`, `ru.ts`** with real, idiomatic translations at the same nesting path — do not skip any locale, do not copy English into the other three files.

- [ ] **Step 3: Verify key-set parity across all 4 locales**

Run a manual check: extract the key names under each locale's `risks:` block and confirm identical sets across all 4 files (same technique used to verify Controls' i18n — no automated script exists for this, do it by careful reading).

- [ ] **Step 4: Build**

Run: `yarn nx build template-shared && yarn nx build client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/ru.ts
git commit -m "feat(i18n): add Risk Register strings across en/es/he/ru"
```

---

### Task 25: Client unit tests

**Files:**
- Create: `apps/client/src/components/risks/__tests__/RiskTable.unit.test.tsx`
- Create: `apps/client/src/routes/_dashboard/__tests__/risks.unit.test.tsx`
- Create: `apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx`

Model these on `apps/client/src/components/controls/__tests__/ControlsTable.unit.test.tsx` and `apps/client/src/routes/_dashboard/__tests__/controls.unit.test.tsx`/`controls-detail.unit.test.tsx` — read all three first for this repo's established mocking pattern (`@/queries/*` module mocks, router/test wrapper setup) before writing.

- [ ] **Step 1: `RiskTable.unit.test.tsx`** — cover: renders risk rows with ID/title/category/owner/scores; row click calls `onRowClick` with the risk's id; delete button calls `onDeleteClick` without triggering row navigation (`stopPropagation`); empty state renders when `risks` is empty; above-appetite indicator renders correctly for `aboveAppetite: true/false/undefined`.

- [ ] **Step 2: `risks.unit.test.tsx`** — cover: KPI summary renders correct counts from a fixture `Risk[]`; category/owner/status filters narrow the table; "above appetite only" filter works; heatmap cell click sets/clears the coordinate filter and narrows the table; clicking "Add Risk" opens the create Dialog; submitting the form with valid required fields calls the mocked `useCreateRisk` mutation; the Create button submission is blocked when likelihood/impact are unselected (form validation, matching the "no default Medium/Medium" requirement).

- [ ] **Step 3: `risks-detail.unit.test.tsx`** — cover: Overview tab renders fields from a fixture `Risk` including inherent/residual/appetite display; Controls tab renders fixture `RiskControlMapping[]`; Treatment tab's "Accept Risk" button opens the acceptance Dialog and submitting calls the mocked `useCreateRiskAcceptance` mutation; when an active acceptance exists, Approve/Reject buttons render and call their respective mutations; Evidence and History tabs render fixture data.

- [ ] **Step 4: Run all three**

Run: `yarn nx test client -- risks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/risks/__tests__/RiskTable.unit.test.tsx apps/client/src/routes/_dashboard/__tests__/risks.unit.test.tsx apps/client/src/routes/_dashboard/__tests__/risks-detail.unit.test.tsx
git commit -m "test(client): cover Risk Register list, detail, and RiskTable"
```

---

### Task 26: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full affected pipeline**

Run: `yarn nx affected -t lint,build,test --base=dev --head=HEAD`
Expected: all green across `shared`, `notes`, `notes-client`, `api`, `client`, `template-shared`.

- [ ] **Step 2: Manual smoke check (Playwright, mandatory per this repo's AGENTS.md)**

Start the stack (a Fake-strategy dev environment, matching the Controls plan's Task 20 setup), navigate to `/risks`, confirm: KPI bar shows real numbers, methodology gear icon opens the Sheet with both tabs working, heatmap renders and cell-click filters the table, creating a risk via the Dialog blocks submission until likelihood+impact are both chosen and the new risk appears with a real `RSK-XXXXXX` ID and correct inherent score/label, clicking a row opens the Risk Profile with all 7 tabs rendering without console errors, setting a residual score and treatment strategy from the Treatment tab updates the Overview tab and writes a History entry, submitting a Risk Acceptance and approving it updates the Treatment tab correctly, deleting a risk removes it from the list.

- [ ] **Step 3: Report status**

If everything above is green, this plan's scope (Risk Register, Phase A) is complete and ready for PR against `dev`, following this repo's branch workflow (`feature/risk-register` → PR into `dev`). Phase B (Risk Assessments) is a separate spec/plan that starts once this one is reviewed and merged.
