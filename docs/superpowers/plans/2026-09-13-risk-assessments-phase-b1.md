# Risk Assessments (Phase B.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Risk Assessments stub into a real, org-configurable assessment module — configurable assessment types, real owner/business-unit/asset/vendor scoping, inherent→controls→residual item scoring reusing the Risk Register's methodology, and a server-enforced Owner/Approver lifecycle — replacing the hardcoded CVRA/CTRA free-text version.

**Architecture:** Same layering as Risk Register: shared types → Supabase migration (altering the existing `risk_assessments`/`risk_assessment_items` tables, adding `assessment_types` and `assessment_item_control_mappings`) → `FakeNotesStrategy` → `SupabaseNotesStrategy` → notes MS `@MessagePattern` handlers → `NotesClientService` TCP proxy → gateway REST → React Query hooks → UI. No new microservice; lives in the existing `notes` MS.

**Tech Stack:** NestJS TCP microservices, Supabase (PostgreSQL), TanStack Router, TanStack Query, shadcn/ui, react-i18next (en/es/he/ru), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-13-risk-assessments-phase-b1-design.md`

## Global Constraints

- Overlay pattern: Create = `Dialog`, Edit = `Sheet`, Delete = `AlertDialog` — three independent state variables, never combined.
- Post-coding routine before commit: `npx prettier --write <files>` → `yarn nx lint <project>` → `yarn nx build <project>` — all green before committing.
- Every new/altered table's RLS: org-scoped via `org_profiles.user_id = auth.uid()`, never `using(true)` — this exact class of bug exists TODAY on `risk_assessments`' SELECT policy (`"org members read assessments" ... using (true)`, from `20260613000003_risk_assessments.sql`) and must be fixed as part of the migration task that already alters this table, mirroring the fix applied to `risks`/`assets` during Risk Register's final review.
- Approver-gating for lifecycle transitions (`approveAssessment`, `requestChanges`) MUST be enforced at the strategy layer (Fake and Supabase both) — not only hidden in the UI. This is a direct, named lesson from Risk Register's final review, where the equivalent Risk Acceptance check needed a follow-up fix to close a server-side gap.
- Assessment code generation (`ASM-XXXXXX`) in `SupabaseNotesStrategy` MUST use a max-existing-suffix+1 query, never `count(*)` — the count-based approach was found to collide deterministically after any delete during Risk Register's final review and was fixed there; do not reintroduce it in the real DB path. `FakeNotesStrategy`'s in-memory equivalent may use the simpler count-based approach (matching Risk Register's own accepted Fake-strategy precedent) since it's ephemeral per-process dev/test state, not persisted data — Task 6 does this deliberately, not by oversight.
- Client overlay/query/route conventions: split page components into `-<name>.page.tsx` siblings from the start — the current `assessments.tsx`/`assessments_.$id.tsx` are NOT split (component inlined in the route file); this plan splits them from Task 1 of the client-side work, matching every other module in this codebase.
- All 4 locales (en/es/he/ru) updated together for every new UI string, with real translations.
- The legacy `RiskLikelihood`/`RiskImpact` string-enum types in `libs/shared/src/strategies/notes.ts` become fully dead once this plan's Fake/Supabase rebuild lands (they exist today only because this exact feature used them). The task that removes their last usage should also remove the type declarations — verify with a repo-wide grep before deleting, the same discipline used in Risk Register Task 6.

---

## File Map

**New files:**
- `apps/client/src/queries/assessment-types.ts`
- `apps/client/src/components/assessments/AssessmentTypesSheet.tsx`
- `apps/client/src/components/assessments/AssessmentItemControls.tsx`
- `apps/client/src/routes/_dashboard/-assessments.page.tsx`
- `apps/client/src/routes/_dashboard/-assessment-detail.page.tsx`
- `apps/client/src/routes/_dashboard/__tests__/assessments.unit.test.tsx`
- `apps/client/src/routes/_dashboard/__tests__/assessment-detail.unit.test.tsx`

**Modified files:**
- `libs/shared/src/strategies/notes.ts` — new/rebuilt types, extended `NotesStrategy`
- `libs/shared/src/strategies/fakes/fake-notes.ts` — in-memory implementations
- `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts` — contract tests
- `apps/microservices/notes/src/app/supabase-notes.strategy.ts` — real DB implementations
- `apps/microservices/notes/src/app/notes.controller.ts` — `@MessagePattern` handlers
- `libs/notes-client/src/lib/notes-client.service.ts` — TCP proxy methods
- `apps/api/src/app/notes/notes.controller.ts` — REST endpoints
- `apps/client/src/queries/assessments.ts` — full rebuild
- `apps/client/src/routes/_dashboard/assessments.tsx` — becomes a thin wrapper
- `apps/client/src/routes/_dashboard/assessments_.$id.tsx` — becomes a thin wrapper
- `libs/template-shared/src/lib/i18n/locales/{en,es,he,ru}.ts`
- `supabase/migrations/20260913000001_assessments_phase_b1.sql` (new migration file)

---

### Task 1: Types — Assessment Type

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

**Interfaces:**
- Produces: `AssessmentType` (interface, replacing the existing `'cvra'|'ctra'` union type of the same name), `AssessmentTypeInput`.

- [ ] **Step 1: Replace the existing `AssessmentType` union type**

Search for `export type AssessmentType = 'cvra' | 'ctra';` (in the `// ─── Risk Assessments ──` section, near line 834) and replace that single line with:

```typescript
export interface AssessmentType {
  id: string;
  orgId: string;
  name: string;
  itemNounSingular: string;
  itemNounPlural: string;
  archived: boolean;
  createdAt: string;
}

export interface AssessmentTypeInput {
  name: string;
  itemNounSingular: string;
  itemNounPlural: string;
}
```

Leave `export type AssessmentStatus = 'draft' | 'in_review' | 'completed';` untouched for now — Task 2 replaces it.

- [ ] **Step 2: Build to confirm the change compiles in isolation**

Run: `yarn nx build shared`
Expected: FAILS — `RiskAssessment.type: AssessmentType` now refers to the interface, not the old union, and `RiskAssessmentInput.type: AssessmentType` likewise; both will show type errors until Task 2 rebuilds `RiskAssessment`/`RiskAssessmentInput` to use `assessmentTypeId: string` instead. That's expected — this task's own type is correct, downstream fixes come next.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): add configurable AssessmentType, replacing the hardcoded cvra/ctra union"
```

---

### Task 2: Types — Assessment rebuild

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

**Interfaces:**
- Consumes: `AssessmentType` from Task 1; `RiskScoreLabel` (already exists from Risk Register).
- Produces: `AssessmentStatus` (rebuilt), `Assessment` (rebuilt, was `RiskAssessment`), `AssessmentInput`, `AssessmentPatch`.

- [ ] **Step 1: Replace the existing `RiskAssessment`/`RiskAssessmentInput`/`RiskAssessmentPatch` block**

Search for `export type AssessmentStatus = 'draft' | 'in_review' | 'completed';` through the end of `export interface RiskAssessmentPatch { ... }` and replace that whole block with:

```typescript
export type AssessmentStatus =
  | 'draft' | 'in_progress' | 'pending_review' | 'changes_requested'
  | 'approved' | 'completed' | 'archived';

export interface Assessment {
  id: string;
  assessmentCode: string;
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
  methodologyId: string;
  status: AssessmentStatus;
  itemCount: number;
  highestInherentScore?: number;
  highestInherentLabel?: RiskScoreLabel;
  highestResidualScore?: number;
  highestResidualLabel?: RiskScoreLabel;
  lastReviewNote?: string;
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
}
```

Note: `status` is deliberately NOT in `AssessmentPatch` — status changes only happen through the dedicated lifecycle methods added in Task 3, never through a generic patch, so each transition can carry its own precondition/role check.

Leave `RiskAssessmentItem`/`RiskAssessmentItemInput`/`RiskAssessmentItemPatch` untouched — Task 4 rebuilds those.

- [ ] **Step 2: Replace the `listAssessments`...`deleteAssessment` block in the `NotesStrategy` interface**

Search for `// Risk Assessments` through `deleteAssessment(id: string): Promise<void>;` in the interface and replace with:

```typescript
  // Assessment Types
  listAssessmentTypes(orgId: string): Promise<AssessmentType[]>;
  createAssessmentType(orgId: string, data: AssessmentTypeInput): Promise<AssessmentType>;
  archiveAssessmentType(id: string): Promise<AssessmentType>;

  // Assessments
  listAssessments(orgId: string): Promise<Assessment[]>;
  createAssessment(orgId: string, userId: string, data: AssessmentInput): Promise<Assessment>;
  getAssessment(id: string): Promise<Assessment | null>;
  updateAssessment(id: string, patch: AssessmentPatch): Promise<Assessment>;
  deleteAssessment(id: string): Promise<void>;

  // Assessment lifecycle
  startAssessment(id: string, userId: string): Promise<Assessment>;
  submitForReview(id: string, userId: string): Promise<Assessment>;
  approveAssessment(id: string, userId: string): Promise<Assessment>;
  requestChanges(id: string, userId: string, note: string): Promise<Assessment>;
  completeAssessment(id: string, userId: string): Promise<Assessment>;
  archiveAssessment(id: string, userId: string): Promise<Assessment>;

```

- [ ] **Step 3: Build**

Run: `yarn nx build shared`
Expected: still FAILS — `RiskAssessmentItem` still references the old shape indirectly via `fake-notes.ts`/`supabase-notes.strategy.ts`, and the new lifecycle/type methods aren't implemented yet. Expected at this point.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): rebuild Assessment type and add lifecycle methods to NotesStrategy"
```

---

### Task 3: Types — Assessment Item rebuild and Item↔Control mapping

**Files:**
- Modify: `libs/shared/src/strategies/notes.ts`

**Interfaces:**
- Consumes: `RiskScoreLabel` (existing).
- Produces: `AssessmentItem` (rebuilt, was `RiskAssessmentItem`), `AssessmentItemInput`, `AssessmentItemPatch`, `AssessmentItemControlMapping`, `AssessmentItemControlMappingInput`.

- [ ] **Step 1: Replace the existing `RiskAssessmentItem`/`RiskAssessmentItemInput`/`RiskAssessmentItemPatch` block**

Search for `export interface RiskAssessmentItem {` through the end of `export interface RiskAssessmentItemPatch { ... }` and replace with:

```typescript
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

// ─── Assessment Item ↔ Control ──────────────────────────────────────────────

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

- [ ] **Step 2: Replace the `listAssessmentItems`...`deleteAssessmentItem` block in `NotesStrategy`**

Search for `// Assessment items` through `deleteAssessmentItem(id: string): Promise<void>;` and replace with:

```typescript
  // Assessment items
  listAssessmentItems(assessmentId: string): Promise<AssessmentItem[]>;
  createAssessmentItem(assessmentId: string, data: AssessmentItemInput): Promise<AssessmentItem>;
  updateAssessmentItem(id: string, patch: AssessmentItemPatch): Promise<AssessmentItem>;
  deleteAssessmentItem(id: string): Promise<void>;

  // Item <-> control mapping
  listAssessmentItemControlMappings(itemId: string): Promise<AssessmentItemControlMapping[]>;
  addAssessmentItemControlMapping(
    itemId: string,
    data: AssessmentItemControlMappingInput,
  ): Promise<AssessmentItemControlMapping>;
  removeAssessmentItemControlMapping(id: string): Promise<void>;

```

Note the rename `addAssessmentItem` → `createAssessmentItem` for naming consistency with `createAssessment`/`createAssessmentType` — every call site across every later layer in this plan uses `createAssessmentItem`.

- [ ] **Step 3: Check whether `RiskLikelihood`/`RiskImpact` are now fully dead**

Run: `grep -rn "RiskLikelihood\|RiskImpact" libs/ apps/ --include="*.ts" --include="*.tsx" | grep -v "__tests__"`

If the only remaining references are the type declarations themselves (`export type RiskLikelihood = ...`, `export type RiskImpact = ...`) in `notes.ts`, delete those two lines — they're dead code now. If any other file still references them (it shouldn't, since `AssessmentItem` no longer uses them after this task), leave them and note it in your report.

- [ ] **Step 4: Build**

Run: `yarn nx build shared`
Expected: still FAILS — `fake-notes.ts`/`supabase-notes.strategy.ts` don't implement the new interface methods yet. Expected.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/strategies/notes.ts
git commit -m "feat(shared): rebuild AssessmentItem, add Item-Control mapping, drop dead RiskLikelihood/RiskImpact"
```

---

### Task 4: Supabase migration — assessment types, altered tables, item-control mapping

**Files:**
- Create: `supabase/migrations/20260913000001_assessments_phase_b1.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Assessment Types: org-configurable, replaces the hardcoded cvra/ctra enum.
create table public.assessment_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  name text not null,
  item_noun_singular text not null,
  item_noun_plural text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create index assessment_types_org_idx on public.assessment_types(org_id);

alter table public.assessment_types enable row level security;

create policy "org members read assessment types"
  on public.assessment_types for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own assessment types"
  on public.assessment_types for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Seed two default types per org that already has assessments, matching the
-- existing hardcoded cvra/ctra values so the backfill below can map to them.
insert into public.assessment_types (org_id, name, item_noun_singular, item_noun_plural)
select distinct org_id, 'Cyber Vulnerability Risk Assessment', 'Vulnerability', 'Vulnerabilities'
from public.risk_assessments
on conflict (org_id, name) do nothing;

insert into public.assessment_types (org_id, name, item_noun_singular, item_noun_plural)
select distinct org_id, 'Cyber Threat Risk Assessment', 'Threat Scenario', 'Threat Scenarios'
from public.risk_assessments
on conflict (org_id, name) do nothing;

-- Alter risk_assessments: add the new columns, backfill, fix the pre-existing
-- using(true) SELECT policy while we're already touching this table's RLS.
alter table public.risk_assessments
  alter column type drop not null,
  drop constraint if exists risk_assessments_type_check,
  add column assessment_code text,
  add column assessment_type_id uuid references public.assessment_types(id) on delete set null,
  add column owner_id uuid,
  add column business_unit text,
  add column asset_ids uuid[] not null default '{}',
  add column vendor_ids uuid[] not null default '{}',
  add column due_date timestamptz,
  add column approver_id uuid,
  add column methodology_id uuid references public.risk_methodologies(id) on delete set null,
  add column highest_inherent_score int,
  add column highest_inherent_label text check (highest_inherent_label in ('low','medium','high','critical')),
  add column highest_residual_score int,
  add column highest_residual_label text check (highest_residual_label in ('low','medium','high','critical')),
  add column last_review_note text;

alter table public.risk_assessments drop constraint if exists risk_assessments_status_check;
alter table public.risk_assessments
  add constraint risk_assessments_status_check
  check (status in ('draft','in_progress','pending_review','changes_requested','approved','completed','archived'));

update public.risk_assessments r
set
  assessment_code = 'ASM-' || lpad((row_number() over (partition by r.org_id order by r.created_at))::text, 6, '0'),
  assessment_type_id = (
    select at.id from public.assessment_types at
    where at.org_id = r.org_id
      and at.name = case when r.type = 'ctra' then 'Cyber Threat Risk Assessment' else 'Cyber Vulnerability Risk Assessment' end
  ),
  owner_id = r.user_id,
  methodology_id = (select id from public.risk_methodologies m where m.org_id = r.org_id and m.is_active),
  status = case r.status when 'in_review' then 'pending_review' else r.status end,
  highest_inherent_score = r.risk_score
where r.assessment_code is null;

alter table public.risk_assessments
  alter column assessment_code set not null,
  alter column owner_id set not null,
  add constraint risk_assessments_code_unique unique (org_id, assessment_code);

create index risk_assessments_type_idx on public.risk_assessments(assessment_type_id);
create index risk_assessments_owner_idx on public.risk_assessments(owner_id);
create index risk_assessments_status_idx on public.risk_assessments(status);

drop policy if exists "org members read assessments" on public.risk_assessments;
create policy "org members read assessments"
  on public.risk_assessments for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Alter risk_assessment_items: add inherent/residual scoring columns.
with likelihood_map(old_val, num) as (
  values ('very_low',1), ('low',2), ('medium',3), ('high',4), ('very_high',5)
)
alter table public.risk_assessment_items
  add column inherent_likelihood int,
  add column inherent_impact int,
  add column inherent_score int,
  add column inherent_label text check (inherent_label in ('low','medium','high','critical')),
  add column residual_likelihood int,
  add column residual_impact int,
  add column residual_score int,
  add column residual_label text check (residual_label in ('low','medium','high','critical'));

with likelihood_map(old_val, num) as (
  values ('very_low',1), ('low',2), ('medium',3), ('high',4), ('very_high',5)
)
update public.risk_assessment_items i
set
  inherent_likelihood = (select num from likelihood_map where old_val = i.likelihood::text),
  inherent_impact = (select num from likelihood_map where old_val = i.impact::text),
  inherent_score = i.item_score,
  inherent_label = case
    when i.item_score <= 4 then 'low' when i.item_score <= 9 then 'medium'
    when i.item_score <= 16 then 'high' else 'critical' end
where i.inherent_likelihood is null;

alter table public.risk_assessment_items
  alter column inherent_likelihood set not null,
  alter column inherent_impact set not null,
  alter column inherent_score set not null,
  alter column inherent_label set not null;

-- Item <-> Control mapping (reuses the risk_control_mappings pattern).
create table public.assessment_item_control_mappings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.risk_assessment_items(id) on delete cascade,
  control_id uuid not null references public.internal_controls(id) on delete cascade,
  control_code text not null,
  control_title text not null,
  effectiveness_note text,
  created_at timestamptz not null default now(),
  unique (item_id, control_id)
);

create index assessment_item_control_mappings_item_idx on public.assessment_item_control_mappings(item_id);
create index assessment_item_control_mappings_control_idx on public.assessment_item_control_mappings(control_id);

alter table public.assessment_item_control_mappings enable row level security;

create policy "org members read assessment item control mappings"
  on public.assessment_item_control_mappings for select using (
    exists (
      select 1 from public.risk_assessment_items i
      join public.risk_assessments ra on ra.id = i.assessment_id
      join public.org_profiles o on o.id = ra.org_id
      where i.id = item_id and o.user_id = auth.uid()
    )
  );

create policy "users manage own assessment item control mappings"
  on public.assessment_item_control_mappings for all using (
    exists (
      select 1 from public.risk_assessment_items i
      join public.risk_assessments ra on ra.id = i.assessment_id
      join public.org_profiles o on o.id = ra.org_id
      where i.id = item_id and o.user_id = auth.uid()
    )
    and exists (
      select 1 from public.internal_controls c
      join public.risk_assessment_items i2 on i2.id = item_id
      join public.risk_assessments ra2 on ra2.id = i2.assessment_id
      where c.id = control_id and c.org_id = ra2.org_id
    )
  );
```

- [ ] **Step 2: Verify**

No live Supabase/Docker instance is expected in this environment (confirmed absent during Risk Register's implementation) — do the same manual re-read fallback: cross-check every column name against what later tasks' mappers will reference, confirm every FK target exists (either earlier in this file or in `20260912000001_internal_controls.sql`/`20260912000002_risk_register.sql`/`20260613000003_risk_assessments.sql`), confirm the two `alter table ... add column` / `update ... set` blocks reference exactly the same column names, and confirm the `risk_assessments_status_check`/`risk_assessments_type_check` constraint names match Postgres's default auto-naming convention for unnamed inline `check` clauses (verify against the original `20260613000003_risk_assessments.sql` — both were declared as unnamed inline checks, so the default names are correct). Report DONE_WITH_CONCERNS if no live apply was possible.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260913000001_assessments_phase_b1.sql
git commit -m "feat(db): assessment types, item-control mapping, assessment lifecycle columns"
```

---

### Task 5: `FakeNotesStrategy` — Assessment Type

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

**Interfaces:**
- Consumes: `AssessmentType`, `AssessmentTypeInput` from Task 1.
- Produces: `listAssessmentTypes`, `createAssessmentType`, `archiveAssessmentType`.

- [ ] **Step 1: Update type imports**

Add `AssessmentType`, `AssessmentTypeInput` to the `import type { ... } from '../notes'` block. Remove the old bare `AssessmentType` import if it was imported as a type-only union before (check — it likely wasn't separately imported since it's defined in the same file's scope via re-export, verify by reading the current import block first).

- [ ] **Step 2: Add a private store next to `private assessments: RiskAssessment[] = [];` (search for it) — rename that store's declared type as part of Task 6, for now just add the new store**

```typescript
  private assessmentTypes: AssessmentType[] = [];
```

- [ ] **Step 3: Add the methods near the existing assessment methods**

```typescript
  async listAssessmentTypes(orgId: string): Promise<AssessmentType[]> {
    const existing = this.assessmentTypes.filter((t) => t.orgId === orgId);
    if (existing.length > 0) return existing;
    const defaults: Array<[string, string, string]> = [
      ['Cyber Vulnerability Risk Assessment', 'Vulnerability', 'Vulnerabilities'],
      ['Cyber Threat Risk Assessment', 'Threat Scenario', 'Threat Scenarios'],
    ];
    const seeded = defaults.map(([name, singular, plural]) => ({
      id: `atype-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      name,
      itemNounSingular: singular,
      itemNounPlural: plural,
      archived: false,
      createdAt: new Date().toISOString(),
    }));
    this.assessmentTypes.push(...seeded);
    return seeded;
  }

  async createAssessmentType(orgId: string, data: AssessmentTypeInput): Promise<AssessmentType> {
    const type: AssessmentType = {
      id: `atype-${globalThis.crypto.randomUUID().slice(0, 8)}`,
      orgId,
      name: data.name,
      itemNounSingular: data.itemNounSingular,
      itemNounPlural: data.itemNounPlural,
      archived: false,
      createdAt: new Date().toISOString(),
    };
    this.assessmentTypes.push(type);
    return type;
  }

  async archiveAssessmentType(id: string): Promise<AssessmentType> {
    const type = this.assessmentTypes.find((t) => t.id === id);
    if (!type) throw new Error(`assessment_type_not_found: ${id}`);
    type.archived = true;
    return type;
  }

```

- [ ] **Step 4: Build**

Run: `yarn nx build shared`
Expected: still FAILS — `RiskAssessment`/`RiskAssessmentInput` type mismatches in the existing `listAssessments`/`createAssessment`/etc. methods (Task 6's job), and the new lifecycle/item methods aren't implemented yet. Expected.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): add configurable AssessmentType to FakeNotesStrategy"
```

---

### Task 6: `FakeNotesStrategy` — Assessment CRUD rebuild

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

**Interfaces:**
- Consumes: `Assessment`, `AssessmentInput`, `AssessmentPatch` from Task 2; `getRiskMethodology` (existing, from Risk Register).
- Produces: rebuilt `createAssessment`/`getAssessment`/`updateAssessment`/`deleteAssessment`/`listAssessments`.

- [ ] **Step 1: Rename the private store's type**

Find `private assessments: RiskAssessment[] = [];` and change to:

```typescript
  private assessments: Assessment[] = [];
```

- [ ] **Step 2: Replace `createAssessment` entirely (search for `async createAssessment`)**

```typescript
  async createAssessment(orgId: string, userId: string, data: AssessmentInput): Promise<Assessment> {
    const methodology = await this.getRiskMethodology(orgId);
    if (!methodology) throw new Error('risk_methodology_not_found');
    const orgAssessmentCount = this.assessments.filter((a) => a.orgId === orgId).length;
    const assessment: Assessment = {
      id: globalThis.crypto.randomUUID(),
      assessmentCode: `ASM-${String(orgAssessmentCount + 101).padStart(6, '0')}`,
      orgId,
      userId,
      title: data.title,
      assessmentTypeId: data.assessmentTypeId,
      ownerId: data.ownerId,
      businessUnit: data.businessUnit,
      assetIds: data.assetIds ?? [],
      vendorIds: data.vendorIds ?? [],
      dueDate: data.dueDate,
      approverId: data.approverId,
      methodologyId: methodology.id,
      status: 'draft',
      itemCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.assessments.push(assessment);
    return assessment;
  }

```

- [ ] **Step 3: Replace `updateAssessment` entirely (search for `async updateAssessment`)**

```typescript
  async updateAssessment(id: string, patch: AssessmentPatch): Promise<Assessment> {
    const assessment = this.assessments.find((a) => a.id === id);
    if (!assessment) throw new Error(`assessment_not_found: ${id}`);
    Object.assign(assessment, patch);
    assessment.updatedAt = new Date().toISOString();
    return assessment;
  }

```

- [ ] **Step 4: Leave `getAssessment`/`listAssessments`/`deleteAssessment` untouched** — their existing bodies already work correctly against the rebuilt `Assessment` shape.

- [ ] **Step 5: Build**

Run: `yarn nx build shared`
Expected: still FAILS — lifecycle methods and item methods aren't implemented yet (Tasks 7-8). Expected.

- [ ] **Step 6: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): rebuild FakeNotesStrategy Assessment CRUD with methodology pinning"
```

---

### Task 7: `FakeNotesStrategy` — Assessment lifecycle transitions

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

**Interfaces:**
- Consumes: `Assessment` (Task 2/6).
- Produces: `startAssessment`, `submitForReview`, `approveAssessment`, `requestChanges`, `completeAssessment`, `archiveAssessment`.

- [ ] **Step 1: Add the methods (place them right after `updateAssessment`)**

```typescript
  async startAssessment(id: string, userId: string): Promise<Assessment> {
    const a = this.assessments.find((x) => x.id === id);
    if (!a) throw new Error(`assessment_not_found: ${id}`);
    if (a.ownerId !== userId) throw new Error('not_authorized_owner');
    if (a.status !== 'draft') throw new Error(`invalid_transition_from_${a.status}`);
    a.status = 'in_progress';
    a.updatedAt = new Date().toISOString();
    return a;
  }

  async submitForReview(id: string, userId: string): Promise<Assessment> {
    const a = this.assessments.find((x) => x.id === id);
    if (!a) throw new Error(`assessment_not_found: ${id}`);
    if (a.ownerId !== userId) throw new Error('not_authorized_owner');
    if (a.status !== 'in_progress' && a.status !== 'changes_requested') {
      throw new Error(`invalid_transition_from_${a.status}`);
    }
    if (!a.approverId) throw new Error('approver_required');
    if (a.itemCount < 1) throw new Error('at_least_one_item_required');
    a.status = 'pending_review';
    a.updatedAt = new Date().toISOString();
    return a;
  }

  async approveAssessment(id: string, userId: string): Promise<Assessment> {
    const a = this.assessments.find((x) => x.id === id);
    if (!a) throw new Error(`assessment_not_found: ${id}`);
    if (a.status !== 'pending_review') throw new Error(`invalid_transition_from_${a.status}`);
    if (a.approverId !== userId) throw new Error('not_authorized_approver');
    a.status = 'approved';
    a.updatedAt = new Date().toISOString();
    return a;
  }

  async requestChanges(id: string, userId: string, note: string): Promise<Assessment> {
    const a = this.assessments.find((x) => x.id === id);
    if (!a) throw new Error(`assessment_not_found: ${id}`);
    if (a.status !== 'pending_review') throw new Error(`invalid_transition_from_${a.status}`);
    if (a.approverId !== userId) throw new Error('not_authorized_approver');
    a.status = 'changes_requested';
    a.lastReviewNote = note;
    a.updatedAt = new Date().toISOString();
    return a;
  }

  async completeAssessment(id: string, userId: string): Promise<Assessment> {
    const a = this.assessments.find((x) => x.id === id);
    if (!a) throw new Error(`assessment_not_found: ${id}`);
    if (a.ownerId !== userId) throw new Error('not_authorized_owner');
    if (a.status !== 'approved') throw new Error(`invalid_transition_from_${a.status}`);
    a.status = 'completed';
    a.updatedAt = new Date().toISOString();
    return a;
  }

  async archiveAssessment(id: string, userId: string): Promise<Assessment> {
    const a = this.assessments.find((x) => x.id === id);
    if (!a) throw new Error(`assessment_not_found: ${id}`);
    if (a.ownerId !== userId) throw new Error('not_authorized_owner');
    if (a.status !== 'draft' && a.status !== 'completed') {
      throw new Error(`invalid_transition_from_${a.status}`);
    }
    a.status = 'archived';
    a.updatedAt = new Date().toISOString();
    return a;
  }

```

- [ ] **Step 2: Build**

Run: `yarn nx build shared`
Expected: still FAILS — item methods aren't implemented yet (Task 8). Expected.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): add server-enforced Assessment lifecycle transitions to FakeNotesStrategy"
```

---

### Task 8: `FakeNotesStrategy` — Assessment Item CRUD rebuild with summary recompute

**Files:**
- Modify: `libs/shared/src/strategies/fakes/fake-notes.ts`

**Interfaces:**
- Consumes: `AssessmentItem`, `AssessmentItemInput`, `AssessmentItemPatch` (Task 3); `getRiskMethodology`, `scoreRisk`-style threshold lookup (existing helper from Risk Register — reuse its logic, do not duplicate a second copy if it's already a shared private method; if `scoreRisk` is a private method on the class already, call it directly).

- [ ] **Step 1: Rename the private items store's type**

Find `private assessmentItems: RiskAssessmentItem[] = [];` and change to:

```typescript
  private assessmentItems: AssessmentItem[] = [];
```

- [ ] **Step 2: Replace `createAssessmentItem` (was `addAssessmentItem`) entirely — search for `async addAssessmentItem`**

```typescript
  async createAssessmentItem(assessmentId: string, data: AssessmentItemInput): Promise<AssessmentItem> {
    const assessment = this.assessments.find((a) => a.id === assessmentId);
    if (!assessment) throw new Error(`assessment_not_found: ${assessmentId}`);
    const methodology = this.riskMethodologies.find((m) => m.id === assessment.methodologyId);
    if (!methodology) throw new Error('risk_methodology_not_found');
    const { score, label } = this.scoreRisk(methodology, data.inherentLikelihood, data.inherentImpact);
    const item: AssessmentItem = {
      id: globalThis.crypto.randomUUID(),
      assessmentId,
      orgId: assessment.orgId,
      subject: data.subject,
      description: data.description,
      inherentLikelihood: data.inherentLikelihood,
      inherentImpact: data.inherentImpact,
      inherentScore: score,
      inherentLabel: label,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.assessmentItems.push(item);
    this.recomputeAssessmentSummary(assessmentId);
    return item;
  }

  private recomputeAssessmentSummary(assessmentId: string): void {
    const assessment = this.assessments.find((a) => a.id === assessmentId);
    if (!assessment) return;
    const items = this.assessmentItems.filter((i) => i.assessmentId === assessmentId);
    assessment.itemCount = items.length;
    if (items.length === 0) {
      assessment.highestInherentScore = undefined;
      assessment.highestInherentLabel = undefined;
      assessment.highestResidualScore = undefined;
      assessment.highestResidualLabel = undefined;
      return;
    }
    const topInherent = items.reduce((max, i) => (i.inherentScore > max.inherentScore ? i : max));
    assessment.highestInherentScore = topInherent.inherentScore;
    assessment.highestInherentLabel = topInherent.inherentLabel;
    const withResidual = items.filter((i) => i.residualScore !== undefined);
    if (withResidual.length > 0) {
      const topResidual = withResidual.reduce((max, i) =>
        (i.residualScore ?? 0) > (max.residualScore ?? 0) ? i : max,
      );
      assessment.highestResidualScore = topResidual.residualScore;
      assessment.highestResidualLabel = topResidual.residualLabel;
    }
  }

```

Note: this task assumes a private `scoreRisk(methodology, likelihood, impact)` helper already exists on this class from Risk Register (it does — added in Risk Register Task 6). If for any reason it's not accessible (e.g., was declared with a narrower scope), inline the same threshold-lookup logic here instead of duplicating a second differently-named helper.

- [ ] **Step 3: Replace `updateAssessmentItem` entirely**

```typescript
  async updateAssessmentItem(id: string, patch: AssessmentItemPatch): Promise<AssessmentItem> {
    const item = this.assessmentItems.find((i) => i.id === id);
    if (!item) throw new Error(`assessment_item_not_found: ${id}`);
    const assessment = this.assessments.find((a) => a.id === item.assessmentId);
    if (!assessment) throw new Error(`assessment_not_found: ${item.assessmentId}`);
    const methodology = this.riskMethodologies.find((m) => m.id === assessment.methodologyId);

    Object.assign(item, patch);

    if (methodology) {
      if (patch.inherentLikelihood !== undefined || patch.inherentImpact !== undefined) {
        const { score, label } = this.scoreRisk(methodology, item.inherentLikelihood, item.inherentImpact);
        item.inherentScore = score;
        item.inherentLabel = label;
      }
      if (
        (patch.residualLikelihood !== undefined || patch.residualImpact !== undefined) &&
        item.residualLikelihood !== undefined &&
        item.residualImpact !== undefined
      ) {
        const { score, label } = this.scoreRisk(methodology, item.residualLikelihood, item.residualImpact);
        item.residualScore = score;
        item.residualLabel = label;
      }
    }

    item.updatedAt = new Date().toISOString();
    this.recomputeAssessmentSummary(item.assessmentId);
    return item;
  }

```

- [ ] **Step 4: Replace `deleteAssessmentItem` entirely**

```typescript
  async deleteAssessmentItem(id: string): Promise<void> {
    const item = this.assessmentItems.find((i) => i.id === id);
    if (!item) return;
    this.assessmentItems = this.assessmentItems.filter((i) => i.id !== id);
    this.recomputeAssessmentSummary(item.assessmentId);
  }

```

- [ ] **Step 5: Leave `listAssessmentItems` untouched** — it already works against the rebuilt shape.

- [ ] **Step 6: Add the item-control mapping methods and their private store**

Add the store next to `private assessmentItems`:

```typescript
  private assessmentItemControlMappings: AssessmentItemControlMapping[] = [];
```

Add the methods after `deleteAssessmentItem`:

```typescript
  async listAssessmentItemControlMappings(itemId: string): Promise<AssessmentItemControlMapping[]> {
    return this.assessmentItemControlMappings.filter((m) => m.itemId === itemId);
  }

  async addAssessmentItemControlMapping(
    itemId: string,
    data: AssessmentItemControlMappingInput,
  ): Promise<AssessmentItemControlMapping> {
    const mapping: AssessmentItemControlMapping = {
      id: globalThis.crypto.randomUUID(),
      itemId,
      ...data,
      createdAt: new Date().toISOString(),
    };
    this.assessmentItemControlMappings.push(mapping);
    return mapping;
  }

  async removeAssessmentItemControlMapping(id: string): Promise<void> {
    this.assessmentItemControlMappings = this.assessmentItemControlMappings.filter((m) => m.id !== id);
  }

```

- [ ] **Step 7: Build**

Run: `yarn nx build shared`
Expected: PASS — `FakeNotesStrategy` now fully implements the extended `NotesStrategy` interface.

- [ ] **Step 8: Commit**

```bash
git add libs/shared/src/strategies/fakes/fake-notes.ts
git commit -m "feat(shared): rebuild FakeNotesStrategy AssessmentItem CRUD with summary recompute and control mapping"
```

---

### Task 9: Contract tests for the new `FakeNotesStrategy` methods

**Files:**
- Modify: `libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts`

- [ ] **Step 1: Find and update the existing "risk assessments" describe block**

Search for the existing assessments-related `describe` block in this file (it currently tests the old `type`/`scope`/`likelihood`/`impact` shape) and replace its test bodies to match the new shape — do not just delete it, since it's the only existing coverage; adapt each existing test case to use `assessmentTypeId`/`ownerId`/`inherentLikelihood`/`inherentImpact` instead of the old fields, following the same "read the old test, understand its intent, port it to the new shape" approach used when Risk Register's Task 6 handled an analogous stale-test situation.

- [ ] **Step 2: Add new tests covering the rebuilt behavior**

```typescript
describe('Assessment lifecycle (Phase B.1)', () => {
  it('seeds two default assessment types on first access', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    expect(types).toHaveLength(2);
    expect(types.map((t) => t.itemNounSingular).sort()).toEqual(['Threat Scenario', 'Vulnerability']);
  });

  it('creates an assessment with an auto-generated code and pinned methodology', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'user-1', {
      title: 'Q1 Vulnerability Sweep',
      assessmentTypeId: types[0]!.id,
      ownerId: 'user-1',
    });
    expect(assessment.assessmentCode).toMatch(/^ASM-\d{6}$/);
    expect(assessment.status).toBe('draft');
    expect(assessment.methodologyId).toBeTruthy();
    expect(assessment.itemCount).toBe(0);
  });

  it('adding an item scores it and recomputes the assessment summary', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'user-1', {
      title: 'Assessment', assessmentTypeId: types[0]!.id, ownerId: 'user-1',
    });
    const item = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Unpatched Log4j', description: 'CVE-2025-XXXX on web-01',
      inherentLikelihood: 4, inherentImpact: 4,
    });
    expect(item.inherentScore).toBe(16);
    const refreshed = await strategy.getAssessment(assessment.id);
    expect(refreshed?.itemCount).toBe(1);
    expect(refreshed?.highestInherentScore).toBe(16);
  });

  it('links a control to an item, and manual residual scoring works after linking', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'user-1', {
      title: 'Assessment', assessmentTypeId: types[0]!.id, ownerId: 'user-1',
    });
    const item = await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject', description: 'Description', inherentLikelihood: 4, inherentImpact: 4,
    });

    await strategy.addAssessmentItemControlMapping(item.id, {
      controlId: 'ctrl-1', controlCode: 'VULN-001', controlTitle: 'Patch Management',
    });
    expect((await strategy.listAssessmentItemControlMappings(item.id))).toHaveLength(1);

    const updated = await strategy.updateAssessmentItem(item.id, {
      residualLikelihood: 2, residualImpact: 3,
    });
    expect(updated.residualScore).toBe(6);

    const refreshed = await strategy.getAssessment(assessment.id);
    expect(refreshed?.highestResidualScore).toBe(6);
  });

  it('enforces the full lifecycle with owner/approver gating', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Assessment', assessmentTypeId: types[0]!.id, ownerId: 'owner-1', approverId: 'approver-1',
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject', description: 'Description', inherentLikelihood: 3, inherentImpact: 3,
    });

    await strategy.startAssessment(assessment.id, 'owner-1');
    const submitted = await strategy.submitForReview(assessment.id, 'owner-1');
    expect(submitted.status).toBe('pending_review');

    await expect(strategy.approveAssessment(assessment.id, 'owner-1')).rejects.toThrow(
      'not_authorized_approver',
    );

    const approved = await strategy.approveAssessment(assessment.id, 'approver-1');
    expect(approved.status).toBe('approved');

    const completed = await strategy.completeAssessment(assessment.id, 'owner-1');
    expect(completed.status).toBe('completed');

    const archived = await strategy.archiveAssessment(assessment.id, 'owner-1');
    expect(archived.status).toBe('archived');
  });

  it('requestChanges records a note and returns the assessment to changes_requested', async () => {
    const strategy = new FakeNotesStrategy();
    const types = await strategy.listAssessmentTypes('org-1');
    const assessment = await strategy.createAssessment('org-1', 'owner-1', {
      title: 'Assessment', assessmentTypeId: types[0]!.id, ownerId: 'owner-1', approverId: 'approver-1',
    });
    await strategy.createAssessmentItem(assessment.id, {
      subject: 'Subject', description: 'Description', inherentLikelihood: 3, inherentImpact: 3,
    });
    await strategy.startAssessment(assessment.id, 'owner-1');
    await strategy.submitForReview(assessment.id, 'owner-1');

    const changed = await strategy.requestChanges(assessment.id, 'approver-1', 'Add mitigations');
    expect(changed.status).toBe('changes_requested');
    expect(changed.lastReviewNote).toBe('Add mitigations');

    const resubmitted = await strategy.submitForReview(assessment.id, 'owner-1');
    expect(resubmitted.status).toBe('pending_review');
  });
});
```

- [ ] **Step 2: Run to verify all pass**

Run: `yarn nx test shared -- fake-notes.contract`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/shared/src/strategies/__tests__/fake-notes.contract.unit.test.ts
git commit -m "test(shared): cover Assessment type seeding, scoring, summary recompute, and lifecycle gating"
```

---

### Task 10: `SupabaseNotesStrategy` — Assessment Type

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

**Interfaces:**
- Consumes: `assessment_types` table (Task 4); `AssessmentType`, `AssessmentTypeInput` (Task 1).

- [ ] **Step 1: Add the methods, following the file's existing conventions (verify against `listRiskTaxonomy`/`createRiskTaxonomyCategory` from Risk Register for the exact reference pattern — same lazy-seed-on-empty-list approach applies here)**

```typescript
  async listAssessmentTypes(orgId: string): Promise<AssessmentType[]> {
    const { data, error } = await this.db
      .from('assessment_types')
      .select('*')
      .eq('org_id', orgId)
      .order('name');
    const rows = ok(data, error);
    if (rows.length > 0) return rows.map((r) => this.toAssessmentType(r));

    const defaults: Array<[string, string, string]> = [
      ['Cyber Vulnerability Risk Assessment', 'Vulnerability', 'Vulnerabilities'],
      ['Cyber Threat Risk Assessment', 'Threat Scenario', 'Threat Scenarios'],
    ];
    const { data: inserted, error: insertError } = await this.db
      .from('assessment_types')
      .insert(
        defaults.map(([name, singular, plural]) => ({
          org_id: orgId,
          name,
          item_noun_singular: singular,
          item_noun_plural: plural,
        })),
      )
      .select();
    return ok(inserted, insertError).map((r) => this.toAssessmentType(r));
  }

  async createAssessmentType(orgId: string, data: AssessmentTypeInput): Promise<AssessmentType> {
    const { data: row, error } = await this.db
      .from('assessment_types')
      .insert({
        org_id: orgId,
        name: data.name,
        item_noun_singular: data.itemNounSingular,
        item_noun_plural: data.itemNounPlural,
      })
      .select()
      .single();
    return this.toAssessmentType(ok(row, error));
  }

  async archiveAssessmentType(id: string): Promise<AssessmentType> {
    const { data, error } = await this.db
      .from('assessment_types')
      .update({ archived: true })
      .eq('id', id)
      .select()
      .single();
    return this.toAssessmentType(ok(data, error));
  }

  private toAssessmentType(row: Record<string, unknown>): AssessmentType {
    return {
      id: row['id'] as string,
      orgId: row['org_id'] as string,
      name: row['name'] as string,
      itemNounSingular: row['item_noun_singular'] as string,
      itemNounPlural: row['item_noun_plural'] as string,
      archived: row['archived'] as boolean,
      createdAt: row['created_at'] as string,
    };
  }
```

Add `AssessmentType`, `AssessmentTypeInput` to this file's `@icore/shared` type imports.

- [ ] **Step 2: Build**

Run: `yarn nx build notes`
Expected: still shows errors for the not-yet-implemented Assessment CRUD rebuild / lifecycle / item methods (Tasks 11-13) — expected.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): persist configurable AssessmentType in Supabase"
```

---

### Task 11: `SupabaseNotesStrategy` — Assessment CRUD rebuild and lifecycle transitions

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

**Interfaces:**
- Consumes: `getRiskMethodology` (existing, Risk Register); altered `risk_assessments` table (Task 4).
- Produces: rebuilt `createAssessment`/`toAssessment` mapper/`updateAssessment`, plus the 6 lifecycle methods.

- [ ] **Step 1: Replace `createAssessment` entirely**

```typescript
  async createAssessment(orgId: string, userId: string, data: AssessmentInput): Promise<Assessment> {
    const methodology = await this.getRiskMethodology(orgId);
    if (!methodology) throw new Error('risk_methodology_not_found');
    const { data: existing, error: countError } = await this.db
      .from('risk_assessments')
      .select('assessment_code')
      .eq('org_id', orgId)
      .order('assessment_code', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (countError) throw new Error(countError.message);
    const maxSuffix = existing?.assessment_code
      ? parseInt(String(existing.assessment_code).replace('ASM-', ''), 10)
      : 100;
    const assessmentCode = `ASM-${String(maxSuffix + 1).padStart(6, '0')}`;

    const { data: row, error } = await this.db
      .from('risk_assessments')
      .insert({
        org_id: orgId,
        user_id: userId,
        assessment_code: assessmentCode,
        title: data.title,
        assessment_type_id: data.assessmentTypeId,
        owner_id: data.ownerId,
        business_unit: data.businessUnit ?? null,
        asset_ids: data.assetIds ?? [],
        vendor_ids: data.vendorIds ?? [],
        due_date: data.dueDate ?? null,
        approver_id: data.approverId ?? null,
        methodology_id: methodology.id,
        status: 'draft',
        // legacy columns kept populated so the pre-existing NOT NULL/CHECK
        // constraints on this table are satisfied without altering them:
        type: 'cvra',
        scope: '',
      })
      .select()
      .single();
    return this.toAssessment(ok(row, error));
  }
```

Note: this uses the max-suffix approach directly (learned from Risk Register's post-merge fix), not the count-based approach Risk Register's `createRisk` originally shipped with.

- [ ] **Step 2: Replace the row-to-object mapper — find `private toAssessment` (or add it if the mapping is currently inlined in `getAssessment`/`listAssessments`)**

```typescript
  private toAssessment(row: Record<string, unknown>): Assessment {
    return {
      id: row['id'] as string,
      assessmentCode: row['assessment_code'] as string,
      orgId: row['org_id'] as string,
      userId: row['user_id'] as string,
      title: row['title'] as string,
      assessmentTypeId: row['assessment_type_id'] as string,
      ownerId: row['owner_id'] as string,
      businessUnit: row['business_unit'] as string | undefined,
      assetIds: (row['asset_ids'] as string[]) ?? [],
      vendorIds: (row['vendor_ids'] as string[]) ?? [],
      dueDate: row['due_date'] as string | undefined,
      approverId: row['approver_id'] as string | undefined,
      methodologyId: row['methodology_id'] as string,
      status: row['status'] as AssessmentStatus,
      itemCount: row['item_count'] as number,
      highestInherentScore: row['highest_inherent_score'] as number | undefined,
      highestInherentLabel: row['highest_inherent_label'] as RiskScoreLabel | undefined,
      highestResidualScore: row['highest_residual_score'] as number | undefined,
      highestResidualLabel: row['highest_residual_label'] as RiskScoreLabel | undefined,
      lastReviewNote: row['last_review_note'] as string | undefined,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
```

- [ ] **Step 3: Replace `updateAssessment` entirely**

```typescript
  async updateAssessment(id: string, patch: AssessmentPatch): Promise<Assessment> {
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.title !== undefined) update['title'] = patch.title;
    if (patch.ownerId !== undefined) update['owner_id'] = patch.ownerId;
    if (patch.businessUnit !== undefined) update['business_unit'] = patch.businessUnit;
    if (patch.assetIds !== undefined) update['asset_ids'] = patch.assetIds;
    if (patch.vendorIds !== undefined) update['vendor_ids'] = patch.vendorIds;
    if (patch.dueDate !== undefined) update['due_date'] = patch.dueDate;
    if (patch.approverId !== undefined) update['approver_id'] = patch.approverId;

    const { data, error } = await this.db
      .from('risk_assessments')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    return this.toAssessment(ok(data, error));
  }
```

- [ ] **Step 4: Leave `getAssessment`/`listAssessments`/`deleteAssessment` bodies untouched** — only `toAssessment` (Step 2) needed to change; they already call it correctly.

- [ ] **Step 5: Add the 6 lifecycle methods, each enforcing its precondition via a conditional update (so the check is atomic with the write, not a separate fetch-then-write race)**

```typescript
  async startAssessment(id: string, userId: string): Promise<Assessment> {
    const { data, error } = await this.db
      .from('risk_assessments')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', userId)
      .eq('status', 'draft')
      .select()
      .single();
    if (error || !data) throw new Error('not_authorized_owner_or_invalid_transition');
    return this.toAssessment(data);
  }

  async submitForReview(id: string, userId: string): Promise<Assessment> {
    const current = await this.getAssessment(id);
    if (!current) throw new Error('assessment_not_found');
    if (current.ownerId !== userId) throw new Error('not_authorized_owner');
    if (current.status !== 'in_progress' && current.status !== 'changes_requested') {
      throw new Error(`invalid_transition_from_${current.status}`);
    }
    if (!current.approverId) throw new Error('approver_required');
    if (current.itemCount < 1) throw new Error('at_least_one_item_required');

    const { data, error } = await this.db
      .from('risk_assessments')
      .update({ status: 'pending_review', updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', ['in_progress', 'changes_requested'])
      .select()
      .single();
    return this.toAssessment(ok(data, error));
  }

  async approveAssessment(id: string, userId: string): Promise<Assessment> {
    const { data, error } = await this.db
      .from('risk_assessments')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('approver_id', userId)
      .eq('status', 'pending_review')
      .select()
      .single();
    if (error || !data) throw new Error('not_authorized_approver_or_invalid_transition');
    return this.toAssessment(data);
  }

  async requestChanges(id: string, userId: string, note: string): Promise<Assessment> {
    const { data, error } = await this.db
      .from('risk_assessments')
      .update({
        status: 'changes_requested',
        last_review_note: note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('approver_id', userId)
      .eq('status', 'pending_review')
      .select()
      .single();
    if (error || !data) throw new Error('not_authorized_approver_or_invalid_transition');
    return this.toAssessment(data);
  }

  async completeAssessment(id: string, userId: string): Promise<Assessment> {
    const { data, error } = await this.db
      .from('risk_assessments')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', userId)
      .eq('status', 'approved')
      .select()
      .single();
    if (error || !data) throw new Error('not_authorized_owner_or_invalid_transition');
    return this.toAssessment(data);
  }

  async archiveAssessment(id: string, userId: string): Promise<Assessment> {
    const { data, error } = await this.db
      .from('risk_assessments')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('owner_id', userId)
      .in('status', ['draft', 'completed'])
      .select()
      .single();
    if (error || !data) throw new Error('not_authorized_owner_or_invalid_transition');
    return this.toAssessment(data);
  }
```

Note: `startAssessment`/`approveAssessment`/`requestChanges`/`completeAssessment`/`archiveAssessment` use a single atomic conditional `update...eq(...).select().single()` — if the row doesn't match ALL conditions (existence + owner/approver + correct starting status), Supabase returns no row and `.single()` errors, which is treated as an authorization/state failure. `submitForReview` needs a preliminary fetch first because its preconditions (`approverId` set, `itemCount >= 1`) aren't simple equality filters expressible in the `.eq()`/`.in()` chain — read-then-write here, accepting a narrow, low-stakes race window (same trade-off already accepted elsewhere in this codebase, e.g. Risk Register's `getRiskMethodology` seed-on-read).

- [ ] **Step 6: Build**

Run: `yarn nx build notes`
Expected: still shows errors for Task 12's item methods and mapping — expected.

- [ ] **Step 7: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): rebuild Supabase Assessment CRUD and add server-enforced lifecycle transitions"
```

---

### Task 12: `SupabaseNotesStrategy` — Assessment Item CRUD rebuild with summary recompute

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

**Interfaces:**
- Consumes: `toRiskMethodology`, `scoreRisk` (existing, Risk Register); altered `risk_assessment_items` table (Task 4).

- [ ] **Step 1: Replace `createAssessmentItem` (was `addAssessmentItem`) entirely**

```typescript
  async createAssessmentItem(assessmentId: string, data: AssessmentItemInput): Promise<AssessmentItem> {
    const assessment = await this.getAssessment(assessmentId);
    if (!assessment) throw new Error('assessment_not_found');
    const { data: methodologyRow, error: methodologyError } = await this.db
      .from('risk_methodologies')
      .select('*')
      .eq('id', assessment.methodologyId)
      .single();
    const methodology = this.toRiskMethodology(ok(methodologyRow, methodologyError));
    const { score, label } = this.scoreRisk(methodology, data.inherentLikelihood, data.inherentImpact);

    const { data: row, error } = await this.db
      .from('risk_assessment_items')
      .insert({
        assessment_id: assessmentId,
        subject: data.subject,
        description: data.description,
        inherent_likelihood: data.inherentLikelihood,
        inherent_impact: data.inherentImpact,
        inherent_score: score,
        inherent_label: label,
      })
      .select()
      .single();
    const item = this.toAssessmentItem(ok(row, error));
    await this.recomputeAssessmentSummary(assessmentId);
    return item;
  }

  private async recomputeAssessmentSummary(assessmentId: string): Promise<void> {
    const { data: items, error } = await this.db
      .from('risk_assessment_items')
      .select('inherent_score, inherent_label, residual_score, residual_label')
      .eq('assessment_id', assessmentId);
    const rows = ok(items, error);
    const update: Record<string, unknown> = { item_count: rows.length };
    if (rows.length === 0) {
      update['highest_inherent_score'] = null;
      update['highest_inherent_label'] = null;
      update['highest_residual_score'] = null;
      update['highest_residual_label'] = null;
    } else {
      const topInherent = rows.reduce((max, r) =>
        (r['inherent_score'] as number) > (max['inherent_score'] as number) ? r : max,
      );
      update['highest_inherent_score'] = topInherent['inherent_score'];
      update['highest_inherent_label'] = topInherent['inherent_label'];
      const withResidual = rows.filter((r) => r['residual_score'] != null);
      if (withResidual.length > 0) {
        const topResidual = withResidual.reduce((max, r) =>
          (r['residual_score'] as number) > (max['residual_score'] as number) ? r : max,
        );
        update['highest_residual_score'] = topResidual['residual_score'];
        update['highest_residual_label'] = topResidual['residual_label'];
      }
    }
    await this.db.from('risk_assessments').update(update).eq('id', assessmentId);
  }
```

- [ ] **Step 2: Replace the row-to-object mapper — find `private toAssessmentItem`**

```typescript
  private toAssessmentItem(row: Record<string, unknown>): AssessmentItem {
    return {
      id: row['id'] as string,
      assessmentId: row['assessment_id'] as string,
      orgId: '', // populated by callers that need it; not stored redundantly on this table
      subject: row['subject'] as string,
      description: row['description'] as string,
      inherentLikelihood: row['inherent_likelihood'] as number,
      inherentImpact: row['inherent_impact'] as number,
      inherentScore: row['inherent_score'] as number,
      inherentLabel: row['inherent_label'] as RiskScoreLabel,
      residualLikelihood: row['residual_likelihood'] as number | undefined,
      residualImpact: row['residual_impact'] as number | undefined,
      residualScore: row['residual_score'] as number | undefined,
      residualLabel: row['residual_label'] as RiskScoreLabel | undefined,
      createdAt: row['created_at'] as string,
      updatedAt: row['updated_at'] as string,
    };
  }
```

Note: `AssessmentItem.orgId` (declared in Task 3's type) isn't stored on the `risk_assessment_items` row — it's derivable via the parent assessment. Since no consumer in this plan actually reads `item.orgId` directly (RLS handles org-scoping transparently, and no gateway endpoint needs to double-check org membership from the item alone), leave it as an empty string here rather than adding an extra join on every read. If a later phase needs it populated, that's a one-line addition then.

- [ ] **Step 3: Replace `updateAssessmentItem` entirely**

```typescript
  async updateAssessmentItem(id: string, patch: AssessmentItemPatch): Promise<AssessmentItem> {
    const { data: currentRow, error: currentError } = await this.db
      .from('risk_assessment_items')
      .select('*')
      .eq('id', id)
      .single();
    const current = this.toAssessmentItem(ok(currentRow, currentError));

    const { data: assessmentRow, error: assessmentError } = await this.db
      .from('risk_assessments')
      .select('methodology_id')
      .eq('id', current.assessmentId)
      .single();
    const methodologyId = ok(assessmentRow, assessmentError)['methodology_id'] as string;
    const { data: methodologyRow, error: methodologyError } = await this.db
      .from('risk_methodologies')
      .select('*')
      .eq('id', methodologyId)
      .single();
    const methodology = this.toRiskMethodology(ok(methodologyRow, methodologyError));

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.subject !== undefined) update['subject'] = patch.subject;
    if (patch.description !== undefined) update['description'] = patch.description;

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
    }

    const { data, error } = await this.db
      .from('risk_assessment_items')
      .update(update)
      .eq('id', id)
      .select()
      .single();
    const item = this.toAssessmentItem(ok(data, error));
    await this.recomputeAssessmentSummary(item.assessmentId);
    return item;
  }
```

- [ ] **Step 4: Replace `deleteAssessmentItem` entirely**

```typescript
  async deleteAssessmentItem(id: string): Promise<void> {
    const { data: row } = await this.db
      .from('risk_assessment_items')
      .select('assessment_id')
      .eq('id', id)
      .maybeSingle();
    const { error } = await this.db.from('risk_assessment_items').delete().eq('id', id);
    if (error) throw new Error(error.message);
    if (row) await this.recomputeAssessmentSummary(row['assessment_id'] as string);
  }
```

- [ ] **Step 5: Leave `listAssessmentItems` untouched.**

- [ ] **Step 6: Build**

Run: `yarn nx build notes`
Expected: still shows errors for the item-control mapping methods (Task 13) — expected.

- [ ] **Step 7: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): rebuild Supabase AssessmentItem CRUD with methodology-driven scoring and summary recompute"
```

---

### Task 13: `SupabaseNotesStrategy` — Item↔Control mapping

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts`

**Interfaces:**
- Consumes: `assessment_item_control_mappings` table (Task 4).

- [ ] **Step 1: Add the methods, following the `risk_control_mappings` pattern (Risk Register Task 12) exactly**

```typescript
  async listAssessmentItemControlMappings(itemId: string): Promise<AssessmentItemControlMapping[]> {
    const { data, error } = await this.db
      .from('assessment_item_control_mappings')
      .select('*')
      .eq('item_id', itemId);
    return ok(data, error).map((r) => this.toAssessmentItemControlMapping(r));
  }

  async addAssessmentItemControlMapping(
    itemId: string,
    data: AssessmentItemControlMappingInput,
  ): Promise<AssessmentItemControlMapping> {
    const { data: row, error } = await this.db
      .from('assessment_item_control_mappings')
      .insert({
        item_id: itemId,
        control_id: data.controlId,
        control_code: data.controlCode,
        control_title: data.controlTitle,
        effectiveness_note: data.effectivenessNote ?? null,
      })
      .select()
      .single();
    return this.toAssessmentItemControlMapping(ok(row, error));
  }

  async removeAssessmentItemControlMapping(id: string): Promise<void> {
    const { error } = await this.db.from('assessment_item_control_mappings').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }

  private toAssessmentItemControlMapping(row: Record<string, unknown>): AssessmentItemControlMapping {
    return {
      id: row['id'] as string,
      itemId: row['item_id'] as string,
      controlId: row['control_id'] as string,
      controlCode: row['control_code'] as string,
      controlTitle: row['control_title'] as string,
      effectivenessNote: row['effectiveness_note'] as string | undefined,
      createdAt: row['created_at'] as string,
    };
  }
```

- [ ] **Step 2: Build**

Run: `yarn nx build notes`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts
git commit -m "feat(notes): persist Assessment Item-Control mapping in Supabase"
```

---

### Task 14: Notes MS — `@MessagePattern` handlers

**Files:**
- Modify: `apps/microservices/notes/src/app/notes.controller.ts`

- [ ] **Step 1: Update the existing 9 assessment handlers' payload types where signatures changed, add the new ones**

Find `@MessagePattern('notes.assessments.items.add')` and rename to match the interface rename from Task 3:

```typescript
  @MessagePattern('notes.assessments.items.add')
  createAssessmentItem(
    @Payload() payload: { assessmentId: string; data: AssessmentItemInput },
  ): Promise<AssessmentItem> {
    return this.strategy.createAssessmentItem(payload.assessmentId, payload.data);
  }
```

(Message pattern string stays `notes.assessments.items.add` for wire-compatibility simplicity — only the underlying method name changed, not the pattern.)

Leave `notes.assessments.list`/`.get`/`.delete`/`.items.list`/`.items.delete` untouched — their signatures didn't change. `notes.assessments.create`/`.update`/`.items.update` keep the same message pattern strings but now carry the rebuilt `AssessmentInput`/`AssessmentPatch`/`AssessmentItemPatch` payload shapes automatically (no handler code change needed beyond the type import, since they just pass the payload through).

Then add these as new handlers (place them after the existing assessment handlers):

```typescript
  @MessagePattern('notes.assessment-types.list')
  listAssessmentTypes(@Payload() payload: { orgId: string }): Promise<AssessmentType[]> {
    return this.strategy.listAssessmentTypes(payload.orgId);
  }

  @MessagePattern('notes.assessment-types.create')
  createAssessmentType(
    @Payload() payload: { orgId: string; data: AssessmentTypeInput },
  ): Promise<AssessmentType> {
    return this.strategy.createAssessmentType(payload.orgId, payload.data);
  }

  @MessagePattern('notes.assessment-types.archive')
  archiveAssessmentType(@Payload() payload: { id: string }): Promise<AssessmentType> {
    return this.strategy.archiveAssessmentType(payload.id);
  }

  @MessagePattern('notes.assessments.start')
  startAssessment(@Payload() payload: { id: string; userId: string }): Promise<Assessment> {
    return this.strategy.startAssessment(payload.id, payload.userId);
  }

  @MessagePattern('notes.assessments.submit-for-review')
  submitForReview(@Payload() payload: { id: string; userId: string }): Promise<Assessment> {
    return this.strategy.submitForReview(payload.id, payload.userId);
  }

  @MessagePattern('notes.assessments.approve')
  approveAssessment(@Payload() payload: { id: string; userId: string }): Promise<Assessment> {
    return this.strategy.approveAssessment(payload.id, payload.userId);
  }

  @MessagePattern('notes.assessments.request-changes')
  requestChanges(
    @Payload() payload: { id: string; userId: string; note: string },
  ): Promise<Assessment> {
    return this.strategy.requestChanges(payload.id, payload.userId, payload.note);
  }

  @MessagePattern('notes.assessments.complete')
  completeAssessment(@Payload() payload: { id: string; userId: string }): Promise<Assessment> {
    return this.strategy.completeAssessment(payload.id, payload.userId);
  }

  @MessagePattern('notes.assessments.archive')
  archiveAssessment(@Payload() payload: { id: string; userId: string }): Promise<Assessment> {
    return this.strategy.archiveAssessment(payload.id, payload.userId);
  }

  @MessagePattern('notes.assessments.items.mappings.list')
  listAssessmentItemControlMappings(
    @Payload() payload: { itemId: string },
  ): Promise<AssessmentItemControlMapping[]> {
    return this.strategy.listAssessmentItemControlMappings(payload.itemId);
  }

  @MessagePattern('notes.assessments.items.mappings.add')
  addAssessmentItemControlMapping(
    @Payload() payload: { itemId: string; data: AssessmentItemControlMappingInput },
  ): Promise<AssessmentItemControlMapping> {
    return this.strategy.addAssessmentItemControlMapping(payload.itemId, payload.data);
  }

  @MessagePattern('notes.assessments.items.mappings.remove')
  removeAssessmentItemControlMapping(@Payload() payload: { id: string }): Promise<void> {
    return this.strategy.removeAssessmentItemControlMapping(payload.id);
  }
```

Add every new type used above to this file's `@icore/shared` type imports.

- [ ] **Step 2: Build**

Run: `yarn nx build notes`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/microservices/notes/src/app/notes.controller.ts
git commit -m "feat(notes): add TCP message handlers for assessment types, lifecycle, and item-control mapping"
```

---

### Task 15: `NotesClientService` — TCP proxy methods

**Files:**
- Modify: `libs/notes-client/src/lib/notes-client.service.ts`

- [ ] **Step 1: Update `addAssessmentItem` (rename to `createAssessmentItem`), leave other existing methods' signatures as-is (they proxy generically, no code change needed beyond type imports)**

```typescript
  createAssessmentItem(assessmentId: string, data: AssessmentItemInput): Promise<AssessmentItem> {
    return signedSend<AssessmentItem>(this.client, 'notes.assessments.items.add', {
      assessmentId,
      data,
    });
  }
```

Then add these as new proxy methods:

```typescript
  listAssessmentTypes(orgId: string): Promise<AssessmentType[]> {
    return signedSend<AssessmentType[]>(this.client, 'notes.assessment-types.list', { orgId });
  }

  createAssessmentType(orgId: string, data: AssessmentTypeInput): Promise<AssessmentType> {
    return signedSend<AssessmentType>(this.client, 'notes.assessment-types.create', { orgId, data });
  }

  archiveAssessmentType(id: string): Promise<AssessmentType> {
    return signedSend<AssessmentType>(this.client, 'notes.assessment-types.archive', { id });
  }

  startAssessment(id: string, userId: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.start', { id, userId });
  }

  submitForReview(id: string, userId: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.submit-for-review', { id, userId });
  }

  approveAssessment(id: string, userId: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.approve', { id, userId });
  }

  requestChanges(id: string, userId: string, note: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.request-changes', {
      id,
      userId,
      note,
    });
  }

  completeAssessment(id: string, userId: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.complete', { id, userId });
  }

  archiveAssessment(id: string, userId: string): Promise<Assessment> {
    return signedSend<Assessment>(this.client, 'notes.assessments.archive', { id, userId });
  }

  listAssessmentItemControlMappings(itemId: string): Promise<AssessmentItemControlMapping[]> {
    return signedSend<AssessmentItemControlMapping[]>(
      this.client,
      'notes.assessments.items.mappings.list',
      { itemId },
    );
  }

  addAssessmentItemControlMapping(
    itemId: string,
    data: AssessmentItemControlMappingInput,
  ): Promise<AssessmentItemControlMapping> {
    return signedSend<AssessmentItemControlMapping>(
      this.client,
      'notes.assessments.items.mappings.add',
      { itemId, data },
    );
  }

  removeAssessmentItemControlMapping(id: string): Promise<void> {
    return signedSend<void>(this.client, 'notes.assessments.items.mappings.remove', { id });
  }
```

Add the corresponding type imports.

- [ ] **Step 2: Build**

Run: `yarn nx build notes-client`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/notes-client/src/lib/notes-client.service.ts
git commit -m "feat(notes-client): proxy assessment types, lifecycle, and item-control mapping over TCP"
```

---

### Task 16: API Gateway — REST endpoints

**Files:**
- Modify: `apps/api/src/app/notes/notes.controller.ts`

- [ ] **Step 1: Rename `addAssessmentItem` endpoint's proxy call, leave route paths unchanged**

Find `addAssessmentItem` and update its body to call the renamed proxy method:

```typescript
  @Post('assessments/:id/items')
  @ApiOperation({ summary: 'Add item to risk assessment' })
  createAssessmentItem(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') assessmentId: string,
    @Body() body: AssessmentItemInput,
  ) {
    this.uid(req);
    return this.notes.createAssessmentItem(assessmentId, body);
  }
```

Then add these as new endpoints (place them under a new `// ─── Assessment Types & Lifecycle ───` heading, near the existing assessment endpoints — **route-order caution, a direct lesson from Risk Register's final review**: place `@Get('assessment-types')` etc. as their own top-level path segment, not nested under `assessments/:id`, so there is no risk of an Express `:id` route shadowing a static sibling; verify this by checking that no earlier route in this file is `@Get('assessments/:id')`-shaped in a way that could match `assessment-types` — it can't, since `assessment-types` is a different literal path segment entirely, not `assessments/something`, but double-check the final file's route order regardless before committing):

```typescript
  @Get('assessment-types')
  @ApiOperation({ summary: 'List assessment types for org' })
  listAssessmentTypes(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.listAssessmentTypes(orgId);
  }

  @Post('assessment-types')
  @ApiOperation({ summary: 'Create an assessment type' })
  createAssessmentType(
    @Req() req: Request & { user?: VerifiedToken },
    @Query('orgId') orgId: string,
    @Body() body: AssessmentTypeInput,
  ) {
    this.uid(req);
    if (!orgId) throw new BadRequestException('orgId required');
    return this.notes.createAssessmentType(orgId, body);
  }

  @Patch('assessment-types/:id/archive')
  @ApiOperation({ summary: 'Archive an assessment type' })
  archiveAssessmentType(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    this.uid(req);
    return this.notes.archiveAssessmentType(id);
  }

  @Post('assessments/:id/start')
  @ApiOperation({ summary: 'Start an assessment (draft -> in_progress)' })
  startAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.startAssessment(id, userId);
  }

  @Post('assessments/:id/submit-for-review')
  @ApiOperation({ summary: 'Submit an assessment for review' })
  submitForReview(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.submitForReview(id, userId);
  }

  @Post('assessments/:id/approve')
  @ApiOperation({ summary: 'Approve an assessment' })
  approveAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.approveAssessment(id, userId);
  }

  @Post('assessments/:id/request-changes')
  @ApiOperation({ summary: 'Request changes on an assessment' })
  requestChanges(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('id') id: string,
    @Body() body: { note: string },
  ) {
    const userId = this.uid(req);
    return this.notes.requestChanges(id, userId, body.note);
  }

  @Post('assessments/:id/complete')
  @ApiOperation({ summary: 'Complete an approved assessment' })
  completeAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.completeAssessment(id, userId);
  }

  @Post('assessments/:id/archive')
  @ApiOperation({ summary: 'Archive an assessment' })
  archiveAssessment(@Req() req: Request & { user?: VerifiedToken }, @Param('id') id: string) {
    const userId = this.uid(req);
    return this.notes.archiveAssessment(id, userId);
  }

  @Get('assessments/items/:itemId/mappings')
  @ApiOperation({ summary: 'List controls mapped to an assessment item' })
  listAssessmentItemControlMappings(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
  ) {
    this.uid(req);
    return this.notes.listAssessmentItemControlMappings(itemId);
  }

  @Post('assessments/items/:itemId/mappings')
  @ApiOperation({ summary: 'Map a control to an assessment item' })
  addAssessmentItemControlMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('itemId') itemId: string,
    @Body() body: AssessmentItemControlMappingInput,
  ) {
    this.uid(req);
    return this.notes.addAssessmentItemControlMapping(itemId, body);
  }

  @Delete('assessments/items/mappings/:mappingId')
  @ApiOperation({ summary: 'Remove an assessment item-control mapping' })
  removeAssessmentItemControlMapping(
    @Req() req: Request & { user?: VerifiedToken },
    @Param('mappingId') mappingId: string,
  ) {
    this.uid(req);
    return this.notes.removeAssessmentItemControlMapping(mappingId);
  }
```

Add every new type used above to this file's `@icore/shared` type imports.

- [ ] **Step 2: Build**

Run: `yarn nx build api`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/app/notes/notes.controller.ts
git commit -m "feat(api): expose assessment types, lifecycle, and item-control mapping over REST"
```

---

### Task 17: Client — `queries/assessments.ts` rebuild and new `queries/assessment-types.ts`

**Files:**
- Modify: `apps/client/src/queries/assessments.ts` (full replacement)
- Create: `apps/client/src/queries/assessment-types.ts`

- [ ] **Step 1: Read `apps/client/src/queries/risks.ts` first** to confirm the exact `api()` helper import and call conventions this codebase uses (already established — this task follows the identical pattern).

- [ ] **Step 2: Write `apps/client/src/queries/assessment-types.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AssessmentType, AssessmentTypeInput } from '@icore/shared';

export function useAssessmentTypes(orgId?: string) {
  return useQuery<AssessmentType[]>({
    queryKey: ['assessment-types', orgId],
    queryFn: () =>
      api<AssessmentType[]>(`/notes/assessment-types?orgId=${encodeURIComponent(orgId ?? '')}`),
    enabled: !!orgId,
  });
}

export function useCreateAssessmentType(orgId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentType, Error, AssessmentTypeInput>({
    mutationFn: (data) =>
      api<AssessmentType>(`/notes/assessment-types?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-types', orgId] }),
  });
}

export function useArchiveAssessmentType(orgId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentType, Error, string>({
    mutationFn: (id) =>
      api<AssessmentType>(`/notes/assessment-types/${id}/archive`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-types', orgId] }),
  });
}
```

- [ ] **Step 3: Replace `apps/client/src/queries/assessments.ts` wholesale**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  Assessment,
  AssessmentInput,
  AssessmentPatch,
  AssessmentItem,
  AssessmentItemInput,
  AssessmentItemPatch,
  AssessmentItemControlMapping,
  AssessmentItemControlMappingInput,
} from '@icore/shared';

export type {
  Assessment,
  AssessmentInput,
  AssessmentPatch,
  AssessmentItem,
  AssessmentItemInput,
  AssessmentItemPatch,
  AssessmentItemControlMapping,
  AssessmentItemControlMappingInput,
};

export function useAssessments(orgId: string) {
  return useQuery<Assessment[]>({
    queryKey: ['assessments', orgId],
    queryFn: () => api<Assessment[]>(`/notes/assessments?orgId=${encodeURIComponent(orgId)}`),
    enabled: !!orgId,
  });
}

export function useAssessment(id: string) {
  return useQuery<Assessment>({
    queryKey: ['assessments', id],
    queryFn: () => api<Assessment>(`/notes/assessments/${id}`),
    enabled: !!id,
  });
}

export function useAssessmentItems(assessmentId: string) {
  return useQuery<AssessmentItem[]>({
    queryKey: ['assessments', assessmentId, 'items'],
    queryFn: () => api<AssessmentItem[]>(`/notes/assessments/${assessmentId}/items`),
    enabled: !!assessmentId,
  });
}

export function useCreateAssessment(orgId: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, AssessmentInput>({
    mutationFn: (data) =>
      api<Assessment>(`/notes/assessments?orgId=${encodeURIComponent(orgId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments', orgId] }),
  });
}

export function useUpdateAssessment(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, AssessmentPatch>({
    mutationFn: (patch) =>
      api<Assessment>(`/notes/assessments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', orgId] });
      qc.invalidateQueries({ queryKey: ['assessments', id] });
    },
  });
}

export function useDeleteAssessment(orgId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/assessments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessments', orgId] }),
  });
}

function invalidateAssessment(qc: ReturnType<typeof useQueryClient>, orgId: string, id: string) {
  qc.invalidateQueries({ queryKey: ['assessments', orgId] });
  qc.invalidateQueries({ queryKey: ['assessments', id] });
}

export function useStartAssessment(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, void>({
    mutationFn: () => api<Assessment>(`/notes/assessments/${id}/start`, { method: 'POST' }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}

export function useSubmitForReview(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, void>({
    mutationFn: () =>
      api<Assessment>(`/notes/assessments/${id}/submit-for-review`, { method: 'POST' }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}

export function useApproveAssessment(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, void>({
    mutationFn: () => api<Assessment>(`/notes/assessments/${id}/approve`, { method: 'POST' }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}

export function useRequestChanges(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, { note: string }>({
    mutationFn: (body) =>
      api<Assessment>(`/notes/assessments/${id}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}

export function useCompleteAssessment(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, void>({
    mutationFn: () => api<Assessment>(`/notes/assessments/${id}/complete`, { method: 'POST' }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}

export function useArchiveAssessment(orgId: string, id: string) {
  const qc = useQueryClient();
  return useMutation<Assessment, Error, void>({
    mutationFn: () => api<Assessment>(`/notes/assessments/${id}/archive`, { method: 'POST' }),
    onSuccess: () => invalidateAssessment(qc, orgId, id),
  });
}

export function useCreateAssessmentItem(assessmentId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentItem, Error, AssessmentItemInput>({
    mutationFn: (data) =>
      api<AssessmentItem>(`/notes/assessments/${assessmentId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId, 'items'] });
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId] });
    },
  });
}

export function useUpdateAssessmentItem(assessmentId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentItem, Error, { id: string; patch: AssessmentItemPatch }>({
    mutationFn: ({ id, patch }) =>
      api<AssessmentItem>(`/notes/assessments/items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId, 'items'] });
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId] });
    },
  });
}

export function useDeleteAssessmentItem(assessmentId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => api<void>(`/notes/assessments/items/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId, 'items'] });
      qc.invalidateQueries({ queryKey: ['assessments', assessmentId] });
    },
  });
}

export function useAssessmentItemControlMappings(itemId: string) {
  return useQuery<AssessmentItemControlMapping[]>({
    queryKey: ['assessment-items', itemId, 'mappings'],
    queryFn: () =>
      api<AssessmentItemControlMapping[]>(`/notes/assessments/items/${itemId}/mappings`),
    enabled: !!itemId,
  });
}

export function useAddAssessmentItemControlMapping(itemId: string) {
  const qc = useQueryClient();
  return useMutation<AssessmentItemControlMapping, Error, AssessmentItemControlMappingInput>({
    mutationFn: (data) =>
      api<AssessmentItemControlMapping>(`/notes/assessments/items/${itemId}/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-items', itemId, 'mappings'] }),
  });
}

export function useRemoveAssessmentItemControlMapping(itemId: string) {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (mappingId) =>
      api<void>(`/notes/assessments/items/mappings/${mappingId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assessment-items', itemId, 'mappings'] }),
  });
}
```

- [ ] **Step 4: Build**

Run: `yarn nx build client`
Expected: FAILS — `assessments.tsx`/`assessments_.$id.tsx` still import the old hook/field shapes (Tasks 19-21 fix them). Confirm the failure is confined to those two files (and files that import from them), not `queries/assessments.ts`/`queries/assessment-types.ts` themselves.

- [ ] **Step 5: Commit**

```bash
git add apps/client/src/queries/assessments.ts apps/client/src/queries/assessment-types.ts
git commit -m "feat(client): rebuild React Query hooks for assessment types, lifecycle, and item-control mapping"
```

---

### Task 18: Client — `AssessmentTypesSheet` and `AssessmentItemControls` components

**Files:**
- Create: `apps/client/src/components/assessments/AssessmentTypesSheet.tsx`
- Create: `apps/client/src/components/assessments/AssessmentItemControls.tsx`

**Interfaces:**
- Consumes: `useAssessmentTypes`/`useCreateAssessmentType`/`useArchiveAssessmentType` (Task 17); `useAssessmentItemControlMappings`/`useAddAssessmentItemControlMapping`/`useRemoveAssessmentItemControlMapping` (Task 17).

- [ ] **Step 1: Write `AssessmentTypesSheet.tsx`, modeled directly on `apps/client/src/components/risks/RiskMethodologySheet.tsx`'s Taxonomy tab (read that file first for the exact `Sheet` import path and archive-with-`AlertDialog` pattern — the mandatory delete-confirmation rule applies here too)**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import {
  useAssessmentTypes,
  useCreateAssessmentType,
  useArchiveAssessmentType,
} from '@/queries/assessment-types';

export function AssessmentTypesSheet({ orgId }: { orgId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmArchiveId, setConfirmArchiveId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [singular, setSingular] = useState('');
  const [plural, setPlural] = useState('');

  const { data: types = [] } = useAssessmentTypes(orgId);
  const createMut = useCreateAssessmentType(orgId);
  const archiveMut = useArchiveAssessmentType(orgId);

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Settings size={14} className="mr-1.5" />
        {t('assessments.manageTypes')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('assessments.manageTypes')}</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 mt-4">
            {types.map((ty) => (
              <div key={ty.id} className="flex items-center justify-between text-sm py-1">
                <div className={ty.archived ? 'line-through text-muted-foreground' : ''}>
                  <span>{ty.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    ({ty.itemNounSingular}/{ty.itemNounPlural})
                  </span>
                </div>
                {!ty.archived && (
                  <button
                    type="button"
                    onClick={() => setConfirmArchiveId(ty.id)}
                    className="text-xs text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            ))}
            <div className="grid grid-cols-3 gap-2 pt-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('assessments.typeNamePlaceholder')}
              />
              <Input
                value={singular}
                onChange={(e) => setSingular(e.target.value)}
                placeholder={t('assessments.itemNounSingularPlaceholder')}
              />
              <Input
                value={plural}
                onChange={(e) => setPlural(e.target.value)}
                placeholder={t('assessments.itemNounPluralPlaceholder')}
              />
            </div>
            <Button
              size="sm"
              className="mt-2"
              onClick={() => {
                if (!name.trim() || !singular.trim() || !plural.trim()) return;
                createMut.mutate(
                  { name: name.trim(), itemNounSingular: singular.trim(), itemNounPlural: plural.trim() },
                  { onSuccess: () => { setName(''); setSingular(''); setPlural(''); } },
                );
              }}
            >
              {t('common.create')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmArchiveId} onOpenChange={(o) => !o && setConfirmArchiveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('assessments.archiveTypeConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('assessments.archiveTypeConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmArchiveId(null)}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmArchiveId) archiveMut.mutate(confirmArchiveId);
                setConfirmArchiveId(null);
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

- [ ] **Step 2: Write `AssessmentItemControls.tsx`** (a small mapping mini-table for one item, modeled on the Controls tab of `apps/client/src/routes/_dashboard/-risks-detail.page.tsx`)

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import {
  useAssessmentItemControlMappings,
  useAddAssessmentItemControlMapping,
  useRemoveAssessmentItemControlMapping,
} from '@/queries/assessments';

interface AssessmentItemControlsProps {
  itemId: string;
  availableControls: Array<{ id: string; code: string; title: string }>;
}

export function AssessmentItemControls({ itemId, availableControls }: AssessmentItemControlsProps) {
  const { t } = useTranslation();
  const { data: mappings = [] } = useAssessmentItemControlMappings(itemId);
  const addMut = useAddAssessmentItemControlMapping(itemId);
  const removeMut = useRemoveAssessmentItemControlMapping(itemId);
  const [selectedControlId, setSelectedControlId] = useState('');

  const linkedIds = new Set(mappings.map((m) => m.controlId));
  const options = availableControls.filter((c) => !linkedIds.has(c.id));

  return (
    <div className="space-y-2">
      {mappings.map((m) => (
        <div
          key={m.id}
          className="flex items-center justify-between text-xs border border-border rounded px-2 py-1.5"
        >
          <span>
            <span className="font-mono mr-1.5">{m.controlCode}</span>
            {m.controlTitle}
          </span>
          <button
            type="button"
            onClick={() => removeMut.mutate(m.id)}
            className="text-muted-foreground hover:text-destructive cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <select
          value={selectedControlId}
          onChange={(e) => setSelectedControlId(e.target.value)}
          className="flex-1 h-8 rounded-md border border-border bg-surface px-2 text-xs"
        >
          <option value="">{t('assessments.selectControl')}</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} — {c.title}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            const control = availableControls.find((c) => c.id === selectedControlId);
            if (!control) return;
            addMut.mutate(
              { controlId: control.id, controlCode: control.code, controlTitle: control.title },
              { onSuccess: () => setSelectedControlId('') },
            );
          }}
          disabled={!selectedControlId}
          className="h-8 w-8 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground disabled:opacity-40 cursor-pointer"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build**

Run: `yarn nx build client`
Expected: these two new files compile cleanly on their own (the overall build still shows the expected failures from Task 17 — `assessments.tsx`/`assessments_.$id.tsx` not yet rebuilt).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/components/assessments/AssessmentTypesSheet.tsx apps/client/src/components/assessments/AssessmentItemControls.tsx
git commit -m "feat(client): add AssessmentTypesSheet and AssessmentItemControls components"
```

---

### Task 19: Client — Assessment list page rebuild

**Files:**
- Create: `apps/client/src/routes/_dashboard/-assessments.page.tsx`
- Modify: `apps/client/src/routes/_dashboard/assessments.tsx` (thin wrapper)

**Interfaces:**
- Consumes: `useAssessments`/`useCreateAssessment`/`useDeleteAssessment` (Task 17); `useAssessmentTypes` (Task 17); `useAssets`/`useVendors` (existing, verify signatures against `apps/client/src/queries/assets.ts`/`vendors.ts` before use — same verification Risk Register's Task 20 did); `MultiSelect` (existing, from Risk Register); `AssessmentTypesSheet` (Task 18).

- [ ] **Step 1: Write `-assessments.page.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Plus, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultiSelect } from '@/components/ui/multi-select';
import { PageLayout } from '@/components/PageLayout';
import { AssessmentTypesSheet } from '@/components/assessments/AssessmentTypesSheet';
import { useActiveOrgStore } from '@/stores/active-org';
import { useAssets } from '@/queries/assets';
import { useVendors } from '@/queries/vendors';
import { useAssessmentTypes } from '@/queries/assessment-types';
import {
  useAssessments,
  useCreateAssessment,
  useDeleteAssessment,
  type AssessmentInput,
} from '@/queries/assessments';

const EMPTY_FORM: AssessmentInput = {
  title: '',
  assessmentTypeId: '',
  ownerId: '',
};

const SCORE_COLOR = (label?: string) => {
  if (label === 'critical') return 'text-red-400';
  if (label === 'high') return 'text-orange-400';
  if (label === 'medium') return 'text-amber-400';
  if (label === 'low') return 'text-green-400';
  return 'text-muted-foreground';
};

export function AssessmentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';

  const { data: assessments = [], isPending } = useAssessments(orgId);
  const { data: types = [] } = useAssessmentTypes(orgId);
  const { data: assets = [] } = useAssets(orgId);
  const { data: vendors = [] } = useVendors(orgId);
  const createMut = useCreateAssessment(orgId);
  const deleteMut = useDeleteAssessment(orgId);

  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<AssessmentInput>(EMPTY_FORM);

  const typeName = (id: string) => types.find((ty) => ty.id === id)?.name ?? '—';

  const summary = useMemo(() => {
    const active = assessments.filter((a) => a.status !== 'archived');
    const pendingReview = active.filter((a) => a.status === 'pending_review').length;
    const overdue = active.filter((a) => a.dueDate && a.dueDate < new Date().toISOString()).length;
    return { total: active.length, pendingReview, overdue };
  }, [assessments]);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.assessmentTypeId || !form.ownerId) return;
    createMut.mutate(form, { onSuccess: () => { setCreateOpen(false); setForm(EMPTY_FORM); } });
  }

  return (
    <PageLayout title={t('nav.assessments')}>
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm">
          <span className="font-semibold text-foreground">
            {summary.total} {t('assessments.summaryActive')} · {summary.pendingReview}{' '}
            {t('assessments.summaryPendingReview')} · {summary.overdue} {t('assessments.summaryOverdue')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AssessmentTypesSheet orgId={orgId} />
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!orgId}>
            <Plus size={14} className="mr-1.5" />
            {t('assessments.newAssessment')}
          </Button>
        </div>
      </div>

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-surface border border-border rounded-xl animate-pulse" />
          ))}
        </div>
      ) : assessments.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
          <ClipboardList size={32} className="opacity-30" />
          <p className="text-sm">{t('assessments.empty')}</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="py-2 px-3">{t('assessments.colCode')}</th>
              <th className="py-2 px-3">{t('assessments.colTitle')}</th>
              <th className="py-2 px-3">{t('assessments.colType')}</th>
              <th className="py-2 px-3">{t('assessments.colOwner')}</th>
              <th className="py-2 px-3">{t('assessments.colInherent')}</th>
              <th className="py-2 px-3">{t('assessments.colResidual')}</th>
              <th className="py-2 px-3">{t('assessments.colStatus')}</th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {assessments.map((a) => (
              <tr
                key={a.id}
                onClick={() => void navigate({ to: '/assessments/$id', params: { id: a.id } })}
                className="border-b border-border hover:bg-surface cursor-pointer"
              >
                <td className="py-2 px-3 font-mono text-xs">{a.assessmentCode}</td>
                <td className="py-2 px-3">{a.title}</td>
                <td className="py-2 px-3 text-muted-foreground">{typeName(a.assessmentTypeId)}</td>
                <td className="py-2 px-3 text-muted-foreground">{a.ownerId}</td>
                <td className={`py-2 px-3 ${SCORE_COLOR(a.highestInherentLabel)}`}>
                  {a.highestInherentScore ?? '—'}
                </td>
                <td className={`py-2 px-3 ${SCORE_COLOR(a.highestResidualLabel)}`}>
                  {a.highestResidualScore ?? '—'}
                </td>
                <td className="py-2 px-3">{t(`assessments.status.${a.status}`)}</td>
                <td className="py-2 px-3 text-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(a.id);
                    }}
                    className="text-muted-foreground hover:text-destructive cursor-pointer"
                  >
                    {t('common.delete')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assessments.newAssessment')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="flex flex-col max-h-[70vh]">
            <div className="space-y-3 overflow-y-auto px-1 -mx-1">
              <div>
                <Label htmlFor="assessment-title">{t('assessments.title')}</Label>
                <Input
                  id="assessment-title"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('assessments.type')}</Label>
                  <select
                    value={form.assessmentTypeId}
                    onChange={(e) => setForm((f) => ({ ...f, assessmentTypeId: e.target.value }))}
                    required
                    className="w-full h-9 rounded-md border border-border bg-surface px-3 text-sm"
                  >
                    <option value="">{t('assessments.selectType')}</option>
                    {types.filter((ty) => !ty.archived).map((ty) => (
                      <option key={ty.id} value={ty.id}>
                        {ty.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="assessment-owner">{t('assessments.owner')}</Label>
                  <Input
                    id="assessment-owner"
                    value={form.ownerId}
                    onChange={(e) => setForm((f) => ({ ...f, ownerId: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="assessment-bu">{t('assessments.businessUnit')}</Label>
                  <Input
                    id="assessment-bu"
                    value={form.businessUnit ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, businessUnit: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="assessment-due">{t('assessments.dueDate')}</Label>
                  <Input
                    id="assessment-due"
                    type="date"
                    value={form.dueDate ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="assessment-approver">{t('assessments.approver')}</Label>
                <Input
                  id="assessment-approver"
                  value={form.approverId ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, approverId: e.target.value }))}
                />
              </div>
              <div>
                <Label>{t('assessments.inScopeAssets')}</Label>
                <MultiSelect
                  options={assets.map((a) => ({ value: a.id, label: a.name }))}
                  selected={form.assetIds ?? []}
                  onChange={(assetIds) => setForm((f) => ({ ...f, assetIds }))}
                  placeholder={t('assessments.noAssets')}
                />
              </div>
              <div>
                <Label>{t('assessments.inScopeVendors')}</Label>
                <MultiSelect
                  options={vendors.map((v) => ({ value: v.id, label: v.name }))}
                  selected={form.vendorIds ?? []}
                  onChange={(vendorIds) => setForm((f) => ({ ...f, vendorIds }))}
                  placeholder={t('assessments.noVendors')}
                />
              </div>
            </div>
            <DialogFooter className="mt-3 border-t border-border pt-3">
              <Button type="submit" disabled={createMut.isPending}>
                {t('assessments.newAssessment')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('assessments.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('assessments.deleteConfirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmDeleteId(null)}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteId) deleteMut.mutate(confirmDeleteId);
                setConfirmDeleteId(null);
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageLayout>
  );
}
```

Note: this drops the old `useDraft`/`UnsavedChangesDialog` unsaved-changes guard the original stub used — the Risk Register list page's equivalent create-dialog (the precedent this plan otherwise follows exactly) doesn't use one either, so this is intentional consistency, not an oversight.

- [ ] **Step 2: Rewrite `assessments.tsx` as a thin wrapper**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { AssessmentsPage } from './-assessments.page';

export const Route = createFileRoute('/_dashboard/assessments')({
  component: AssessmentsPage,
});
```

- [ ] **Step 3: Build**

Run: `npx prettier --write apps/client/src/routes/_dashboard/assessments.tsx apps/client/src/routes/_dashboard/-assessments.page.tsx && yarn nx lint client && yarn nx build client`
Expected: PASS (verify `useAssets`/`useVendors` real signatures first if the build surfaces a mismatch — same check Risk Register's Task 20 needed).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/routes/_dashboard/assessments.tsx apps/client/src/routes/_dashboard/-assessments.page.tsx
git commit -m "feat(client): rebuild Assessment list page with configurable types and real scoping"
```

---

### Task 20: Client — Assessment detail page: Overview and lifecycle actions

**Files:**
- Create: `apps/client/src/routes/_dashboard/-assessment-detail.page.tsx`
- Modify: `apps/client/src/routes/_dashboard/assessments_.$id.tsx` (thin wrapper)

**Interfaces:**
- Consumes: `useAssessment`/`useUpdateAssessment`/`useStartAssessment`/`useSubmitForReview`/`useApproveAssessment`/`useRequestChanges`/`useCompleteAssessment`/`useArchiveAssessment` (Task 17); `useAssessmentTypes` (Task 17); `useAuthStore` (existing, `@icore/template-shared` — same pattern used for Risk Acceptance's approver gate).

- [ ] **Step 1: Write `-assessment-detail.page.tsx` with Overview + lifecycle action buttons (Items tab body added in Task 21)**

```tsx
import { useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@icore/template-shared';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageLayout } from '@/components/PageLayout';
import { useActiveOrgStore } from '@/stores/active-org';
import { useAssessmentTypes } from '@/queries/assessment-types';
import {
  useAssessment,
  useStartAssessment,
  useSubmitForReview,
  useApproveAssessment,
  useRequestChanges,
  useCompleteAssessment,
  useArchiveAssessment,
} from '@/queries/assessments';

export function AssessmentDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/_dashboard/assessments_/$id' });
  const navigate = useNavigate();
  const { activeOrgId } = useActiveOrgStore();
  const orgId = activeOrgId ?? '';
  const currentUserId = useAuthStore((s) => s.user?.id);

  const { data: assessment, isPending } = useAssessment(id);
  const { data: types = [] } = useAssessmentTypes(orgId);
  const startMut = useStartAssessment(orgId, id);
  const submitMut = useSubmitForReview(orgId, id);
  const approveMut = useApproveAssessment(orgId, id);
  const requestChangesMut = useRequestChanges(orgId, id);
  const completeMut = useCompleteAssessment(orgId, id);
  const archiveMut = useArchiveAssessment(orgId, id);

  const [tab, setTab] = useState<'overview' | 'items'>('overview');
  const [changesNote, setChangesNote] = useState('');

  if (isPending || !assessment) {
    return (
      <PageLayout title={t('assessments.detailTitle')}>
        <div className="h-64 bg-surface border border-border rounded-lg animate-pulse" />
      </PageLayout>
    );
  }

  const typeName = types.find((ty) => ty.id === assessment.assessmentTypeId)?.name ?? '—';
  const isOwner = currentUserId === assessment.ownerId;
  const isApprover = currentUserId === assessment.approverId;

  return (
    <PageLayout title={`${assessment.assessmentCode} — ${assessment.title}`}>
      <button
        type="button"
        onClick={() => void navigate({ to: '/assessments' })}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        <ArrowLeft size={14} />
        {t('assessments.backToList')}
      </button>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1">
          {(['overview', 'items'] as const).map((tKey) => (
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
              {t(`assessments.tab.${tKey}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {assessment.status === 'draft' && isOwner && (
            <Button size="sm" onClick={() => startMut.mutate()}>
              {t('assessments.start')}
            </Button>
          )}
          {(assessment.status === 'in_progress' || assessment.status === 'changes_requested') &&
            isOwner && (
              <Button size="sm" onClick={() => submitMut.mutate()}>
                {t('assessments.submitForReview')}
              </Button>
            )}
          {assessment.status === 'pending_review' && isApprover && (
            <>
              <Button size="sm" onClick={() => approveMut.mutate()}>
                {t('assessments.approve')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!changesNote.trim()) return;
                  requestChangesMut.mutate({ note: changesNote.trim() }, {
                    onSuccess: () => setChangesNote(''),
                  });
                }}
              >
                {t('assessments.requestChanges')}
              </Button>
            </>
          )}
          {assessment.status === 'approved' && isOwner && (
            <Button size="sm" onClick={() => completeMut.mutate()}>
              {t('assessments.complete')}
            </Button>
          )}
          {(assessment.status === 'draft' || assessment.status === 'completed') && isOwner && (
            <Button size="sm" variant="outline" onClick={() => archiveMut.mutate()}>
              {t('assessments.archive')}
            </Button>
          )}
        </div>
      </div>

      {assessment.status === 'pending_review' && isApprover && (
        <div className="mb-4">
          <Input
            value={changesNote}
            onChange={(e) => setChangesNote(e.target.value)}
            placeholder={t('assessments.changesNotePlaceholder')}
          />
        </div>
      )}

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label={t('assessments.colCode')} value={assessment.assessmentCode} />
          <Field label={t('assessments.title')} value={assessment.title} />
          <Field label={t('assessments.type')} value={typeName} />
          <Field label={t('assessments.owner')} value={assessment.ownerId} />
          <Field label={t('assessments.businessUnit')} value={assessment.businessUnit ?? ''} />
          <Field label={t('assessments.approver')} value={assessment.approverId ?? ''} />
          <Field label={t('assessments.dueDate')} value={assessment.dueDate?.slice(0, 10) ?? ''} />
          <Field label={t('assessments.colStatus')} value={t(`assessments.status.${assessment.status}`)} />
          <Field
            label={t('assessments.colInherent')}
            value={assessment.highestInherentScore != null ? String(assessment.highestInherentScore) : '—'}
          />
          <Field
            label={t('assessments.colResidual')}
            value={assessment.highestResidualScore != null ? String(assessment.highestResidualScore) : '—'}
          />
          {assessment.lastReviewNote && (
            <div className="col-span-2">
              <Field label={t('assessments.lastReviewNote')} value={assessment.lastReviewNote} />
            </div>
          )}
        </div>
      )}

      {tab === 'items' && (
        <div className="py-8 text-center text-muted-foreground text-sm">
          {t('assessments.itemsPlaceholder')}
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

The Items tab body here is a placeholder text (`itemsPlaceholder`) deliberately — Task 21 replaces it with the real item list + add form + `AssessmentItemControls`. This keeps this task's diff focused on Overview + lifecycle, matching the granularity Risk Register used for its own detail-page split (Task 22 shell, Task 23 remaining tabs).

- [ ] **Step 2: Rewrite `assessments_.$id.tsx` as a thin wrapper**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { AssessmentDetailPage } from './-assessment-detail.page';

export const Route = createFileRoute('/_dashboard/assessments_/$id')({
  component: AssessmentDetailPage,
});
```

- [ ] **Step 3: Build**

Run: `yarn nx build client`
Expected: PASS for these two files (confirm `routeTree.gen.ts` still resolves `/_dashboard/assessments_/$id` — it already existed before this task, so no new route entry is needed, just confirm the build didn't break the existing route registration).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/routes/_dashboard/assessments_.\$id.tsx apps/client/src/routes/_dashboard/-assessment-detail.page.tsx
git commit -m "feat(client): rebuild Assessment detail page with Overview tab and server-gated lifecycle actions"
```

---

### Task 21: Client — Assessment detail page: Items tab

**Files:**
- Modify: `apps/client/src/routes/_dashboard/-assessment-detail.page.tsx`

**Interfaces:**
- Consumes: `useAssessmentItems`/`useCreateAssessmentItem`/`useUpdateAssessmentItem`/`useDeleteAssessmentItem` (Task 17); `AssessmentItemControls` (Task 18); a `RiskMethodology` lookup for the likelihood/impact select options (reuse `useRiskMethodology` from `@/queries/risks`, passing the assessment's org — same methodology the assessment pinned); a list of `InternalControl` for `AssessmentItemControls`' `availableControls` prop (check `apps/client/src/queries/controls.ts` for the existing hook name and shape — likely `useInternalControls` or similar, verify before using).

- [ ] **Step 1: Read the current state of `-assessment-detail.page.tsx` (Task 20's output) and `apps/client/src/queries/controls.ts` first** to confirm the exact hook name/shape for listing an org's controls before writing this task's code.

- [ ] **Step 2: Add the imports and hooks, and replace the Items tab placeholder**

Add to the top of the file:

```tsx
import { Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { AssessmentItemControls } from '@/components/assessments/AssessmentItemControls';
import { useRiskMethodology } from '@/queries/risks';
import {
  useAssessmentItems,
  useCreateAssessmentItem,
  useDeleteAssessmentItem,
  type AssessmentItemInput,
} from '@/queries/assessments';
// Verify the exact hook name/import path against apps/client/src/queries/controls.ts
// before finalizing — substitute the real name here if it differs from this guess:
import { useInternalControls } from '@/queries/controls';
```

Inside `AssessmentDetailPage`, after the existing hooks, add:

```tsx
  const { data: items = [] } = useAssessmentItems(id);
  const { data: methodology } = useRiskMethodology(orgId);
  const { data: controls = [] } = useInternalControls(orgId);
  const createItemMut = useCreateAssessmentItem(id);
  const deleteItemMut = useDeleteAssessmentItem(id);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemForm, setItemForm] = useState<AssessmentItemInput>({
    subject: '', description: '', inherentLikelihood: 0, inherentImpact: 0,
  });
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  function handleCreateItem(e: React.FormEvent) {
    e.preventDefault();
    if (!itemForm.subject || !itemForm.inherentLikelihood || !itemForm.inherentImpact) return;
    createItemMut.mutate(itemForm, {
      onSuccess: () => {
        setItemDialogOpen(false);
        setItemForm({ subject: '', description: '', inherentLikelihood: 0, inherentImpact: 0 });
      },
    });
  }
```

Replace the placeholder Items tab block:

```tsx
      {tab === 'items' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setItemDialogOpen(true)}>
              <Plus size={14} className="mr-1.5" />
              {t('assessments.addItem')}
            </Button>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-center text-muted-foreground py-12">
              {t('assessments.noItems')}
            </p>
          ) : (
            items.map((item) => (
              <div key={item.id} className="border border-border rounded-xl overflow-hidden">
                <div
                  className="flex items-start gap-3 p-4 cursor-pointer hover:bg-surface"
                  onClick={() => setExpandedItemId((cur) => (cur === item.id ? null : item.id))}
                >
                  <span className="text-lg font-bold tabular-nums shrink-0">
                    {item.inherentScore}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground">{item.subject}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
                    )}
                    <p className="text-[11px] text-muted-foreground/60 mt-1">
                      {t('assessments.inherent')}: {item.inherentScore} ({item.inherentLabel})
                      {item.residualScore != null &&
                        ` · ${t('assessments.residual')}: ${item.residualScore} (${item.residualLabel})`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteItemMut.mutate(item.id);
                    }}
                    className="text-muted-foreground hover:text-destructive shrink-0 cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {expandedItemId === item.id && (
                  <div className="border-t border-border p-4 bg-background/40">
                    <p className="text-xs font-medium text-muted-foreground mb-2">
                      {t('assessments.linkedControls')}
                    </p>
                    <AssessmentItemControls
                      itemId={item.id}
                      availableControls={controls.map((c) => ({ id: c.id, code: c.code, title: c.title }))}
                    />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('assessments.addItem')}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateItem} className="space-y-3">
            <div>
              <Label>{t('assessments.subject')}</Label>
              <Input
                value={itemForm.subject}
                onChange={(e) => setItemForm((f) => ({ ...f, subject: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label>{t('assessments.description')}</Label>
              <textarea
                value={itemForm.description}
                onChange={(e) => setItemForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('assessments.inherentLikelihood')}</Label>
                <select
                  value={itemForm.inherentLikelihood || ''}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, inherentLikelihood: Number(e.target.value) }))
                  }
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
                <Label>{t('assessments.inherentImpact')}</Label>
                <select
                  value={itemForm.inherentImpact || ''}
                  onChange={(e) =>
                    setItemForm((f) => ({ ...f, inherentImpact: Number(e.target.value) }))
                  }
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
              <Button type="submit" disabled={createItemMut.isPending}>
                {t('assessments.addItem')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
```

Reuses `risks.selectLikelihood`/`risks.selectImpact` i18n keys (already exist from Risk Register) rather than duplicating equivalent new keys — intentional, matching how this codebase already shares `risks.scale.*` between the two features.

- [ ] **Step 3: Build**

Run: `npx prettier --write apps/client/src/routes/_dashboard/-assessment-detail.page.tsx && yarn nx lint client && yarn nx build client`
Expected: PASS (fix the `useInternalControls` import if the real hook has a different name — this is exactly the kind of verify-before-use step flagged in Step 1).

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/routes/_dashboard/-assessment-detail.page.tsx
git commit -m "feat(client): add Items tab with inherent scoring, control mapping, and add-item dialog"
```

---

### Task 22: i18n — en/es/he/ru keys

**Files:**
- Modify: `libs/template-shared/src/lib/i18n/locales/{en,es,he,ru}.ts`

- [ ] **Step 1: Grep the actual code for every `t('assessments.` call across all files touched by Tasks 18-21** (the same "grep for the authoritative key list, don't just trust a plan-time guess" discipline Risk Register's Task 24 used) — `apps/client/src/routes/_dashboard/-assessments.page.tsx`, `-assessment-detail.page.tsx`, `apps/client/src/components/assessments/AssessmentTypesSheet.tsx`, `AssessmentItemControls.tsx`.

- [ ] **Step 2: Replace the existing `assessments:` block in `en.ts`** (currently has `subtitle`/`newDescription`/`type`/`typeLabel.*`/`scope*`/`avgScore`/`mitigations*` — several of these are now dead since the type-select buttons and free-text scope field are gone) with a block containing exactly the keys the real code uses. Keep any keys still referenced (e.g. `empty`, `backToList`, `notFound`, `subject`, `subjectPlaceholder`, `description`, `addItem`, `noItems` likely survive with the same meaning) and add every new key: `summaryActive`, `summaryPendingReview`, `summaryOverdue`, `manageTypes`, `typeNamePlaceholder`, `itemNounSingularPlaceholder`, `itemNounPluralPlaceholder`, `archiveTypeConfirmTitle`, `archiveTypeConfirmDescription`, `selectType`, `owner`, `businessUnit`, `dueDate`, `approver`, `inScopeAssets`, `inScopeVendors`, `noAssets`, `noVendors`, `deleteConfirmTitle`, `deleteConfirmDescription`, `colCode`, `colTitle`, `colType`, `colOwner`, `colInherent`, `colResidual`, `colStatus`, `detailTitle`, `tab.overview`, `tab.items`, `start`, `submitForReview`, `approve`, `requestChanges`, `complete`, `archive`, `changesNotePlaceholder`, `lastReviewNote`, `itemsPlaceholder`, `inherent`, `residual`, `linkedControls`, `selectControl`, `inherentLikelihood`, `inherentImpact`, and a rebuilt `status.*` map with the 7 new lifecycle values (`draft`/`in_progress`/`pending_review`/`changes_requested`/`approved`/`completed`/`archived`).

- [ ] **Step 3: Translate the same key set into `es.ts`, `he.ts`, `ru.ts`** with real, idiomatic translations — do not skip any locale, do not copy English.

- [ ] **Step 4: Verify key-set parity** across all 4 locales by extracting and diffing the key paths under `assessments`, same technique used in Risk Register's Task 24.

- [ ] **Step 5: Build**

Run: `yarn nx build template-shared && yarn nx build client`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add libs/template-shared/src/lib/i18n/locales/en.ts libs/template-shared/src/lib/i18n/locales/es.ts libs/template-shared/src/lib/i18n/locales/he.ts libs/template-shared/src/lib/i18n/locales/ru.ts
git commit -m "feat(i18n): add Assessment Phase B.1 strings across en/es/he/ru"
```

---

### Task 23: Client unit tests

**Files:**
- Create: `apps/client/src/routes/_dashboard/__tests__/assessments.unit.test.tsx`
- Create: `apps/client/src/routes/_dashboard/__tests__/assessment-detail.unit.test.tsx`

Model these on `apps/client/src/routes/_dashboard/__tests__/risks.unit.test.tsx` / `risks-detail.unit.test.tsx` — read both first for this repo's established mocking pattern (`@/queries/*` module mocks, `useAuthStore` mocking for the approver-gate test) before writing.

- [ ] **Step 1: `assessments.unit.test.tsx`** — cover: KPI summary renders correct counts from a fixture `Assessment[]`; table renders assessment rows (code/title/type/owner/inherent/residual/status); clicking "New Assessment" opens the create Dialog; submitting with valid required fields (title/type/owner) calls the mocked `useCreateAssessment` mutation; submission is blocked when title/type/owner are missing; clicking a row navigates to the detail route; delete button opens the AlertDialog and confirming calls the mocked `useDeleteAssessment` mutation; delete click doesn't trigger row navigation (`stopPropagation`).

- [ ] **Step 2: `assessment-detail.unit.test.tsx`** — cover: Overview tab renders fields from a fixture `Assessment`; lifecycle action buttons render correctly per status+role combination (mock `useAuthStore` to return a matching/non-matching user id and assert the right buttons show/hide — e.g. Approve/Request-Changes only show for `status: 'pending_review'` AND `currentUserId === approverId`); clicking Start/Submit/Approve/Complete/Archive calls the corresponding mocked mutation; Items tab renders fixture `AssessmentItem[]`, expanding an item shows `AssessmentItemControls`; Add Item dialog blocks submission without likelihood/impact selected.

- [ ] **Step 3: Run both**

Run: `yarn nx test client -- assessment`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/client/src/routes/_dashboard/__tests__/assessments.unit.test.tsx apps/client/src/routes/_dashboard/__tests__/assessment-detail.unit.test.tsx
git commit -m "test(client): cover Assessment list, detail, and lifecycle action gating"
```

---

### Task 24: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full affected pipeline**

Run: `yarn nx affected -t lint,build,test --base=dev --head=HEAD`
Expected: all green across `shared`, `notes`, `notes-client`, `api`, `client`, `template-shared`.

- [ ] **Step 2: Manual smoke check (Playwright, mandatory per this repo's AGENTS.md)**

Start the stack (Fake-strategy dev environment — set up `.env` files the same way Risk Register's verification did: TCP transport vars present, provider vars blank/malformed so every MS falls back to Fake). Navigate to `/assessments`, confirm: KPI bar shows real numbers, "Manage Types" opens the settings Sheet with the 2 default types seeded, creating an assessment via the Dialog blocks submission until title/type/owner are filled, the new assessment appears with a real `ASM-XXXXXX` code, clicking a row opens the detail page, Start/Submit-for-Review/Approve/Request-Changes/Complete/Archive buttons appear and disappear correctly as you drive an assessment through its full lifecycle (create a second browser session or manually swap the mocked/logged-in user's id between owner and approver roles to verify both sides of the gate — or verify via direct API calls with different session tokens if the UI can't easily simulate a second user), adding an item shows real methodology-driven likelihood/impact options and computes a real inherent score, expanding an item shows the Controls mini-table and linking a real control works, deleting an assessment via the AlertDialog removes it cleanly.

- [ ] **Step 3: Report status**

If everything above is green, Phase B.1 is complete and ready for PR against `dev`. Phase B.2 (guided wizard + Risk Register bridge + Findings→Issue bridge) is a separate spec/plan that starts once this one is reviewed and merged.
