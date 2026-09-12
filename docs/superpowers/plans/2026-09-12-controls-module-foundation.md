# Controls Module Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Controls page's dependency on AI-generated `DocumentStandard` records with a real, persisted `InternalControl` entity — carrying Domain/Criticality/Type/Execution/Frequency/Nature/Key-Control fields, many-to-many Framework Requirement mapping, Evidence, Assessments (design + operating effectiveness), and Findings that bridge into Issues/Exceptions/Risk — per `docs/requirements/Controls.docx`.

**Architecture:** The Frameworks module already defined the right shapes for this (`InternalControl`, `RequirementEvidence`, `RequirementAssessment`, `FrameworkActivity` in `libs/shared/src/strategies/notes.ts`) but **none of them are persisted in production** — `SupabaseNotesStrategy` stubs every one of these methods to return `[]` / an unsaved object (verified at `apps/microservices/notes/src/app/supabase-notes.strategy.ts:261-312`). This plan: (1) extends those existing types with the fields Controls.docx demands instead of inventing parallel ones, (2) adds a new `Finding` entity (today a Finding is never persisted — `createAssessmentFinding` only fabricates an id and creates an `Issue`), (3) gives all of it real Supabase tables, and (4) rewires the Controls list/detail UI onto this real entity instead of `doc.standards`. A new table is named `internal_controls` (not `controls`) because `public.controls` already exists as the seeded per-framework control catalog (`FrameworkControl`, see `supabase/migrations/20260606000001_notes_schema.sql:13`) — reusing that name would collide.

Framework↔InternalControl mapping moves from an embedded array to a real join table (`internal_control_framework_mappings`) so the UI can filter/count by framework and mapping strength, per the doc's "Frameworks: NIST ISO SOC2 +2, click to see mappings" requirement. `InternalControl.frameworkMappings` stays on the TS type as a convenience read (populated by a join in `toInternalControl`), so existing call sites (`RequirementDrawer`'s "Mapped Controls" tab) keep working unchanged.

**Tech Stack:** NestJS TCP microservices, Supabase (PostgreSQL), TanStack Router, TanStack Query, shadcn/ui, react-i18next (en/he/ru/es), Vitest — same stack as every other module in this repo, no new dependencies.

## Global Constraints

- Every microservice must survive a missing `.env` in dev (Fake fallback) and hard-fail in `NODE_ENV=production` — handled already by `buildStrategyWithFallback` in the notes MS factory (`apps/microservices/notes/src/app/app.module.ts`); this plan adds no new env vars, so no changes needed there.
- Post-coding routine before any commit: `npx prettier --write <files>` → `yarn nx lint notes,notes-client,shared,client,api` → `yarn nx build notes,notes-client,shared,client,api` — all green.
- Client overlay pattern is non-negotiable: Create = `Dialog`, Edit = `Sheet`, Delete = `AlertDialog`, with three independent state vars (`createOpen`, `editingId`, `confirmDeleteId`) — never one combined `modalMode`.
- Never hand-write `project.json`/tsconfig — not touched by this plan (no new projects).
- All 4 locales (en/es/he/ru) must be updated together for every new UI string — the last audit found `ru.ts` already lagging; don't make that worse.

---

## File Map

**New files:**
- `supabase/migrations/20260912000001_internal_controls.sql`
- `apps/client/src/queries/controls.ts`
- `apps/client/src/routes/_dashboard/controls_.$id.tsx`
- `apps/client/src/routes/_dashboard/__tests__/controls.unit.test.tsx`
- `apps/client/src/routes/_dashboard/__tests__/controls-detail.unit.test.tsx`

**Modified files:**
- `libs/shared/src/strategies/notes.ts` — extend `InternalControl`/`RequirementEvidence`/`RequirementAssessment`/`FrameworkActivity`, add `Finding`, extend `NotesStrategy`
- `libs/shared/src/strategies/fakes/fake-notes.ts` — in-memory implementations
- `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` — contract tests
- `apps/microservices/notes/src/app/supabase-notes.strategy.ts` — real DB implementations
- `apps/microservices/notes/src/app/notes.controller.ts` — `@MessagePattern` handlers
- `libs/notes-client/src/lib/notes-client.service.ts` — TCP proxy methods
- `apps/api/src/app/notes/notes.controller.ts` — REST endpoints
- `apps/client/src/routes/_dashboard/controls.tsx` — rebuild list page on `InternalControl`
- `apps/client/src/components/controls/ControlsTable.tsx` — rebuild columns per doc (ID/Control/Domain/Owner/Status/Effectiveness/Frameworks/Evidence/Findings)
- `apps/client/src/components/controls/__tests__/ControlsTable.unit.test.tsx`
- `libs/template-shared/src/lib/i18n/locales/en.ts`
- `libs/template-shared/src/lib/i18n/locales/es.ts`
- `libs/template-shared/src/lib/i18n/locales/he.ts`
- `libs/template-shared/src/lib/i18n/locales/ru.ts`

---

### Task 1: Fix the untranslated `controls.controlsMapped` key (quick, independent win)

Controls.docx flags this explicitly: the page shows the literal string `controls.controlsMapped` instead of translated text. The route references a key that doesn't exist — `en.ts` has `standardsMapped`, not `controlsMapped`.

**Files:**
- Modify: `apps/client/src/routes/_dashboard/controls.tsx:141`

- [ ] **Step 1: Fix the key**

In `apps/client/src/routes/_dashboard/controls.tsx`, change:
```tsx
{t('controls.controlsMapped')}
```
to:
```tsx
{t('controls.standardsMapped')}
```

- [ ] **Step 2: Verify no other stale references**

Run: `grep -rn "controls.controlsMapped" apps/client/src`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/routes/_dashboard/controls.tsx
git commit -m "fix(client): correct untranslated controls.controlsMapped i18n key"
```

---

### Task 2: Shared types — extend `InternalControl`/`RequirementEvidence`/`RequirementAssessment`/`FrameworkActivity`, add `Finding`

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

**Interfaces:**
- Produces: `InternalControl` (extended), `InternalControlInput`, `InternalControlPatch`, `ControlCriticality`, `ControlType`, `ControlExecution`, `ControlFrequency`, `ControlNature`, `FrameworkMappingType`, `MappingValidation`, `Finding`, `FindingStatus`, `FindingInput` — consumed by every later task in this plan.

- [ ] **Step 1: Replace the existing `InternalControl` block (currently `notes.ts:136-153`) with the extended shape**

```typescript
export type ControlCriticality = 'critical' | 'high' | 'medium' | 'low';
export type ControlType = 'preventive' | 'detective' | 'corrective';
export type ControlExecution = 'manual' | 'automated' | 'hybrid';
export type ControlFrequency =
  | 'continuous' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'event_driven';
export type ControlNature = 'technical' | 'administrative' | 'physical';
export type FrameworkMappingType = 'direct' | 'partial' | 'supporting';
export type MappingValidation = 'ai_suggested' | 'human_validated';

export interface InternalControl {
  id: string;
  orgId?: string;
  code: string;
  title: string;
  description: string;
  domain?: string;
  owner: string;
  operator?: string;
  criticality?: ControlCriticality;
  controlType?: ControlType;
  execution?: ControlExecution;
  frequency?: ControlFrequency;
  nature?: ControlNature;
  keyControl?: boolean;
  parentControlId?: string | null;
  category: string;
  implementationStatus?: ImplementationStatus;
  implementationDescription?: string;
  designEffectiveness?: EffectivenessStatus;
  operatingEffectiveness?: EffectivenessStatus;
  frameworkMappings?: Array<{
    id?: string;
    frameworkId: string;
    frameworkName: string;
    requirementCode: string;
    requirementTitle?: string;
    mappingType?: FrameworkMappingType;
    validation?: MappingValidation;
  }>;
  coverageBenefit?: string;
  frameworkCount?: number;
  requirementCount?: number;
  evidenceCount?: number;
  findingsCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface InternalControlInput {
  code: string;
  title: string;
  description: string;
  domain: string;
  owner: string;
  operator?: string;
  criticality: ControlCriticality;
  controlType: ControlType;
  execution: ControlExecution;
  frequency: ControlFrequency;
  nature: ControlNature;
  keyControl?: boolean;
  parentControlId?: string | null;
  category: string;
  implementationStatus?: ImplementationStatus;
  implementationDescription?: string;
}

export interface InternalControlPatch {
  title?: string;
  description?: string;
  domain?: string;
  owner?: string;
  operator?: string;
  criticality?: ControlCriticality;
  controlType?: ControlType;
  execution?: ControlExecution;
  frequency?: ControlFrequency;
  nature?: ControlNature;
  keyControl?: boolean;
  parentControlId?: string | null;
  implementationStatus?: ImplementationStatus;
  implementationDescription?: string;
  designEffectiveness?: EffectivenessStatus;
  operatingEffectiveness?: EffectivenessStatus;
}

export interface ControlFrameworkMappingInput {
  frameworkId: string;
  frameworkName: string;
  requirementCode: string;
  requirementTitle?: string;
  mappingType: FrameworkMappingType;
  validation: MappingValidation;
}
```

Note the asymmetry: `domain`/`criticality`/`controlType`/`execution`/`frequency`/`nature`/`keyControl`/`implementationStatus`/`designEffectiveness`/`operatingEffectiveness`/`frameworkMappings`/`mappingType`/`validation` are all optional on the readback `InternalControl` type, but required (where shown above) on `InternalControlInput`/`ControlFrameworkMappingInput` (the creation payloads). `fake-notes.ts` already seeds several `InternalControl` records (e.g. `ctrl-dpa-001`) that predate this task and only set the original, pre-plan field set (`id`/`code`/`title`/`description`/`owner`/`category`/`frameworkMappings` without the new sub-fields) — making the new fields required on the readback type breaks `yarn nx build shared` on code this task is not scoped to touch. Every control or mapping created going forward via `createInternalControl`/`addControlFrameworkMapping` (Tasks 4/7) still gets real values for all of these — the optionality only tolerates pre-existing legacy seed data, it does not weaken what new writes provide.

- [ ] **Step 2: Widen `RequirementEvidence` (currently `notes.ts:155-171`) so evidence can be owned by a control instead of a requirement**

Change the interface to make `frameworkId`/`requirementId` optional and add `controlId`:
```typescript
export interface RequirementEvidence {
  id: string;
  orgId?: string;
  controlId?: string;
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

- [ ] **Step 3: Widen `RequirementAssessment` (currently `notes.ts:173-189`) the same way**

```typescript
export interface RequirementAssessment {
  id: string;
  orgId?: string;
  controlId?: string;
  frameworkId?: string;
  requirementId?: string;
  cycleName: string;
  status: 'completed' | 'in_progress' | 'scheduled';
  implementationStatus: ImplementationStatus;
  designEffectiveness: EffectivenessStatus;
  operatingEffectiveness: EffectivenessStatus;
  assessor: string;
  assessmentDate: string;
  observation: string;
  findingId?: string;
  findingTitle?: string;
  findingSeverity?: 'critical' | 'high' | 'medium' | 'low';
}
```

- [ ] **Step 4: Widen `FrameworkActivity` (currently `notes.ts:191-198`) so it doubles as a control's history tab**

```typescript
export interface FrameworkActivity {
  id: string;
  frameworkId?: string;
  controlId?: string;
  action: string;
  details: string;
  actor: string;
  timestamp: string;
}
```

- [ ] **Step 5: Add the `Finding` entity after the `RequirementAssessment` block**

Today `createAssessmentFinding` only fabricates a `findingId` string and creates an `Issue` — nothing is persisted as a Finding. Add:
```typescript
// ─── Findings ──────────────────────────────────────────────────────────────

export type FindingStatus = 'open' | 'remediated' | 'accepted';

export interface Finding {
  id: string;
  orgId?: string;
  code: string;
  controlId: string;
  assessmentId: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  status: FindingStatus;
  linkedIssueId?: string;
  linkedExceptionId?: string;
  linkedRiskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FindingInput {
  controlId: string;
  assessmentId: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}
```

- [ ] **Step 6: Extend the `NotesStrategy` interface**

In the `NotesStrategy` interface, replace the two existing lines:
```typescript
  listInternalControls(orgId?: string, frameworkId?: string): Promise<InternalControl[]>;
  createInternalControl(orgId: string, data: Omit<InternalControl, 'id'>): Promise<InternalControl>;
```
with:
```typescript
  listInternalControls(orgId?: string, frameworkId?: string): Promise<InternalControl[]>;
  getInternalControl(id: string, orgId?: string): Promise<InternalControl | null>;
  createInternalControl(orgId: string, data: InternalControlInput): Promise<InternalControl>;
  updateInternalControl(id: string, patch: InternalControlPatch): Promise<InternalControl>;
  deleteInternalControl(id: string): Promise<void>;
  addControlFrameworkMapping(
    controlId: string,
    data: ControlFrameworkMappingInput,
  ): Promise<InternalControl>;
  removeControlFrameworkMapping(controlId: string, mappingId: string): Promise<InternalControl>;

  listControlEvidence(controlId: string): Promise<RequirementEvidence[]>;
  createControlEvidence(
    orgId: string,
    controlId: string,
    data: Omit<RequirementEvidence, 'id' | 'controlId'>,
  ): Promise<RequirementEvidence>;

  listControlAssessments(controlId: string): Promise<RequirementAssessment[]>;
  createControlAssessment(
    orgId: string,
    controlId: string,
    data: Omit<RequirementAssessment, 'id' | 'controlId'>,
  ): Promise<RequirementAssessment>;

  listControlFindings(controlId: string): Promise<Finding[]>;
  linkFindingToRisk(findingId: string, riskId: string): Promise<Finding>;
  linkFindingToIssue(findingId: string, issueId: string): Promise<Finding>;
  resolveFindingViaException(findingId: string, exceptionId: string): Promise<Finding>;

  listControlActivity(controlId: string): Promise<FrameworkActivity[]>;
```

Leave every other line in `NotesStrategy` untouched.

- [ ] **Step 7: Build to confirm type-only change compiles (implementations come in later tasks, this will show errors in the two strategies — expected for now)**

Run: `yarn nx build shared`
Expected: PASS (this project only holds the types; the interface break in `fake-notes.ts`/`supabase-notes.strategy.ts` surfaces when *those* projects build, which is fine at this point in the plan).

- [ ] **Step 8: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): extend InternalControl/Evidence/Assessment types and add Finding entity"
```

---

### Task 3: Supabase migration — `internal_controls` and related tables

**Files:**
- Create: `supabase/migrations/20260912000001_internal_controls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Internal Controls: org-owned, testable control instances.
-- Named `internal_controls` (not `controls`) because public.controls already
-- holds the seeded per-framework control catalog (FrameworkControl).
create table public.internal_controls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  code text not null,
  title text not null,
  description text not null default '',
  domain text not null default '',
  owner text not null default '',
  operator text not null default '',
  criticality text not null default 'medium'
    check (criticality in ('critical','high','medium','low')),
  control_type text not null default 'preventive'
    check (control_type in ('preventive','detective','corrective')),
  execution text not null default 'manual'
    check (execution in ('manual','automated','hybrid')),
  frequency text not null default 'quarterly'
    check (frequency in ('continuous','daily','weekly','monthly','quarterly','annual','event_driven')),
  nature text not null default 'technical'
    check (nature in ('technical','administrative','physical')),
  key_control boolean not null default false,
  parent_control_id uuid references public.internal_controls(id) on delete set null,
  category text not null default '',
  implementation_status text not null default 'not_implemented'
    check (implementation_status in
      ('not_implemented','planned','partially_implemented','implemented','not_applicable')),
  implementation_description text not null default '',
  design_effectiveness text not null default 'not_tested'
    check (design_effectiveness in ('effective','partially_effective','ineffective','not_tested')),
  operating_effectiveness text not null default 'not_tested'
    check (operating_effectiveness in ('effective','partially_effective','ineffective','not_tested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index internal_controls_org_id_idx on public.internal_controls(org_id);
create index internal_controls_parent_idx on public.internal_controls(parent_control_id);

alter table public.internal_controls enable row level security;

create policy "org members read internal_controls"
  on public.internal_controls for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own internal_controls"
  on public.internal_controls for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Many-to-many: one internal control maps to many framework requirements.
create table public.internal_control_framework_mappings (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references public.internal_controls(id) on delete cascade,
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  requirement_code text not null,
  requirement_title text,
  mapping_type text not null default 'direct'
    check (mapping_type in ('direct','partial','supporting')),
  validation text not null default 'ai_suggested'
    check (validation in ('ai_suggested','human_validated')),
  created_at timestamptz not null default now(),
  unique (control_id, framework_id, requirement_code)
);

create index icfm_control_idx on public.internal_control_framework_mappings(control_id);
create index icfm_framework_idx on public.internal_control_framework_mappings(framework_id);

alter table public.internal_control_framework_mappings enable row level security;

create policy "org members read control mappings"
  on public.internal_control_framework_mappings for select using (
    exists (
      select 1 from public.internal_controls c
      join public.org_profiles o on o.id = c.org_id
      where c.id = control_id and o.user_id = auth.uid()
    )
  );

create policy "users manage own control mappings"
  on public.internal_control_framework_mappings for all using (
    exists (
      select 1 from public.internal_controls c
      join public.org_profiles o on o.id = c.org_id
      where c.id = control_id and o.user_id = auth.uid()
    )
  );

-- Evidence: owned by a control, a framework requirement, or both.
create table public.requirement_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  control_id uuid references public.internal_controls(id) on delete cascade,
  framework_id uuid references public.frameworks(id) on delete set null,
  requirement_id text,
  title text not null,
  owner text not null default '',
  evidence_type text not null default '',
  source text not null default '',
  collection_date timestamptz not null default now(),
  period_covered text not null default '',
  expiration_date timestamptz,
  verification_status text not null default 'pending_review'
    check (verification_status in ('verified','pending_review','rejected','expired')),
  url text,
  created_at timestamptz not null default now(),
  check (control_id is not null or framework_id is not null)
);

create index requirement_evidence_org_idx on public.requirement_evidence(org_id);
create index requirement_evidence_control_idx on public.requirement_evidence(control_id);
create index requirement_evidence_framework_idx on public.requirement_evidence(framework_id);

alter table public.requirement_evidence enable row level security;

create policy "org members read evidence"
  on public.requirement_evidence for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own evidence"
  on public.requirement_evidence for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and (control_id is null or exists (
      select 1 from public.internal_controls c
      where c.id = control_id and c.org_id = requirement_evidence.org_id
    ))
  );

-- Assessments: control-centric or requirement-centric testing cycles.
create table public.requirement_assessments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  control_id uuid references public.internal_controls(id) on delete cascade,
  framework_id uuid references public.frameworks(id) on delete set null,
  requirement_id text,
  cycle_name text not null default '',
  status text not null default 'scheduled'
    check (status in ('completed','in_progress','scheduled')),
  implementation_status text not null default 'not_implemented'
    check (implementation_status in
      ('not_implemented','planned','partially_implemented','implemented','not_applicable')),
  design_effectiveness text not null default 'not_tested'
    check (design_effectiveness in ('effective','partially_effective','ineffective','not_tested')),
  operating_effectiveness text not null default 'not_tested'
    check (operating_effectiveness in ('effective','partially_effective','ineffective','not_tested')),
  assessor text not null default '',
  assessment_date timestamptz not null default now(),
  observation text not null default '',
  finding_id uuid,
  created_at timestamptz not null default now(),
  check (control_id is not null or framework_id is not null)
);

create index requirement_assessments_org_idx on public.requirement_assessments(org_id);
create index requirement_assessments_control_idx on public.requirement_assessments(control_id);
create index requirement_assessments_framework_idx on public.requirement_assessments(framework_id);

alter table public.requirement_assessments enable row level security;

create policy "org members read assessments"
  on public.requirement_assessments for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own assessments"
  on public.requirement_assessments for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and (control_id is null or exists (
      select 1 from public.internal_controls c
      where c.id = control_id and c.org_id = requirement_assessments.org_id
    ))
  );

-- Findings: created by an assessment, may bridge into Issue/Exception/Risk.
create table public.findings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  code text not null,
  control_id uuid not null references public.internal_controls(id) on delete cascade,
  assessment_id uuid not null references public.requirement_assessments(id) on delete cascade,
  title text not null,
  description text not null default '',
  severity text not null default 'medium'
    check (severity in ('critical','high','medium','low')),
  status text not null default 'open'
    check (status in ('open','remediated','accepted')),
  linked_issue_id uuid references public.issues(id) on delete set null,
  linked_exception_id uuid references public.exceptions(id) on delete set null,
  linked_risk_id uuid references public.risks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index findings_org_idx on public.findings(org_id);
create index findings_control_idx on public.findings(control_id);

alter table public.findings enable row level security;

create policy "org members read findings"
  on public.findings for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own findings"
  on public.findings for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and exists (
      select 1 from public.internal_controls c where c.id = control_id and c.org_id = findings.org_id
    )
    and exists (
      select 1 from public.requirement_assessments a
      where a.id = assessment_id and a.org_id = findings.org_id
    )
  );

-- Activity log: reused for both framework-level and control-level history tabs.
create table public.framework_activities (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid references public.frameworks(id) on delete cascade,
  control_id uuid references public.internal_controls(id) on delete cascade,
  action text not null,
  details text not null default '',
  actor text not null default '',
  timestamp timestamptz not null default now(),
  check (framework_id is not null or control_id is not null)
);

create index framework_activities_framework_idx on public.framework_activities(framework_id);
create index framework_activities_control_idx on public.framework_activities(control_id);

alter table public.framework_activities enable row level security;

create policy "read own control activity or global framework activity"
  on public.framework_activities for select using (
    control_id is null
    or exists (
      select 1 from public.internal_controls c
      join public.org_profiles o on o.id = c.org_id
      where c.id = control_id and o.user_id = auth.uid()
    )
  );

create policy "users insert own control activity or global framework activity"
  on public.framework_activities for insert
  with check (
    (control_id is null and framework_id is not null and auth.role() = 'authenticated')
    or (control_id is not null and exists (
      select 1 from public.internal_controls c
      join public.org_profiles o on o.id = c.org_id
      where c.id = control_id and o.user_id = auth.uid()
    ))
  );
```

Every `select`/write policy above is org-scoped through `org_profiles.user_id = auth.uid()` (directly via `org_id`, or via a join through `internal_controls`/`requirement_assessments` for tables that reference a control or assessment instead of carrying `org_id` themselves) — this replaces an earlier draft that copied the `using (true)` permissive-read pattern from the genuinely-global `frameworks`/`controls` seed-catalog tables onto these org-owned tables, which would have let any authenticated user read every org's controls, evidence, assessments, and findings. The one deliberate exception: `framework_activities` rows with `control_id is null` (framework-level activity log entries, not control-level) stay readable/insertable by any authenticated user, because `framework_activities` has no `org_id` column and frameworks themselves are shared platform catalog data — matching the existing `frameworks`/`controls` tables' own `using (auth.role() = 'authenticated')` policy. `findings`' write policy additionally verifies `control_id` and `assessment_id` both belong to the same `org_id` as the finding row, so a caller can't forge a finding in their own org that points at another org's control or assessment; `requirement_evidence`/`requirement_assessments` get the same `control_id`-ownership check where a `control_id` is present.

- [ ] **Step 2: Apply locally and verify**

Run: `yarn supabase migration up` (or the project's usual local-DB apply command — check `package.json` scripts for the exact one if this differs)
Expected: migration applies with no errors; `internal_controls`, `internal_control_framework_mappings`, `requirement_evidence`, `requirement_assessments`, `findings`, `framework_activities` all exist.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260912000001_internal_controls.sql
git commit -m "feat(db): add internal_controls, evidence, assessments and findings tables"
```

---

### Task 4: `FakeNotesStrategy` — Internal Control CRUD

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

**Interfaces:**
- Consumes: `InternalControl`, `InternalControlInput`, `InternalControlPatch`, `ControlFrameworkMappingInput` from Task 2.
- Produces: `getInternalControl`, `updateInternalControl`, `deleteInternalControl`, `addControlFrameworkMapping`, `removeControlFrameworkMapping` on `FakeNotesStrategy` — consumed by Task 6 (contract test) and the client hooks in Task 12.

- [ ] **Step 1: Update imports**

In the `import type { ... } from '../notes'` block, replace `InternalControl,` with:
```typescript
  InternalControl,
  InternalControlInput,
  InternalControlPatch,
  ControlFrameworkMappingInput,
  Finding,
  FindingInput,
```
Also add a new private store next to `private internalControls: InternalControl[] = [];`:
```typescript
  private findings: Finding[] = [];
```

- [ ] **Step 2: Replace `createInternalControl` (currently `fake-notes.ts:2574-2585`) and add the four new methods right after `listInternalControls`**

```typescript
  async listInternalControls(_orgId?: string, frameworkId?: string): Promise<InternalControl[]> {
    if (!frameworkId) return [...this.internalControls];
    return this.internalControls.filter((c) =>
      c.frameworkMappings.some((m) => m.frameworkId === frameworkId),
    );
  }

  async getInternalControl(id: string, _orgId?: string): Promise<InternalControl | null> {
    return this.internalControls.find((c) => c.id === id) ?? null;
  }

  async createInternalControl(orgId: string, data: InternalControlInput): Promise<InternalControl> {
    const control: InternalControl = {
      id: `ctrl-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      operator: '',
      keyControl: false,
      parentControlId: null,
      implementationStatus: 'not_implemented',
      implementationDescription: '',
      designEffectiveness: 'not_tested',
      operatingEffectiveness: 'not_tested',
      frameworkMappings: [],
      evidenceCount: 0,
      findingsCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...data,
    };
    this.internalControls.push(control);
    return control;
  }

  async updateInternalControl(id: string, patch: InternalControlPatch): Promise<InternalControl> {
    const control = this.internalControls.find((c) => c.id === id);
    if (!control) throw new Error(`internal_control_not_found: ${id}`);
    Object.assign(control, patch, { updatedAt: new Date().toISOString() });
    return control;
  }

  async deleteInternalControl(id: string): Promise<void> {
    this.internalControls = this.internalControls.filter((c) => c.id !== id);
  }

  async addControlFrameworkMapping(
    controlId: string,
    data: ControlFrameworkMappingInput,
  ): Promise<InternalControl> {
    const control = this.internalControls.find((c) => c.id === controlId);
    if (!control) throw new Error(`internal_control_not_found: ${controlId}`);
    control.frameworkMappings.push({ id: globalThis.crypto.randomUUID(), ...data });
    control.frameworkCount = new Set(control.frameworkMappings.map((m) => m.frameworkId)).size;
    control.requirementCount = control.frameworkMappings.length;
    control.updatedAt = new Date().toISOString();
    return control;
  }

  async removeControlFrameworkMapping(controlId: string, mappingId: string): Promise<InternalControl> {
    const control = this.internalControls.find((c) => c.id === controlId);
    if (!control) throw new Error(`internal_control_not_found: ${controlId}`);
    control.frameworkMappings = control.frameworkMappings.filter((m) => m.id !== mappingId);
    control.frameworkCount = new Set(control.frameworkMappings.map((m) => m.frameworkId)).size;
    control.requirementCount = control.frameworkMappings.length;
    control.updatedAt = new Date().toISOString();
    return control;
  }
```
Delete the old `createInternalControl` body that sat at `fake-notes.ts:2574-2585` — it's fully replaced above.

- [ ] **Step 3: Run the existing fake strategy build to confirm no leftover type errors from this slice**

Run: `yarn nx build shared`
Expected: still shows errors only for the methods not yet added (evidence/assessment/finding/activity — Task 5). If it also errors on something in Step 2, fix before continuing.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): add InternalControl get/update/delete/mapping to FakeNotesStrategy"
```

---

### Task 5: `FakeNotesStrategy` — Control Evidence, Assessments, Findings, Activity

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

**Interfaces:**
- Consumes: `Finding`, `FindingInput` types from Task 2; `this.createIssue`, `this.createException` (existing methods) for the finding-resolution bridge.
- Produces: `listControlEvidence`, `createControlEvidence`, `listControlAssessments`, `createControlAssessment`, `listControlFindings`, `linkFindingToRisk`, `resolveFindingViaException`, `listControlActivity`.

- [ ] **Step 1: Add the methods after `createFrameworkEvidence` (around `fake-notes.ts:2594-2613`)**

```typescript
  async listControlEvidence(controlId: string): Promise<RequirementEvidence[]> {
    return this.evidence.filter((e) => e.controlId === controlId);
  }

  async createControlEvidence(
    orgId: string,
    controlId: string,
    data: Omit<RequirementEvidence, 'id' | 'controlId'>,
  ): Promise<RequirementEvidence> {
    const ev: RequirementEvidence = {
      id: `ev-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      controlId,
      ...data,
    };
    this.evidence.unshift(ev);
    const control = this.internalControls.find((c) => c.id === controlId);
    if (control) control.evidenceCount = (control.evidenceCount ?? 0) + 1;
    this.activities.unshift({
      id: globalThis.crypto.randomUUID(),
      controlId,
      action: 'Evidence Uploaded',
      details: `Evidence item "${data.title}" added by ${data.owner}.`,
      actor: data.owner,
      timestamp: new Date().toISOString(),
    });
    return ev;
  }

  async listControlAssessments(controlId: string): Promise<RequirementAssessment[]> {
    return this.assessmentsList.filter((a) => a.controlId === controlId);
  }

  async createControlAssessment(
    orgId: string,
    controlId: string,
    data: Omit<RequirementAssessment, 'id' | 'controlId'>,
  ): Promise<RequirementAssessment> {
    const assessment: RequirementAssessment = {
      id: `asm-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      controlId,
      ...data,
    };
    this.assessmentsList.unshift(assessment);

    const control = this.internalControls.find((c) => c.id === controlId);
    if (control) {
      control.designEffectiveness = assessment.designEffectiveness;
      control.operatingEffectiveness = assessment.operatingEffectiveness;
      control.updatedAt = new Date().toISOString();
    }

    if (
      assessment.operatingEffectiveness === 'ineffective' ||
      assessment.operatingEffectiveness === 'partially_effective'
    ) {
      const findingNum = Math.floor(1000 + Math.random() * 9000);
      const finding: Finding = {
        id: globalThis.crypto.randomUUID(),
        orgId,
        code: `FIND-${new Date().getFullYear()}-${findingNum}`,
        controlId,
        assessmentId: assessment.id,
        title: `${control?.title ?? 'Control'} — ${assessment.operatingEffectiveness.replace('_', ' ')}`,
        description: assessment.observation,
        severity: assessment.operatingEffectiveness === 'ineffective' ? 'high' : 'medium',
        status: 'open',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.findings.unshift(finding);
      assessment.findingId = finding.id;
      assessment.findingTitle = finding.title;
      assessment.findingSeverity = finding.severity;
      if (control) control.findingsCount = (control.findingsCount ?? 0) + 1;
    }

    this.activities.unshift({
      id: globalThis.crypto.randomUUID(),
      controlId,
      action: 'Assessment Completed',
      details: `Cycle "${assessment.cycleName}" — operating effectiveness: ${assessment.operatingEffectiveness}.`,
      actor: assessment.assessor,
      timestamp: new Date().toISOString(),
    });

    return assessment;
  }

  async listControlFindings(controlId: string): Promise<Finding[]> {
    return this.findings.filter((f) => f.controlId === controlId);
  }

  async linkFindingToRisk(findingId: string, riskId: string): Promise<Finding> {
    const finding = this.findings.find((f) => f.id === findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    finding.linkedRiskId = riskId;
    finding.updatedAt = new Date().toISOString();
    return finding;
  }

  async linkFindingToIssue(findingId: string, issueId: string): Promise<Finding> {
    const finding = this.findings.find((f) => f.id === findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    finding.linkedIssueId = issueId;
    finding.updatedAt = new Date().toISOString();
    return finding;
  }

  async resolveFindingViaException(findingId: string, exceptionId: string): Promise<Finding> {
    const finding = this.findings.find((f) => f.id === findingId);
    if (!finding) throw new Error(`finding_not_found: ${findingId}`);
    finding.linkedExceptionId = exceptionId;
    finding.status = 'accepted';
    finding.updatedAt = new Date().toISOString();
    return finding;
  }

  async listControlActivity(controlId: string): Promise<FrameworkActivity[]> {
    return this.activities.filter((a) => a.controlId === controlId);
  }
```

- [ ] **Step 2: Build**

Run: `yarn nx build shared`
Expected: PASS — `FakeNotesStrategy` now fully implements the extended `NotesStrategy` interface.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): add control evidence/assessment/finding/activity to FakeNotesStrategy"
```

---

### Task 6: Contract tests for the new `FakeNotesStrategy` methods

**Files:**
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the test file:
```typescript
describe('InternalControl lifecycle', () => {
  it('creates, mutates, and maps a control end-to-end', async () => {
    const strategy = new FakeNotesStrategy();
    const control = await strategy.createInternalControl('org-1', {
      code: 'IAM-001',
      title: 'Privileged Access MFA',
      description: 'Privileged accounts must use MFA.',
      domain: 'Identity & Access Management',
      owner: 'Director, Cybersecurity',
      criticality: 'high',
      controlType: 'preventive',
      execution: 'hybrid',
      frequency: 'continuous',
      nature: 'technical',
      category: 'access-control',
    });
    expect(control.id).toBeTruthy();
    expect(control.implementationStatus).toBe('not_implemented');

    const mapped = await strategy.addControlFrameworkMapping(control.id, {
      frameworkId: 'fw-nist',
      frameworkName: 'NIST CSF 2.0',
      requirementCode: 'PR.AA-03',
      mappingType: 'direct',
      validation: 'human_validated',
    });
    expect(mapped.frameworkMappings).toHaveLength(1);
    expect(mapped.frameworkCount).toBe(1);

    const patched = await strategy.updateInternalControl(control.id, {
      implementationStatus: 'implemented',
    });
    expect(patched.implementationStatus).toBe('implemented');

    const fetched = await strategy.getInternalControl(control.id);
    expect(fetched?.id).toBe(control.id);

    await strategy.deleteInternalControl(control.id);
    expect(await strategy.getInternalControl(control.id)).toBeNull();
  });

  it('creates a Finding when an assessment records ineffective operating effectiveness', async () => {
    const strategy = new FakeNotesStrategy();
    const control = await strategy.createInternalControl('org-1', {
      code: 'BCM-003',
      title: 'Backup Restoration Testing',
      description: 'Quarterly restoration test of production backups.',
      domain: 'Resilience',
      owner: 'Infrastructure',
      criticality: 'high',
      controlType: 'corrective',
      execution: 'manual',
      frequency: 'quarterly',
      nature: 'technical',
      category: 'resilience',
    });

    const assessment = await strategy.createControlAssessment('org-1', control.id, {
      cycleName: 'Q3 2026',
      status: 'completed',
      implementationStatus: 'partially_implemented',
      designEffectiveness: 'effective',
      operatingEffectiveness: 'ineffective',
      assessor: 'Jane Auditor',
      assessmentDate: new Date().toISOString(),
      observation: '2 of 5 sampled backups failed restoration.',
    });
    expect(assessment.findingId).toBeTruthy();

    const findings = await strategy.listControlFindings(control.id);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.status).toBe('open');

    const linked = await strategy.linkFindingToRisk(findings[0]!.id, 'risk-42');
    expect(linked.linkedRiskId).toBe('risk-42');

    const linkedIssue = await strategy.linkFindingToIssue(findings[0]!.id, 'issue-7');
    expect(linkedIssue.linkedIssueId).toBe('issue-7');

    const resolved = await strategy.resolveFindingViaException(findings[0]!.id, 'exc-9');
    expect(resolved.status).toBe('accepted');
    expect(resolved.linkedExceptionId).toBe('exc-9');
  });

  it('attaches evidence to a control and increments its evidence count', async () => {
    const strategy = new FakeNotesStrategy();
    const control = await strategy.createInternalControl('org-1', {
      code: 'VM-001',
      title: 'Vulnerability Scanning',
      description: 'Weekly authenticated vulnerability scans.',
      domain: 'Vulnerability Management',
      owner: 'Security Ops',
      criticality: 'medium',
      controlType: 'detective',
      execution: 'automated',
      frequency: 'weekly',
      nature: 'technical',
      category: 'vuln-mgmt',
    });

    await strategy.createControlEvidence('org-1', control.id, {
      title: 'Weekly scan report — 2026-09-08',
      owner: 'Security Ops',
      evidenceType: 'report',
      source: 'Qualys',
      collectionDate: new Date().toISOString(),
      periodCovered: '2026-09-01/2026-09-08',
      expirationDate: new Date().toISOString(),
      verificationStatus: 'verified',
    });

    const evidence = await strategy.listControlEvidence(control.id);
    expect(evidence).toHaveLength(1);

    const updated = await strategy.getInternalControl(control.id);
    expect(updated?.evidenceCount).toBe(1);

    const activity = await strategy.listControlActivity(control.id);
    expect(activity.some((a) => a.action === 'Evidence Uploaded')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail before implementation exists**

This step is retroactive since Tasks 4-5 already implemented the methods — run now to confirm they pass instead:
Run: `yarn nx test shared -- fake-notes.contract`
Expected: PASS, all 3 new tests green.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "test(shared): cover InternalControl lifecycle, findings bridge, evidence"
```

---

### Task 7: `SupabaseNotesStrategy` — Internal Control CRUD

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

**Interfaces:**
- Consumes: `internal_controls`, `internal_control_framework_mappings` tables (Task 3); `InternalControl`, `InternalControlInput`, `InternalControlPatch`, `ControlFrameworkMappingInput` types (Task 2); existing `ok()` helper used by every other method in this file.

- [ ] **Step 1: Replace the stub block at `supabase-notes.strategy.ts:261-270`**

```typescript
  async listInternalControls(orgId?: string, frameworkId?: string): Promise<InternalControl[]> {
    let query = this.db.from('internal_controls').select('*').order('created_at', { ascending: false });
    if (orgId) query = query.eq('org_id', orgId);
    const { data, error } = await query;
    const controls = await Promise.all(ok(data, error).map((row) => this.toInternalControl(row)));
    if (!frameworkId) return controls;
    return controls.filter((c) => c.frameworkMappings?.some((m) => m.frameworkId === frameworkId));
  }

  async getInternalControl(id: string, _orgId?: string): Promise<InternalControl | null> {
    const { data, error } = await this.db
      .from('internal_controls')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? this.toInternalControl(data) : null;
  }

  async createInternalControl(orgId: string, data: InternalControlInput): Promise<InternalControl> {
    const { data: row, error } = await this.db
      .from('internal_controls')
      .insert({
        org_id: orgId,
        code: data.code,
        title: data.title,
        description: data.description,
        domain: data.domain,
        owner: data.owner,
        operator: data.operator ?? '',
        criticality: data.criticality,
        control_type: data.controlType,
        execution: data.execution,
        frequency: data.frequency,
        nature: data.nature,
        key_control: data.keyControl ?? false,
        parent_control_id: data.parentControlId ?? null,
        category: data.category,
        implementation_status: data.implementationStatus ?? 'not_implemented',
        implementation_description: data.implementationDescription ?? '',
      })
      .select()
      .single();
    return this.toInternalControl(ok(row, error));
  }

  async updateInternalControl(id: string, patch: InternalControlPatch): Promise<InternalControl> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.description !== undefined) update['description'] = patch.description;
    if (patch.domain !== undefined) update['domain'] = patch.domain;
    if (patch.owner !== undefined) update['owner'] = patch.owner;
    if (patch.operator !== undefined) update['operator'] = patch.operator;
    if (patch.criticality !== undefined) update['criticality'] = patch.criticality;
    if (patch.controlType !== undefined) update['control_type'] = patch.controlType;
    if (patch.execution !== undefined) update['execution'] = patch.execution;
    if (patch.frequency !== undefined) update['frequency'] = patch.frequency;
    if (patch.nature !== undefined) update['nature'] = patch.nature;
    if (patch.keyControl !== undefined) update['key_control'] = patch.keyControl;
    if ('parentControlId' in patch) update['parent_control_id'] = patch.parentControlId;
    if (patch.implementationStatus !== undefined)
      update['implementation_status'] = patch.implementationStatus;
    if (patch.implementationDescription !== undefined)
      update['implementation_description'] = patch.implementationDescription;
    if (patch.designEffectiveness !== undefined)
      update['design_effectiveness'] = patch.designEffectiveness;
    if (patch.operatingEffectiveness !== undefined)
      update['operating_effectiveness'] = patch.operatingEffectiveness;

    const { data, error } = await this.db
      .from('internal_controls')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toInternalControl(ok(data, error));
  }

  async deleteInternalControl(id: string): Promise<void> {
    const { error } = await this.db.from('internal_controls').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  async addControlFrameworkMapping(
    controlId: string,
    data: ControlFrameworkMappingInput,
  ): Promise<InternalControl> {
    const { error } = await this.db.from('internal_control_framework_mappings').insert({
      control_id: controlId,
      framework_id: data.frameworkId,
      requirement_code: data.requirementCode,
      requirement_title: data.requirementTitle ?? null,
      mapping_type: data.mappingType,
      validation: data.validation,
    });
    if (error) throw new Error(error.message);
    const control = await this.getInternalControl(controlId);
    if (!control) throw new Error(`internal_control_not_found: ${controlId}`);
    return control;
  }

  async removeControlFrameworkMapping(controlId: string, mappingId: string): Promise<InternalControl> {
    const { error } = await this.db
      .from('internal_control_framework_mappings')
      .delete()
      .eq('id', mappingId);
    if (error) throw new Error(error.message);
    const control = await this.getInternalControl(controlId);
    if (!control) throw new Error(`internal_control_not_found: ${controlId}`);
    return control;
  }

  private async toInternalControl(row: Record<string, unknown>): Promise<InternalControl> {
    const { data: mappingRows, error } = await this.db
      .from('internal_control_framework_mappings')
      .select('id, framework_id, requirement_code, requirement_title, mapping_type, validation, frameworks(name)')
      .eq('control_id', row['id'] as string);
    if (error) throw new Error(error.message);
    const frameworkMappings = (mappingRows ?? []).map((m: Record<string, unknown>) => ({
      id: m['id'] as string,
      frameworkId: m['framework_id'] as string,
      frameworkName: ((m['frameworks'] as Record<string, unknown> | null)?.['name'] as string) ?? '',
      requirementCode: m['requirement_code'] as string,
      requirementTitle: m['requirement_title'] as string | undefined,
      mappingType: m['mapping_type'] as FrameworkMappingType,
      validation: m['validation'] as MappingValidation,
    }));

    const { count: evidenceCount } = await this.db
      .from('requirement_evidence')
      .select('id', { count: 'exact', head: true })
      .eq('control_id', row['id'] as string);
    const { count: findingsCount } = await this.db
      .from('findings')
      .select('id', { count: 'exact', head: true })
      .eq('control_id', row['id'] as string);

    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      code: row['code'] as string,
      title: row['title'] as string,
      description: row['description'] as string,
      domain: row['domain'] as string,
      owner: row['owner'] as string,
      operator: row['operator'] as string,
      criticality: row['criticality'] as ControlCriticality,
      controlType: row['control_type'] as ControlType,
      execution: row['execution'] as ControlExecution,
      frequency: row['frequency'] as ControlFrequency,
      nature: row['nature'] as ControlNature,
      keyControl: row['key_control'] as boolean,
      parentControlId: row['parent_control_id'] as string | null,
      category: row['category'] as string,
      implementationStatus: row['implementation_status'] as ImplementationStatus,
      implementationDescription: row['implementation_description'] as string,
      designEffectiveness: row['design_effectiveness'] as EffectivenessStatus,
      operatingEffectiveness: row['operating_effectiveness'] as EffectivenessStatus,
      frameworkMappings,
      frameworkCount: new Set(frameworkMappings.map((m) => m.frameworkId)).size,
      requirementCount: frameworkMappings.length,
      evidenceCount: evidenceCount ?? 0,
      findingsCount: findingsCount ?? 0,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
```

Add the new type imports (`InternalControlInput`, `InternalControlPatch`, `ControlFrameworkMappingInput`, `ControlCriticality`, `ControlType`, `ControlExecution`, `ControlFrequency`, `ControlNature`, `FrameworkMappingType`, `MappingValidation`) to the existing `import type { ... } from '@icore/shared'` block at the top of the file. This matches the direct-await pattern already used by `listRisks` in this same file (`supabase-notes.strategy.ts:1528-1533`) — no query-wrapper helper exists here, so none is introduced.

- [ ] **Step 2: Build**

Run: `yarn nx build notes`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): persist InternalControl CRUD and framework mappings in Supabase"
```

---

### Task 8: `SupabaseNotesStrategy` — Control Evidence, Assessments, Findings, Activity

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

- [ ] **Step 1: Replace the evidence/assessment/activity stubs at `supabase-notes.strategy.ts:272-312`**

```typescript
  async listFrameworkEvidence(frameworkId: string, _orgId?: string): Promise<RequirementEvidence[]> {
    const { data, error } = await this.db
      .from('requirement_evidence')
      .select('*')
      .eq('framework_id', frameworkId);
    return ok(data, error).map((row) => this.toRequirementEvidence(row));
  }

  async createFrameworkEvidence(
    orgId: string,
    data: Omit<RequirementEvidence, 'id'>,
  ): Promise<RequirementEvidence> {
    const { data: row, error } = await this.db
      .from('requirement_evidence')
      .insert(this.evidenceInsertPayload(orgId, data))
      .select()
      .single();
    return this.toRequirementEvidence(ok(row, error));
  }

  async listControlEvidence(controlId: string): Promise<RequirementEvidence[]> {
    const { data, error } = await this.db
      .from('requirement_evidence')
      .select('*')
      .eq('control_id', controlId);
    return ok(data, error).map((row) => this.toRequirementEvidence(row));
  }

  async createControlEvidence(
    orgId: string,
    controlId: string,
    data: Omit<RequirementEvidence, 'id' | 'controlId'>,
  ): Promise<RequirementEvidence> {
    const { data: row, error } = await this.db
      .from('requirement_evidence')
      .insert({ ...this.evidenceInsertPayload(orgId, data), control_id: controlId })
      .select()
      .single();
    const evidence = this.toRequirementEvidence(ok(row, error));
    await this.db.from('framework_activities').insert({
      control_id: controlId,
      action: 'Evidence Uploaded',
      details: `Evidence item "${data.title}" added by ${data.owner}.`,
      actor: data.owner,
    });
    return evidence;
  }

  private evidenceInsertPayload(
    orgId: string,
    data: Omit<RequirementEvidence, 'id'>,
  ): Record<string, unknown> {
    return {
      org_id: orgId,
      framework_id: data.frameworkId ?? null,
      requirement_id: data.requirementId ?? null,
      title: data.title,
      owner: data.owner,
      evidence_type: data.evidenceType,
      source: data.source,
      collection_date: data.collectionDate,
      period_covered: data.periodCovered,
      expiration_date: data.expirationDate,
      verification_status: data.verificationStatus,
      url: data.url ?? null,
    };
  }

  private toRequirementEvidence(row: Record<string, unknown>): RequirementEvidence {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      controlId: row['control_id'] as string | undefined,
      frameworkId: row['framework_id'] as string | undefined,
      requirementId: row['requirement_id'] as string | undefined,
      title: row['title'] as string,
      owner: row['owner'] as string,
      evidenceType: row['evidence_type'] as string,
      source: row['source'] as string,
      collectionDate: row['collection_date'] as string,
      periodCovered: row['period_covered'] as string,
      expirationDate: row['expiration_date'] as string,
      verificationStatus: row['verification_status'] as RequirementEvidence['verificationStatus'],
      url: row['url'] as string | undefined,
    };
  }

  async listFrameworkAssessments(
    frameworkId: string,
    _orgId?: string,
  ): Promise<RequirementAssessment[]> {
    const { data, error } = await this.db
      .from('requirement_assessments')
      .select('*')
      .eq('framework_id', frameworkId);
    return ok(data, error).map((row) => this.toRequirementAssessment(row));
  }

  async listControlAssessments(controlId: string): Promise<RequirementAssessment[]> {
    const { data, error } = await this.db
      .from('requirement_assessments')
      .select('*')
      .eq('control_id', controlId);
    return ok(data, error).map((row) => this.toRequirementAssessment(row));
  }

  async createControlAssessment(
    orgId: string,
    controlId: string,
    data: Omit<RequirementAssessment, 'id' | 'controlId'>,
  ): Promise<RequirementAssessment> {
    const { data: row, error } = await this.db
      .from('requirement_assessments')
      .insert({
        org_id: orgId,
        control_id: controlId,
        cycle_name: data.cycleName,
        status: data.status,
        implementation_status: data.implementationStatus,
        design_effectiveness: data.designEffectiveness,
        operating_effectiveness: data.operatingEffectiveness,
        assessor: data.assessor,
        assessment_date: data.assessmentDate,
        observation: data.observation,
      })
      .select()
      .single();
    const assessment = this.toRequirementAssessment(ok(row, error));

    await this.db
      .from('internal_controls')
      .update({
        design_effectiveness: data.designEffectiveness,
        operating_effectiveness: data.operatingEffectiveness,
        updated_at: new Date().toISOString(),
      })
      .eq('id', controlId);

    if (
      data.operatingEffectiveness === 'ineffective' ||
      data.operatingEffectiveness === 'partially_effective'
    ) {
      const control = await this.getInternalControl(controlId);
      const findingNum = Math.floor(1000 + Math.random() * 9000);
      const { data: findingRow, error: findingError } = await this.db
        .from('findings')
        .insert({
          org_id: orgId,
          code: `FIND-${new Date().getFullYear()}-${findingNum}`,
          control_id: controlId,
          assessment_id: assessment.id,
          title: `${control?.title ?? 'Control'} — ${data.operatingEffectiveness.replace('_', ' ')}`,
          description: data.observation,
          severity: data.operatingEffectiveness === 'ineffective' ? 'high' : 'medium',
        })
        .select()
        .single();
      const finding = ok(findingRow, findingError);
      await this.db
        .from('requirement_assessments')
        .update({ finding_id: finding['id'] })
        .eq('id', assessment.id);
      assessment.findingId = finding['id'] as string;
      assessment.findingTitle = finding['title'] as string;
      assessment.findingSeverity = finding['severity'] as RequirementAssessment['findingSeverity'];
    }

    await this.db.from('framework_activities').insert({
      control_id: controlId,
      action: 'Assessment Completed',
      details: `Cycle "${data.cycleName}" — operating effectiveness: ${data.operatingEffectiveness}.`,
      actor: data.assessor,
    });

    return assessment;
  }

  private toRequirementAssessment(row: Record<string, unknown>): RequirementAssessment {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      controlId: row['control_id'] as string | undefined,
      frameworkId: row['framework_id'] as string | undefined,
      requirementId: row['requirement_id'] as string | undefined,
      cycleName: row['cycle_name'] as string,
      status: row['status'] as RequirementAssessment['status'],
      implementationStatus: row['implementation_status'] as ImplementationStatus,
      designEffectiveness: row['design_effectiveness'] as EffectivenessStatus,
      operatingEffectiveness: row['operating_effectiveness'] as EffectivenessStatus,
      assessor: row['assessor'] as string,
      assessmentDate: row['assessment_date'] as string,
      observation: row['observation'] as string,
      findingId: row['finding_id'] as string | undefined,
    };
  }

  async listControlFindings(controlId: string): Promise<Finding[]> {
    const { data, error } = await this.db.from('findings').select('*').eq('control_id', controlId);
    return ok(data, error).map((row) => this.toFinding(row));
  }

  async linkFindingToRisk(findingId: string, riskId: string): Promise<Finding> {
    const { data, error } = await this.db
      .from('findings')
      .update({ linked_risk_id: riskId, updated_at: new Date().toISOString() })
      .eq('id', findingId)
      .select()
      .single();
    return this.toFinding(ok(data, error));
  }

  async linkFindingToIssue(findingId: string, issueId: string): Promise<Finding> {
    const { data, error } = await this.db
      .from('findings')
      .update({ linked_issue_id: issueId, updated_at: new Date().toISOString() })
      .eq('id', findingId)
      .select()
      .single();
    return this.toFinding(ok(data, error));
  }

  async resolveFindingViaException(findingId: string, exceptionId: string): Promise<Finding> {
    const { data, error } = await this.db
      .from('findings')
      .update({
        linked_exception_id: exceptionId,
        status: 'accepted',
        updated_at: new Date().toISOString(),
      })
      .eq('id', findingId)
      .select()
      .single();
    return this.toFinding(ok(data, error));
  }

  private toFinding(row: Record<string, unknown>): Finding {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      code: row['code'] as string,
      controlId: row['control_id'] as string,
      assessmentId: row['assessment_id'] as string,
      title: row['title'] as string,
      description: row['description'] as string,
      severity: row['severity'] as Finding['severity'],
      status: row['status'] as Finding['status'],
      linkedIssueId: row['linked_issue_id'] as string | undefined,
      linkedExceptionId: row['linked_exception_id'] as string | undefined,
      linkedRiskId: row['linked_risk_id'] as string | undefined,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }

  async listFrameworkActivities(frameworkId: string, _orgId?: string): Promise<FrameworkActivity[]> {
    const { data, error } = await this.db
      .from('framework_activities')
      .select('*')
      .eq('framework_id', frameworkId)
      .order('timestamp', { ascending: false });
    return ok(data, error).map((row) => this.toFrameworkActivity(row));
  }

  async listControlActivity(controlId: string): Promise<FrameworkActivity[]> {
    const { data, error } = await this.db
      .from('framework_activities')
      .select('*')
      .eq('control_id', controlId)
      .order('timestamp', { ascending: false });
    return ok(data, error).map((row) => this.toFrameworkActivity(row));
  }

  private toFrameworkActivity(row: Record<string, unknown>): FrameworkActivity {
    return {
      id: row['id'] as string,
      frameworkId: row['framework_id'] as string | undefined,
      controlId: row['control_id'] as string | undefined,
      action: row['action'] as string,
      details: row['details'] as string,
      actor: row['actor'] as string,
      timestamp: row['timestamp'] as string,
    };
  }
```

Leave `createAssessmentFinding` (the existing generic one used by the Frameworks module's requirement-level flow) exactly as-is — it is a separate, already-working code path from the new control-centric `createControlAssessment`.

Add `Finding` to the `@icore/shared` type imports at the top of the file.

- [ ] **Step 2: Build**

Run: `yarn nx build notes`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): persist control evidence, assessments, findings and activity log"
```

---

### Task 9: Notes MS — `@MessagePattern` handlers

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`

- [ ] **Step 1: Replace the two existing `notes.frameworks.internal-controls.*` handlers, then add the rest**

This file already has `listInternalControls`/`createInternalControl` methods (search for `notes.frameworks.internal-controls` — they were built earlier for the Frameworks module's "Mapped Controls" tab, predating this plan). `createInternalControl`'s payload still uses the pre-Task-2 type `Omit<InternalControl, 'id'>`, which no longer matches `NotesStrategy.createInternalControl`'s real signature (`InternalControlInput`) — replace both existing methods entirely (same method names, new pattern strings and the fixed type) rather than adding new methods with the same names, which would be a duplicate-method-name compile error:

```typescript
  @MessagePattern('notes.internal-controls.list')
  listInternalControls(
    @Payload() payload: { orgId?: string; frameworkId?: string },
  ): Promise<InternalControl[]> {
    return this.strategy.listInternalControls(payload?.orgId, payload?.frameworkId);
  }

  @MessagePattern('notes.internal-controls.create')
  createInternalControl(
    @Payload() payload: { orgId: string; data: InternalControlInput },
  ): Promise<InternalControl> {
    return this.strategy.createInternalControl(payload.orgId, payload.data);
  }
```

Then add these as genuinely new handlers (no naming conflicts — these methods don't exist yet):

```typescript
  @MessagePattern('notes.internal-controls.get')
  getInternalControl(
    @Payload() payload: { id: string; orgId?: string },
  ): Promise<InternalControl | null> {
    return this.strategy.getInternalControl(payload.id, payload.orgId);
  }

  @MessagePattern('notes.internal-controls.update')
  updateInternalControl(
    @Payload() payload: { id: string; patch: InternalControlPatch },
  ): Promise<InternalControl> {
    return this.strategy.updateInternalControl(payload.id, payload.patch);
  }

  @MessagePattern('notes.internal-controls.delete')
  deleteInternalControl(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.deleteInternalControl(payload.id);
  }

  @MessagePattern('notes.internal-controls.mappings.add')
  addControlFrameworkMapping(
    @Payload() payload: { controlId: string; data: ControlFrameworkMappingInput },
  ): Promise<InternalControl> {
    return this.strategy.addControlFrameworkMapping(payload.controlId, payload.data);
  }

  @MessagePattern('notes.internal-controls.mappings.remove')
  removeControlFrameworkMapping(
    @Payload() payload: { controlId: string; mappingId: string },
  ): Promise<InternalControl> {
    return this.strategy.removeControlFrameworkMapping(payload.controlId, payload.mappingId);
  }

  @MessagePattern('notes.internal-controls.evidence.list')
  listControlEvidence(@Payload() payload: { controlId: string }): Promise<RequirementEvidence[]> {
    return this.strategy.listControlEvidence(payload.controlId);
  }

  @MessagePattern('notes.internal-controls.evidence.create')
  createControlEvidence(
    @Payload()
    payload: {
      orgId: string;
      controlId: string;
      data: Omit<RequirementEvidence, 'id' | 'controlId'>;
    },
  ): Promise<RequirementEvidence> {
    return this.strategy.createControlEvidence(payload.orgId, payload.controlId, payload.data);
  }

  @MessagePattern('notes.internal-controls.assessments.list')
  listControlAssessments(
    @Payload() payload: { controlId: string },
  ): Promise<RequirementAssessment[]> {
    return this.strategy.listControlAssessments(payload.controlId);
  }

  @MessagePattern('notes.internal-controls.assessments.create')
  createControlAssessment(
    @Payload()
    payload: {
      orgId: string;
      controlId: string;
      data: Omit<RequirementAssessment, 'id' | 'controlId'>;
    },
  ): Promise<RequirementAssessment> {
    return this.strategy.createControlAssessment(payload.orgId, payload.controlId, payload.data);
  }

  @MessagePattern('notes.internal-controls.findings.list')
  listControlFindings(@Payload() payload: { controlId: string }): Promise<Finding[]> {
    return this.strategy.listControlFindings(payload.controlId);
  }

  @MessagePattern('notes.internal-controls.findings.link-risk')
  linkFindingToRisk(
    @Payload() payload: { findingId: string; riskId: string },
  ): Promise<Finding> {
    return this.strategy.linkFindingToRisk(payload.findingId, payload.riskId);
  }

  @MessagePattern('notes.internal-controls.findings.link-issue')
  linkFindingToIssue(
    @Payload() payload: { findingId: string; issueId: string },
  ): Promise<Finding> {
    return this.strategy.linkFindingToIssue(payload.findingId, payload.issueId);
  }

  @MessagePattern('notes.internal-controls.findings.resolve-via-exception')
  resolveFindingViaException(
    @Payload() payload: { findingId: string; exceptionId: string },
  ): Promise<Finding> {
    return this.strategy.resolveFindingViaException(payload.findingId, payload.exceptionId);
  }

  @MessagePattern('notes.internal-controls.activity.list')
  listControlActivity(@Payload() payload: { controlId: string }): Promise<FrameworkActivity[]> {
    return this.strategy.listControlActivity(payload.controlId);
  }
```

Add `InternalControl`, `InternalControlInput`, `InternalControlPatch`, `ControlFrameworkMappingInput`, `Finding` to this file's `@icore/shared` type imports (`RequirementEvidence`/`RequirementAssessment`/`FrameworkActivity` are almost certainly already imported here — confirm and add only what's missing).

- [ ] **Step 2: Build**

Run: `yarn nx build notes`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/src/app/notes.controller.ts
git commit -m "feat(notes): add TCP message handlers for internal controls module"
```

---

### Task 10: `NotesClientService` — TCP proxy methods

**Files:**
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`

- [ ] **Step 1: Update the two existing proxy methods, then add the rest**

This file already has `listInternalControls`/`createInternalControl` methods calling the old `notes.frameworks.internal-controls.list`/`.create` patterns with the old `Omit<InternalControl, 'id'>` payload type (search for `notes.frameworks.internal-controls`). Since Task 9 replaced the MS handlers' pattern strings and fixed `createInternalControl`'s type, update both existing methods in place to match — same method names (adding new ones with these names would be a duplicate-method compile error), new pattern strings, fixed type:

```typescript
  listInternalControls(orgId?: string, frameworkId?: string): Promise<InternalControl[]> {
    return signedSend<InternalControl[]>(this.client, 'notes.internal-controls.list', {
      orgId,
      frameworkId,
    });
  }

  createInternalControl(orgId: string, data: InternalControlInput): Promise<InternalControl> {
    return signedSend<InternalControl>(this.client, 'notes.internal-controls.create', {
      orgId,
      data,
    });
  }
```

Then add these as genuinely new proxy methods (no naming conflicts):

```typescript
  getInternalControl(id: string, orgId?: string): Promise<InternalControl | null> {
    return signedSend<InternalControl | null>(this.client, 'notes.internal-controls.get', {
      id,
      orgId,
    });
  }

  updateInternalControl(id: string, patch: InternalControlPatch): Promise<InternalControl> {
    return signedSend<InternalControl>(this.client, 'notes.internal-controls.update', {
      id,
      patch,
    });
  }

  deleteInternalControl(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.internal-controls.delete', { id });
  }

  addControlFrameworkMapping(
    controlId: string,
    data: ControlFrameworkMappingInput,
  ): Promise<InternalControl> {
    return signedSend<InternalControl>(this.client, 'notes.internal-controls.mappings.add', {
      controlId,
      data,
    });
  }

  removeControlFrameworkMapping(controlId: string, mappingId: string): Promise<InternalControl> {
    return signedSend<InternalControl>(this.client, 'notes.internal-controls.mappings.remove', {
      controlId,
      mappingId,
    });
  }

  listControlEvidence(controlId: string): Promise<RequirementEvidence[]> {
    return signedSend<RequirementEvidence[]>(this.client, 'notes.internal-controls.evidence.list', {
      controlId,
    });
  }

  createControlEvidence(
    orgId: string,
    controlId: string,
    data: Omit<RequirementEvidence, 'id' | 'controlId'>,
  ): Promise<RequirementEvidence> {
    return signedSend<RequirementEvidence>(this.client, 'notes.internal-controls.evidence.create', {
      orgId,
      controlId,
      data,
    });
  }

  listControlAssessments(controlId: string): Promise<RequirementAssessment[]> {
    return signedSend<RequirementAssessment[]>(
      this.client,
      'notes.internal-controls.assessments.list',
      { controlId },
    );
  }

  createControlAssessment(
    orgId: string,
    controlId: string,
    data: Omit<RequirementAssessment, 'id' | 'controlId'>,
  ): Promise<RequirementAssessment> {
    return signedSend<RequirementAssessment>(
      this.client,
      'notes.internal-controls.assessments.create',
      { orgId, controlId, data },
    );
  }

  listControlFindings(controlId: string): Promise<Finding[]> {
    return signedSend<Finding[]>(this.client, 'notes.internal-controls.findings.list', {
      controlId,
    });
  }

  linkFindingToRisk(findingId: string, riskId: string): Promise<Finding> {
    return signedSend<Finding>(this.client, 'notes.internal-controls.findings.link-risk', {
      findingId,
      riskId,
    });
  }

  linkFindingToIssue(findingId: string, issueId: string): Promise<Finding> {
    return signedSend<Finding>(this.client, 'notes.internal-controls.findings.link-issue', {
      findingId,
      issueId,
    });
  }

  resolveFindingViaException(findingId: string, exceptionId: string): Promise<Finding> {
    return signedSend<Finding>(
      this.client,
      'notes.internal-controls.findings.resolve-via-exception',
      { findingId, exceptionId },
    );
  }

  listControlActivity(controlId: string): Promise<FrameworkActivity[]> {
    return signedSend<FrameworkActivity[]>(this.client, 'notes.internal-controls.activity.list', {
      controlId,
    });
  }
```

Add the corresponding type imports at the top of the file (same set as Task 9).

- [ ] **Step 2: Build**

Run: `yarn nx build notes-client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes-client): proxy internal controls module over TCP"
```

---

### Task 11: API Gateway — REST endpoints

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts`

- [ ] **Step 1: Update the two existing endpoints' body type, then add the rest**

This file already has `@Get('internal-controls')`/`@Post('internal-controls')` handlers (search for `listInternalControls`/`createInternalControl` — they predate this plan, built for the Frameworks module). `listInternalControls` needs no change. `createInternalControl`'s `@Body()` type is still the pre-Task-2 `Omit<InternalControl, 'id'>`, which no longer matches the strategy's real signature — update it in place to `InternalControlInput` (do not add a second method with this name, which would be a duplicate-method compile error):

```typescript
  @Post('internal-controls')
  @ApiOperation({ summary: 'Create internal control' })
  createInternalControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: InternalControlInput,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createInternalControl(orgId, body);
  }
```

Then add these as genuinely new endpoints (no naming conflicts — none of these exist yet), following the `// ─── Exceptions ───` section style:

```typescript
  @Get('internal-controls/:id')
  @ApiOperation({ summary: 'Get internal control' })
  async getInternalControl(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    const control = await this.notes.getInternalControl(id);
    if (!control) throw new NotFoundException();
    return control;
  }

  @Patch('internal-controls/:id')
  @ApiOperation({ summary: 'Update internal control' })
  updateInternalControl(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() patch: InternalControlPatch,
  ) {
    this.uid(req);
    return this.notes.updateInternalControl(id, patch);
  }

  @Delete('internal-controls/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete internal control' })
  deleteInternalControl(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.deleteInternalControl(id);
  }

  @Post('internal-controls/:id/mappings')
  @ApiOperation({ summary: 'Add a framework mapping to an internal control' })
  addControlFrameworkMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: ControlFrameworkMappingInput,
  ) {
    this.uid(req);
    return this.notes.addControlFrameworkMapping(id, body);
  }

  @Delete('internal-controls/:id/mappings/:mappingId')
  @ApiOperation({ summary: 'Remove a framework mapping from an internal control' })
  removeControlFrameworkMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Param('mappingId') mappingId: string,
  ) {
    this.uid(req);
    return this.notes.removeControlFrameworkMapping(id, mappingId);
  }

  @Get('internal-controls/:id/evidence')
  @ApiOperation({ summary: 'List evidence attached to an internal control' })
  listControlEvidence(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listControlEvidence(id);
  }

  @Post('internal-controls/:id/evidence')
  @ApiOperation({ summary: 'Attach evidence to an internal control' })
  createControlEvidence(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: Omit<RequirementEvidence, 'id' | 'controlId'>,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createControlEvidence(orgId, id, body);
  }

  @Get('internal-controls/:id/assessments')
  @ApiOperation({ summary: 'List assessments for an internal control' })
  listControlAssessments(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listControlAssessments(id);
  }

  @Post('internal-controls/:id/assessments')
  @ApiOperation({ summary: 'Record a control assessment (may generate a Finding)' })
  createControlAssessment(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Param('id') id: string,
    @Body() body: Omit<RequirementAssessment, 'id' | 'controlId'>,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createControlAssessment(orgId, id, body);
  }

  @Get('internal-controls/:id/findings')
  @ApiOperation({ summary: 'List findings for an internal control' })
  listControlFindings(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listControlFindings(id);
  }

  @Post('findings/:id/link-risk')
  @ApiOperation({ summary: 'Link a finding to a risk register entry' })
  linkFindingToRisk(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { riskId: string },
  ) {
    this.uid(req);
    return this.notes.linkFindingToRisk(id, body.riskId);
  }

  @Post('findings/:id/link-issue')
  @ApiOperation({ summary: 'Link a finding to an issue' })
  linkFindingToIssue(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { issueId: string },
  ) {
    this.uid(req);
    return this.notes.linkFindingToIssue(id, body.issueId);
  }

  @Post('findings/:id/resolve-via-exception')
  @ApiOperation({ summary: 'Resolve a finding by attaching an approved exception' })
  resolveFindingViaException(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { exceptionId: string },
  ) {
    this.uid(req);
    return this.notes.resolveFindingViaException(id, body.exceptionId);
  }

  @Get('internal-controls/:id/activity')
  @ApiOperation({ summary: 'List activity log for an internal control' })
  listControlActivity(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.listControlActivity(id);
  }
```

Add `InternalControlInput`, `InternalControlPatch`, `ControlFrameworkMappingInput`, `RequirementEvidence`, `RequirementAssessment` to the type imports at the top (some are likely already imported for the Frameworks endpoints — only add what's missing).

- [ ] **Step 2: Build**

Run: `yarn nx build api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts
git commit -m "feat(api): expose internal controls module over REST"
```

---

### Task 12: Client — `queries/controls.ts` hooks

**Files:**
- Create: `apps/client/src/queries/controls.ts`

Model this file on `apps/client/src/queries/frameworks.ts`'s `useInternalControls`/`useCreateInternalControl` hooks (lines 155-172) — same `api()` helper, same `useQuery`/`useMutation` shape.

- [ ] **Step 1: Write the file**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  InternalControl,
  InternalControlInput,
  InternalControlPatch,
  ControlFrameworkMappingInput,
  RequirementEvidence,
  RequirementAssessment,
  Finding,
  FrameworkActivity,
} from '@icore/shared';

export function useInternalControlsList(orgId?: string, frameworkId?: string) {
  return useQuery<InternalControl[]>({
    queryKey: ['internal-controls', orgId, frameworkId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (orgId) params.set('orgId', orgId);
      if (frameworkId) params.set('frameworkId', frameworkId);
      return api<InternalControl[]>(`/notes/internal-controls?${params.toString()}`);
    },
    enabled: !!orgId,
  });
}

export function useInternalControl(id: string) {
  return useQuery<InternalControl>({
    queryKey: ['internal-controls', id],
    queryFn: () => api<InternalControl>(`/notes/internal-controls/${id}`),
    enabled: !!id,
  });
}

export function useCreateControl(orgId: string) {
  const qc = useQueryClient();
  return useMutation<InternalControl, Error, InternalControlInput>({
    mutationFn: (data) =>
      api<InternalControl>(`/notes/internal-controls?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['internal-controls'] }),
  });
}

export function useUpdateControl(id: string) {
  const qc = useQueryClient();
  return useMutation<InternalControl, Error, InternalControlPatch>({
    mutationFn: (patch) =>
      api<InternalControl>(`/notes/internal-controls/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['internal-controls'] });
      qc.invalidateQueries({ queryKey: ['internal-controls', id] });
    },
  });
}

export function useDeleteControl() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/internal-controls/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['internal-controls'] }),
  });
}

export function useAddControlMapping(controlId: string) {
  const qc = useQueryClient();
  return useMutation<InternalControl, Error, ControlFrameworkMappingInput>({
    mutationFn: (data) =>
      api<InternalControl>(`/notes/internal-controls/${controlId}/mappings`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['internal-controls', controlId] }),
  });
}

export function useControlEvidence(controlId: string) {
  return useQuery<RequirementEvidence[]>({
    queryKey: ['internal-controls', controlId, 'evidence'],
    queryFn: () => api<RequirementEvidence[]>(`/notes/internal-controls/${controlId}/evidence`),
    enabled: !!controlId,
  });
}

export function useCreateControlEvidence(orgId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation<RequirementEvidence, Error, Omit<RequirementEvidence, 'id' | 'controlId'>>({
    mutationFn: (data) =>
      api<RequirementEvidence>(
        `/notes/internal-controls/${controlId}/evidence?orgId=${encodeURIComponent(orgId)}`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['internal-controls', controlId, 'evidence'] });
      qc.invalidateQueries({ queryKey: ['internal-controls', controlId] });
    },
  });
}

export function useControlAssessments(controlId: string) {
  return useQuery<RequirementAssessment[]>({
    queryKey: ['internal-controls', controlId, 'assessments'],
    queryFn: () => api<RequirementAssessment[]>(`/notes/internal-controls/${controlId}/assessments`),
    enabled: !!controlId,
  });
}

export function useCreateControlAssessment(orgId: string, controlId: string) {
  const qc = useQueryClient();
  return useMutation<RequirementAssessment, Error, Omit<RequirementAssessment, 'id' | 'controlId'>>({
    mutationFn: (data) =>
      api<RequirementAssessment>(
        `/notes/internal-controls/${controlId}/assessments?orgId=${encodeURIComponent(orgId)}`,
        { method: 'POST', body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['internal-controls', controlId, 'assessments'] });
      qc.invalidateQueries({ queryKey: ['internal-controls', controlId, 'findings'] });
      qc.invalidateQueries({ queryKey: ['internal-controls', controlId] });
    },
  });
}

export function useControlFindings(controlId: string) {
  return useQuery<Finding[]>({
    queryKey: ['internal-controls', controlId, 'findings'],
    queryFn: () => api<Finding[]>(`/notes/internal-controls/${controlId}/findings`),
    enabled: !!controlId,
  });
}

export function useControlActivity(controlId: string) {
  return useQuery<FrameworkActivity[]>({
    queryKey: ['internal-controls', controlId, 'activity'],
    queryFn: () => api<FrameworkActivity[]>(`/notes/internal-controls/${controlId}/activity`),
    enabled: !!controlId,
  });
}
```

Check `apps/client/src/queries/frameworks.ts`'s import path for the `api` helper (`@/lib/api` is a guess based on typical alias conventions in this repo — confirm the exact import at the top of `frameworks.ts` and match it exactly if different).

- [ ] **Step 2: Build**

Run: `yarn nx build client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/queries/controls.ts
git commit -m "feat(client): add React Query hooks for internal controls module"
```

---

### Task 13: Rebuild `ControlsTable.tsx` columns

**Files:**
- Modify: `apps/client/src/components/controls/ControlsTable.tsx`
- Modify: `apps/client/src/components/controls/__tests__/ControlsTable.unit.test.tsx`

Per Controls.docx: `ID | Control | Domain | Owner | Status | Effectiveness | Frameworks | Evidence | Findings | ⋮`

- [ ] **Step 1: Read the current component in full before editing**

Run: `cat apps/client/src/components/controls/ControlsTable.tsx`
(This component currently renders `DocumentStandard[]` — its prop type and column set need to change to `InternalControl[]`.)

- [ ] **Step 2: Change the props and rendering**

Replace the component's props type and table body to consume `InternalControl[]` instead of `DocumentStandard[]`, with columns: Code, Title, Domain, Owner, Implementation Status, Operating Effectiveness (colored dot: 🟢 effective / 🟠 partially_effective / 🔴 ineffective / ⚪ not_tested), a `Frameworks: X Y +N` cell (first two framework names from `frameworkMappings`, `+N` for the rest, clicking opens the mapping tab of the detail route), `evidenceCount`, `findingsCount`, and a row-click that navigates to `/controls/$id`:
```tsx
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { InternalControl } from '@icore/shared';

interface ControlsTableProps {
  controls: InternalControl[];
  showGapsOnly: boolean;
}

const EFFECTIVENESS_DOT: Record<string, string> = {
  effective: '🟢',
  partially_effective: '🟠',
  ineffective: '🔴',
  not_tested: '⚪',
};

export function ControlsTable({ controls, showGapsOnly }: ControlsTableProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const rows = showGapsOnly
    ? controls.filter(
        (c) =>
          c.operatingEffectiveness === 'ineffective' ||
          c.operatingEffectiveness === 'partially_effective' ||
          c.implementationStatus === 'not_implemented',
      )
    : controls;

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        {t('controls.noControls')}
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground border-b border-border">
          <th className="py-2 px-3">{t('controls.colCode')}</th>
          <th className="py-2 px-3">{t('controls.colTitle')}</th>
          <th className="py-2 px-3">{t('controls.colDomain')}</th>
          <th className="py-2 px-3">{t('controls.colOwner')}</th>
          <th className="py-2 px-3">{t('controls.colStatus')}</th>
          <th className="py-2 px-3">{t('controls.colEffectiveness')}</th>
          <th className="py-2 px-3">{t('controls.colFrameworks')}</th>
          <th className="py-2 px-3">{t('controls.colEvidence')}</th>
          <th className="py-2 px-3">{t('controls.colFindings')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const fwNames = [...new Set((c.frameworkMappings ?? []).map((m) => m.frameworkName))];
          return (
            <tr
              key={c.id}
              onClick={() => void navigate({ to: '/controls/$id', params: { id: c.id } })}
              className="border-b border-border hover:bg-surface cursor-pointer"
            >
              <td className="py-2 px-3 font-mono text-xs">{c.code}</td>
              <td className="py-2 px-3">{c.title}</td>
              <td className="py-2 px-3 text-muted-foreground">{c.domain}</td>
              <td className="py-2 px-3 text-muted-foreground">{c.owner}</td>
              <td className="py-2 px-3">{c.implementationStatus.replace('_', ' ')}</td>
              <td className="py-2 px-3">
                {EFFECTIVENESS_DOT[c.operatingEffectiveness]} {c.operatingEffectiveness.replace('_', ' ')}
              </td>
              <td className="py-2 px-3 text-xs text-muted-foreground">
                {fwNames.slice(0, 2).join(', ')}
                {fwNames.length > 2 ? ` +${fwNames.length - 2}` : ''}
              </td>
              <td className="py-2 px-3 text-center">{c.evidenceCount ?? 0}</td>
              <td className="py-2 px-3 text-center">{c.findingsCount ?? 0}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Update the existing test file to build `InternalControl` fixtures instead of `DocumentStandard`**

Read `apps/client/src/components/controls/__tests__/ControlsTable.unit.test.tsx` first to see its current fixture shape, then replace each `DocumentStandard`-shaped fixture with a minimal valid `InternalControl` object (all required fields from Task 2's type) and update assertions to match the new columns (code/domain/owner/effectiveness dot text/framework names) instead of the old GDPR/NIST/ISO boolean-column assertions.

- [ ] **Step 4: Run the test**

Run: `yarn nx test client -- ControlsTable`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/components/controls/ControlsTable.tsx apps/client/src/components/controls/__tests__/ControlsTable.unit.test.tsx
git commit -m "feat(client): rebuild ControlsTable on InternalControl per Controls.docx column spec"
```

---

### Task 14: Rebuild the Controls list page (`controls.tsx`)

**Files:**
- Modify: `apps/client/src/routes/_dashboard/controls.tsx`

Replaces the `StandardsDocument`-driven page with one backed by `useInternalControlsList`, adds the KPI summary bar (`86 Controls · 72 Implemented · 8 Partial · 6 Gaps` / `92% Framework Requirement Coverage`) and the filter set (Status/Effectiveness/Owner/Domain/Framework/Criticality) the doc asks for.

- [ ] **Step 1: Replace the whole file**

```tsx
import { useMemo, useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useFrameworks } from '@/queries/notes';
import { useInternalControlsList } from '@/queries/controls';
import { ControlsTable } from '@/components/controls/ControlsTable';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';

export const Route = createFileRoute('/_dashboard/controls')({
  component: ControlsPage,
});

function ControlsPage() {
  const { t } = useTranslation();
  const { activeOrgId } = useActiveOrgStore();

  const { data: frameworks = [] } = useFrameworks();
  const { data: controls = [], isPending } = useInternalControlsList(activeOrgId ?? undefined);

  const [selectedFwIds, setSelectedFwIds] = useState<Set<string>>(new Set());
  const [showGapsOnly, setShowGapsOnly] = useState(false);
  const [domainFilter, setDomainFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [criticalityFilter, setCriticalityFilter] = useState('');

  const domains = useMemo(() => [...new Set(controls.map((c) => c.domain))].sort(), [controls]);
  const owners = useMemo(() => [...new Set(controls.map((c) => c.owner))].sort(), [controls]);

  const filtered = useMemo(() => {
    return controls.filter((c) => {
      if (
        selectedFwIds.size > 0 &&
        !(c.frameworkMappings ?? []).some((m) => selectedFwIds.has(m.frameworkId))
      )
        return false;
      if (domainFilter && c.domain !== domainFilter) return false;
      if (ownerFilter && c.owner !== ownerFilter) return false;
      if (criticalityFilter && c.criticality !== criticalityFilter) return false;
      return true;
    });
  }, [controls, selectedFwIds, domainFilter, ownerFilter, criticalityFilter]);

  const summary = useMemo(() => {
    const total = filtered.length;
    const implemented = filtered.filter((c) => c.implementationStatus === 'implemented').length;
    const partial = filtered.filter((c) => c.implementationStatus === 'partially_implemented').length;
    const gaps = filtered.filter(
      (c) =>
        c.implementationStatus === 'not_implemented' || c.operatingEffectiveness === 'ineffective',
    ).length;
    const totalRequirements = filtered.reduce((sum, c) => sum + (c.requirementCount ?? 0), 0);
    const coveragePct = total === 0 ? 0 : Math.round((totalRequirements / (total * 4)) * 100);
    return { total, implemented, partial, gaps, coveragePct };
  }, [filtered]);

  function toggleFramework(id: string) {
    setSelectedFwIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <PageLayout title={t('nav.controls')}>
      <div className="mb-4 flex items-center gap-4 text-sm">
        <span className="font-semibold text-foreground">
          {summary.total} {t('controls.summaryTotal')} · {summary.implemented}{' '}
          {t('controls.summaryImplemented')} · {summary.partial} {t('controls.summaryPartial')} ·{' '}
          {summary.gaps} {t('controls.summaryGaps')}
        </span>
        <span className="text-muted-foreground">
          {summary.coveragePct}% {t('controls.summaryCoverage')}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          {frameworks.map((fw) => (
            <button
              key={fw.id}
              type="button"
              onClick={() => toggleFramework(fw.id)}
              className={`px-2 py-1 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
                selectedFwIds.has(fw.id)
                  ? 'bg-green-500/10 border-green-500/20 text-green-500'
                  : 'bg-surface border-border text-muted-foreground/50'
              }`}
            >
              {fw.slug.toUpperCase()}
            </button>
          ))}
        </div>

        <select
          value={domainFilter}
          onChange={(e) => setDomainFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
        >
          <option value="">{t('controls.filterAllDomains')}</option>
          {domains.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
        >
          <option value="">{t('controls.filterAllOwners')}</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <select
          value={criticalityFilter}
          onChange={(e) => setCriticalityFilter(e.target.value)}
          className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-foreground"
        >
          <option value="">{t('controls.filterAllCriticality')}</option>
          {['critical', 'high', 'medium', 'low'].map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showGapsOnly}
            onChange={(e) => setShowGapsOnly(e.target.checked)}
            className="accent-green-500"
          />
          <span className="text-xs text-muted-foreground">{t('controls.showGapsOnly')}</span>
        </label>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 bg-surface border border-border rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <ControlsTable controls={filtered} showGapsOnly={showGapsOnly} />
      )}
    </PageLayout>
  );
}
```

Note: this drops the old `docId`/`useStandardsDocuments` machinery entirely — the Controls page no longer depends on AI-generated `StandardsDocument`s. If any other route links to `/controls?docId=...`, that query param is now ignored harmlessly (TanStack Router doesn't error on unknown search params unless `validateSearch` is still declared — this rewrite removes `validateSearch` too, so drop any such links or leave them as-is; they'll just land on the unfiltered list).

- [ ] **Step 2: Build and lint**

Run: `npx prettier --write apps/client/src/routes/_dashboard/controls.tsx && yarn nx lint client && yarn nx build client`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/routes/_dashboard/controls.tsx
git commit -m "feat(client): rebuild Controls list page on real InternalControl entity"
```

---

### Task 15: Control detail route — Overview, Implementation, Framework Mapping tabs

**Files:**
- Create: `apps/client/src/routes/_dashboard/controls_.$id.tsx`

Model the tab-shell structure on `apps/client/src/routes/_dashboard/frameworks_.$id.tsx` — read that file first for the exact tab-bar/layout pattern used in this repo before writing this one, so the two detail pages feel consistent.

- [ ] **Step 1: Write the route with the first three tabs**

```tsx
import { useState } from 'react';
import { createFileRoute, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  useInternalControl,
  useUpdateControl,
  useAddControlMapping,
} from '@/queries/controls';
import { PageLayout } from '@/components/PageLayout';

export const Route = createFileRoute('/_dashboard/controls_/$id')({
  component: ControlDetailPage,
});

type Tab = 'overview' | 'implementation' | 'mapping' | 'evidence' | 'assessments' | 'findings' | 'history';

function ControlDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/_dashboard/controls_/$id' });
  const { data: control, isPending } = useInternalControl(id);
  const updateControl = useUpdateControl(id);
  const addMapping = useAddControlMapping(id);
  const [tab, setTab] = useState<Tab>('overview');

  if (isPending || !control) {
    return (
      <PageLayout title={t('controls.detailTitle')}>
        <div className="h-64 bg-surface border border-border rounded-lg animate-pulse" />
      </PageLayout>
    );
  }

  const tabs: Tab[] = [
    'overview',
    'implementation',
    'mapping',
    'evidence',
    'assessments',
    'findings',
    'history',
  ];

  return (
    <PageLayout title={`${control.code} — ${control.title}`}>
      <div className="flex items-center gap-1 border-b border-border mb-4">
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
            {t(`controls.tab.${tKey}`)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label={t('controls.colCode')} value={control.code} />
          <Field label={t('controls.colTitle')} value={control.title} />
          <Field label={t('controls.fieldDescription')} value={control.description} />
          <Field label={t('controls.colDomain')} value={control.domain} />
          <Field label={t('controls.colOwner')} value={control.owner} />
          <Field label={t('controls.fieldOperator')} value={control.operator ?? ''} />
          <Field label={t('controls.fieldCriticality')} value={control.criticality} />
          <Field label={t('controls.fieldControlType')} value={control.controlType} />
          <Field label={t('controls.fieldExecution')} value={control.execution} />
          <Field label={t('controls.fieldFrequency')} value={control.frequency} />
          <Field label={t('controls.fieldNature')} value={control.nature} />
          <Field
            label={t('controls.fieldKeyControl')}
            value={control.keyControl ? t('common.yes') : t('common.no')}
          />
        </div>
      )}

      {tab === 'implementation' && (
        <div className="space-y-3 text-sm max-w-2xl">
          <label className="block">
            <span className="text-xs text-muted-foreground">{t('controls.fieldImplementationStatus')}</span>
            <select
              value={control.implementationStatus}
              onChange={(e) =>
                updateControl.mutate({
                  implementationStatus: e.target.value as typeof control.implementationStatus,
                })
              }
              className="mt-1 w-full h-9 rounded-md border border-border bg-surface px-2 text-sm"
            >
              {['not_implemented', 'planned', 'partially_implemented', 'implemented', 'not_applicable'].map(
                (s) => (
                  <option key={s} value={s}>
                    {s.replace('_', ' ')}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">
              {t('controls.fieldImplementationDescription')}
            </span>
            <textarea
              defaultValue={control.implementationDescription}
              onBlur={(e) => updateControl.mutate({ implementationDescription: e.target.value })}
              className="mt-1 w-full min-h-24 rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </label>
        </div>
      )}

      {tab === 'mapping' && (
        <div className="space-y-2 text-sm">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="py-2 px-3">{t('controls.mappingFramework')}</th>
                <th className="py-2 px-3">{t('controls.mappingRequirement')}</th>
                <th className="py-2 px-3">{t('controls.mappingType')}</th>
                <th className="py-2 px-3">{t('controls.mappingValidation')}</th>
              </tr>
            </thead>
            <tbody>
              {(control.frameworkMappings ?? []).map((m) => (
                <tr key={m.id} className="border-b border-border">
                  <td className="py-2 px-3">{m.frameworkName}</td>
                  <td className="py-2 px-3">
                    {m.requirementCode}
                    {m.requirementTitle ? ` — ${m.requirementTitle}` : ''}
                  </td>
                  <td className="py-2 px-3">{m.mappingType}</td>
                  <td className="py-2 px-3">
                    {m.validation === 'ai_suggested'
                      ? t('controls.aiSuggested')
                      : t('controls.humanValidated')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(control.frameworkMappings ?? []).length === 0 && (
            <div className="py-8 text-center text-muted-foreground">{t('controls.noMappings')}</div>
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

The route path segment `controls_/$id` (trailing underscore before the slash) mirrors the existing `frameworks_.$id.tsx` convention in this repo for a detail route that is a sibling of, not nested under, the list route — verify the exact generated path in `apps/client/src/routeTree.gen.ts` after running the dev server once, since that file is auto-generated by the TanStack Router Vite plugin and must match.

- [ ] **Step 2: Verify the route registers**

Run: `yarn nx run client:dev` briefly (or however this repo triggers the router codegen — check `vite.config.mts`) and confirm `controls_.$id` appears in `apps/client/src/routeTree.gen.ts`. Stop the dev server after confirming.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/routes/_dashboard/controls_.\$id.tsx apps/client/src/routeTree.gen.ts
git commit -m "feat(client): add Control detail route with Overview/Implementation/Mapping tabs"
```

---

### Task 16: Control detail route — Evidence, Assessments, Findings, History tabs

**Files:**
- Modify: `apps/client/src/routes/_dashboard/controls_.$id.tsx`

- [ ] **Step 1: Add the remaining four tab bodies**

Add these imports:
```tsx
import {
  useControlEvidence,
  useControlAssessments,
  useControlFindings,
  useControlActivity,
} from '@/queries/controls';
```

Inside `ControlDetailPage`, after the existing hooks:
```tsx
  const { data: evidence = [] } = useControlEvidence(id);
  const { data: assessments = [] } = useControlAssessments(id);
  const { data: findings = [] } = useControlFindings(id);
  const { data: activity = [] } = useControlActivity(id);
```

Add after the `mapping` tab block:
```tsx
      {tab === 'evidence' && (
        <div className="space-y-2 text-sm">
          {evidence.map((e) => (
            <div key={e.id} className="border border-border rounded-lg p-3">
              <div className="font-medium">{e.title}</div>
              <div className="text-xs text-muted-foreground">
                {e.owner} · {e.evidenceType} · {t(`controls.evidenceStatus.${e.verificationStatus}`)}
              </div>
            </div>
          ))}
          {evidence.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">{t('controls.noEvidence')}</div>
          )}
        </div>
      )}

      {tab === 'assessments' && (
        <div className="space-y-2 text-sm">
          {assessments.map((a) => (
            <div key={a.id} className="border border-border rounded-lg p-3">
              <div className="font-medium">{a.cycleName}</div>
              <div className="text-xs text-muted-foreground">
                {t('controls.fieldDesignEffectiveness')}: {a.designEffectiveness} ·{' '}
                {t('controls.fieldOperatingEffectiveness')}: {a.operatingEffectiveness}
              </div>
              <div className="text-xs text-muted-foreground">{a.observation}</div>
            </div>
          ))}
          {assessments.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">{t('controls.noAssessments')}</div>
          )}
        </div>
      )}

      {tab === 'findings' && (
        <div className="space-y-2 text-sm">
          {findings.map((f) => (
            <div key={f.id} className="border border-border rounded-lg p-3">
              <div className="font-medium">
                {f.code} — {f.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {f.severity} · {f.status}
                {f.linkedRiskId ? ` · ${t('controls.linkedToRisk')} ${f.linkedRiskId}` : ''}
                {f.linkedExceptionId ? ` · ${t('controls.linkedToException')} ${f.linkedExceptionId}` : ''}
              </div>
            </div>
          ))}
          {findings.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">{t('controls.noFindings')}</div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-2 text-sm">
          {activity.map((a) => (
            <div key={a.id} className="flex items-baseline gap-2 border-b border-border py-1.5">
              <span className="text-xs text-muted-foreground w-32 shrink-0">
                {new Date(a.timestamp).toLocaleString()}
              </span>
              <span className="font-medium">{a.action}</span>
              <span className="text-muted-foreground">{a.details}</span>
            </div>
          ))}
          {activity.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">{t('controls.noActivity')}</div>
          )}
        </div>
      )}
```

- [ ] **Step 2: Build**

Run: `yarn nx build client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/routes/_dashboard/controls_.\$id.tsx
git commit -m "feat(client): add Evidence/Assessments/Findings/History tabs to Control detail"
```

---

### Task 17: Add Control (Dialog) / Delete (AlertDialog) on the list page

**Files:**
- Modify: `apps/client/src/routes/_dashboard/controls.tsx`

Per the overlay-pattern constraint: Create uses `Dialog`, Delete uses `AlertDialog`. There is no "edit whole control" Sheet in this task — field-level edits already happen inline on the detail page's Implementation tab (Task 15), matching how Controls.docx frames editing as happening inside the Control Record, not the list.

- [ ] **Step 1: Add state and the two overlays**

Add to `ControlsPage`, alongside the existing `useState` calls:
```tsx
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const createControl = useCreateControl(activeOrgId ?? '');
  const deleteControl = useDeleteControl();
```
Import `useCreateControl`, `useDeleteControl` from `@/queries/controls`, and shadcn's `Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogFooter`, `AlertDialog`/`AlertDialogContent`/`AlertDialogHeader`/`AlertDialogTitle`/`AlertDialogDescription`/`AlertDialogFooter`/`AlertDialogAction`/`AlertDialogCancel`, and `Button`, `Input`, `Label` from this repo's shadcn component paths — confirm the exact import paths by checking how `apps/client/src/routes/_dashboard/exceptions.tsx` imports the same shadcn primitives, and match them exactly.

Add a toolbar button next to the existing filters:
```tsx
        <Button size="sm" className="ml-auto" onClick={() => setCreateOpen(true)}>
          {t('controls.addControl')}
        </Button>
```

Add the Dialog (minimal required fields only — code/title/description/domain/owner/criticality/controlType/execution/frequency/nature/category; a fuller form can follow in a later iteration):
```tsx
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('controls.addControl')}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              createControl.mutate(
                {
                  code: String(form.get('code')),
                  title: String(form.get('title')),
                  description: String(form.get('description')),
                  domain: String(form.get('domain')),
                  owner: String(form.get('owner')),
                  category: String(form.get('domain')),
                  criticality: 'medium',
                  controlType: 'preventive',
                  execution: 'manual',
                  frequency: 'quarterly',
                  nature: 'technical',
                },
                { onSuccess: () => setCreateOpen(false) },
              );
            }}
          >
            <div>
              <Label htmlFor="code">{t('controls.colCode')}</Label>
              <Input id="code" name="code" required placeholder="IAM-001" />
            </div>
            <div>
              <Label htmlFor="title">{t('controls.colTitle')}</Label>
              <Input id="title" name="title" required />
            </div>
            <div>
              <Label htmlFor="description">{t('controls.fieldDescription')}</Label>
              <Input id="description" name="description" required />
            </div>
            <div>
              <Label htmlFor="domain">{t('controls.colDomain')}</Label>
              <Input id="domain" name="domain" required />
            </div>
            <div>
              <Label htmlFor="owner">{t('controls.colOwner')}</Label>
              <Input id="owner" name="owner" required />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createControl.isPending}>
                {t('controls.addControl')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('controls.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('controls.deleteConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) deleteControl.mutate(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
```

Wire a delete trigger into `ControlsTable` by adding an `onDeleteClick?: (id: string) => void` prop and a trailing `⋮` menu column (or a simple delete icon button) that calls `setConfirmDeleteId(c.id)` — pass it down from `ControlsPage`:
```tsx
<ControlsTable controls={filtered} showGapsOnly={showGapsOnly} onDeleteClick={setConfirmDeleteId} />
```

- [ ] **Step 2: Build, lint**

Run: `npx prettier --write apps/client/src/routes/_dashboard/controls.tsx apps/client/src/components/controls/ControlsTable.tsx && yarn nx lint client && yarn nx build client`
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/client/src/routes/_dashboard/controls.tsx apps/client/src/components/controls/ControlsTable.tsx
git commit -m "feat(client): add Control creation Dialog and deletion AlertDialog"
```

---

### Task 18: i18n — en/es/he/ru keys

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/en.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/es.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/he.ts`
- Modify: `libs/template-shared/src/lib/i18n/locales/ru.ts`

- [ ] **Step 1: Extend the `controls` block in `en.ts` (currently at `en.ts:379-394`)**

Add these keys alongside the existing ones (keep `noDocuments`/`generateFirst`/`selectDocument` — they may still be referenced elsewhere; remove only if `grep -rn "controls.noDocuments\|controls.generateFirst\|controls.selectDocument" apps/client/src` comes back empty after Task 14's rewrite):
```typescript
  controls: {
    // ...existing keys...
    standardsMapped: 'standards mapped',
    colDomain: 'Domain',
    colOwner: 'Owner',
    colStatus: 'Status',
    colEffectiveness: 'Effectiveness',
    colFrameworks: 'Frameworks',
    colEvidence: 'Evidence',
    colFindings: 'Findings',
    summaryTotal: 'Controls',
    summaryImplemented: 'Implemented',
    summaryPartial: 'Partial',
    summaryGaps: 'Gaps',
    summaryCoverage: 'Framework Requirement Coverage',
    filterAllDomains: 'All Domains',
    filterAllOwners: 'All Owners',
    filterAllCriticality: 'All Criticality',
    addControl: 'Add Control',
    deleteConfirmTitle: 'Delete this control?',
    deleteConfirmDescription:
      'This removes the control, its framework mappings, evidence, and assessment history. This cannot be undone.',
    detailTitle: 'Control',
    fieldDescription: 'Description',
    fieldOperator: 'Control Operator',
    fieldCriticality: 'Criticality',
    fieldControlType: 'Control Type',
    fieldExecution: 'Execution',
    fieldFrequency: 'Frequency',
    fieldNature: 'Nature',
    fieldKeyControl: 'Key Control',
    fieldImplementationStatus: 'Implementation Status',
    fieldImplementationDescription: 'Implementation Description',
    fieldDesignEffectiveness: 'Design Effectiveness',
    fieldOperatingEffectiveness: 'Operating Effectiveness',
    mappingFramework: 'Framework',
    mappingRequirement: 'Requirement',
    mappingType: 'Mapping Type',
    mappingValidation: 'Validation',
    aiSuggested: 'AI Suggested',
    humanValidated: 'Human Validated',
    noMappings: 'No framework mappings yet.',
    noEvidence: 'No evidence attached yet.',
    noAssessments: 'No assessments recorded yet.',
    noFindings: 'No findings for this control.',
    noActivity: 'No activity recorded yet.',
    linkedToRisk: 'linked to risk',
    linkedToException: 'linked to exception',
    tab: {
      overview: 'Overview',
      implementation: 'Implementation',
      mapping: 'Framework Mapping',
      evidence: 'Evidence',
      assessments: 'Assessments',
      findings: 'Findings',
      history: 'History',
    },
    evidenceStatus: {
      verified: 'Verified',
      pending_review: 'Pending Review',
      rejected: 'Rejected',
      expired: 'Expired',
    },
  },
```
(`standardsMapped` may already exist per the earlier read — don't duplicate the key if so, just add the new ones around it.)

- [ ] **Step 2: Translate the same key set into `es.ts`, `he.ts`, `ru.ts`**

Add the identical key structure to each file with translated values (Spanish, Hebrew, Russian respectively) at the same nesting path (`controls.*`). Keep English fallback values only as a last resort if a fast, correct translation isn't available — do not skip any locale, since `ru.ts` is already behind on the Asset Catalog rollout and this would make the gap worse.

- [ ] **Step 3: Verify no locale drifted**

Run: `node -e "
const en = require('./libs/template-shared/src/lib/i18n/locales/en.ts');
" 2>&1 | head -5`
(This likely won't run directly since it's TS — instead just diff key sets manually: `grep -o '^\s*[a-zA-Z]*:' libs/template-shared/src/lib/i18n/locales/en.ts` vs the same for `ru.ts` under the `controls:` block, confirm same key count.)

- [ ] **Step 4: Build**

Run: `yarn nx build template-shared && yarn nx build client`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/ru.ts
git commit -m "feat(i18n): add Control module strings across en/es/he/ru"
```

---

### Task 19: Client unit tests for the new pages

**Files:**
- Create: `apps/client/src/routes/_dashboard/__tests__/controls.unit.test.tsx`
- Create: `apps/client/src/routes/_dashboard/__tests__/controls-detail.unit.test.tsx`

Model both files on `apps/client/src/routes/_dashboard/__tests__/frameworks.unit.test.tsx` for the query-mocking/rendering setup used throughout this repo's route tests (read it first, then mirror its `vi.mock` pattern for `@/queries/*` and its `renderRoute`/wrapper helper).

- [ ] **Step 1: Write `controls.unit.test.tsx`**

Cover: renders the KPI summary line with correct counts from a fixture list of `InternalControl[]`; framework filter buttons narrow the table via `frameworkMappings`; domain/owner/criticality selects narrow the table; "Show gaps only" filters to `not_implemented`/`ineffective`/`partially_effective`; clicking "Add Control" opens the Dialog; submitting the form calls the mocked `useCreateControl` mutation with the entered fields.

- [ ] **Step 2: Write `controls-detail.unit.test.tsx`**

Cover: renders Overview tab fields from a fixture `InternalControl`; switching to the Mapping tab renders `frameworkMappings` rows with mapping type and AI-suggested/human-validated labels; switching to Findings tab renders a fixture `Finding[]` including a linked-risk annotation; switching to History tab renders a fixture `FrameworkActivity[]` in order.

- [ ] **Step 3: Run both**

Run: `yarn nx test client -- controls`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/routes/_dashboard/__tests__/controls.unit.test.tsx apps/client/src/routes/_dashboard/__tests__/controls-detail.unit.test.tsx
git commit -m "test(client): cover Controls list and detail pages"
```

---

### Task 20: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full affected pipeline**

Run: `yarn nx affected -t lint,build,test --base=main --head=HEAD`
Expected: all green across `shared`, `notes`, `notes-client`, `api`, `client`, `template-shared`.

- [ ] **Step 2: Manual smoke check**

Start the stack (`yarn dev`), navigate to `/controls`, confirm: KPI bar renders real numbers (not `NaN`/`undefined`), creating a control via the Dialog shows it in the table immediately, clicking a row opens `/controls/<id>` with all 7 tabs rendering without console errors, recording an assessment with `operatingEffectiveness: ineffective` produces a row in the Findings tab.

- [ ] **Step 3: Report status**

If everything above is green, this plan's scope (Controls module foundation) is complete and ready for PR against `dev` per this repo's branch workflow (`feature/controls-module-foundation` → PR into `dev`).
