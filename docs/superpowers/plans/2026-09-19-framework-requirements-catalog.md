# Framework Requirements Catalog — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `public.controls` a real seeded requirement catalog and give org-specific requirement state (applicability, implementation, scope, ownership) a real persisted home, fixing both the empty Requirements tab and the silent "Save Changes" no-op bug — without seeding any actual framework content yet (that's Phase 2, separate plan, research-heavy).

**Architecture:** Extend the existing `public.controls` table (already the intended immutable catalog per its own migration comment) with the columns the drawer's "Immutable Source Content" panel needs. Add a new org-scoped `public.org_requirement_status` table for everything the drawer's Applicability/Implementation tabs edit. Rewire `SupabaseNotesStrategy.listRequirements` / `getRequirement` / `updateRequirement` to read/write these two tables instead of fabricating data in memory.

**Tech Stack:** NestJS microservice (`apps/microservices/notes`), Supabase/Postgres, Vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-09-19-framework-requirements-catalog-design.md`

## Global Constraints

- Baseline catalog (`controls`) stays global/shared across orgs — no per-org copies.
- No platform-admin role or catalog-editing UI in this phase — catalog is edited only by re-running a future seed script (Phase 2).
- No change to `internal_controls` / `internal_control_framework_mappings` — untouched.
- No new seed data added in this phase (Phase 2 adds real content for CIS Controls v8 / other unseeded frameworks). Correction post-implementation: `controls` is NOT actually empty for every framework — a pre-existing migration (`20260606000002_notes_seed.sql`) already seeds 10 rows each for SOC 2, ISO 27001, NIST CSF 2.0, and GDPR. Only CIS Controls v8 and PCI DSS v4.0.1 have 0 rows and stay empty after this plan. The four seeded frameworks go from fabricated `applicable`/`implemented` status to honest `not_determined`/`not_implemented` — an approved data-semantics fix, not a regression.
- Post-coding routine before any commit, per `AGENTS.md`: `npx prettier --write <files>` → `yarn nx lint notes` → `yarn nx build notes` (build target may not exist for this project — if `nx build notes` errors with "no build target", skip build and note it; lint and test are the real gates for this service).

---

### Task 1: Database migration — extend `controls`, add `org_requirement_status`

**Files:**
- Create: `supabase/migrations/20260919000001_framework_requirements_catalog.sql`

**Interfaces:**
- Produces: columns `controls.category_code`, `controls.function_code`, `controls.function_name`, `controls.guidance`, `controls.informative_references` (`text[]`), `controls.cross_framework_mappings` (`jsonb`); new table `org_requirement_status` with columns `id, org_id, control_id, applicability, applicability_rationale, not_applicable_reason, scope_business_units, scope_systems, scope_locations, scope_legal_entities, implementation_status, implementation_description, control_owner, control_operator, review_frequency, last_assessed, next_assessment, created_at, updated_at`, unique on `(org_id, control_id)`.

- [ ] **Step 1: Write the migration file**

```sql
-- Framework requirements catalog: extend the seeded controls catalog with
-- the fields the Requirements drawer's immutable "Area 1" panel needs, and
-- give org-specific requirement state (applicability, implementation,
-- scope, ownership) a real persisted home instead of the in-memory no-op
-- that updateRequirement used before this migration.

alter table public.controls
  add column if not exists category_code text,
  add column if not exists function_code text,
  add column if not exists function_name text,
  add column if not exists guidance text,
  -- Named informative_references, not "references", because references
  -- is a reserved SQL keyword.
  add column if not exists informative_references text[] not null default '{}',
  add column if not exists cross_framework_mappings jsonb not null default '[]';

create table if not exists public.org_requirement_status (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  control_id uuid not null references public.controls(id) on delete cascade,
  applicability text not null default 'not_determined'
    check (applicability in ('applicable','not_applicable','not_determined')),
  applicability_rationale text not null default '',
  not_applicable_reason text not null default '',
  scope_business_units text[] not null default '{}',
  scope_systems text[] not null default '{}',
  scope_locations text[] not null default '{}',
  scope_legal_entities text[] not null default '{}',
  implementation_status text not null default 'not_implemented'
    check (implementation_status in
      ('not_implemented','planned','partially_implemented','implemented','not_applicable')),
  implementation_description text not null default '',
  control_owner text not null default '',
  control_operator text not null default '',
  review_frequency text not null default 'Annual',
  last_assessed date,
  next_assessment date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, control_id)
);

create index if not exists org_requirement_status_org_id_idx
  on public.org_requirement_status(org_id);

alter table public.org_requirement_status enable row level security;

create policy "org members read org_requirement_status"
  on public.org_requirement_status for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own org_requirement_status"
  on public.org_requirement_status for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );
```

- [ ] **Step 2: Self-review the file**

Read the file back. Checklist:
- Every `alter table` uses `if not exists` (safe to re-run).
- `org_requirement_status` FKs point at `org_profiles(id)` and `controls(id)`, both `on delete cascade` (matches `internal_controls` convention in `supabase/migrations/20260912000001_internal_controls.sql:6-7`).
- RLS policy text matches `internal_controls`' policies verbatim except table/column name (`supabase/migrations/20260912000001_internal_controls.sql:41-49`).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260919000001_framework_requirements_catalog.sql
git commit -m "feat(notes): add framework requirements catalog schema"
```

Note: this migration is not applied automatically by this task — there is no local Supabase/Postgres instance in this environment (no `supabase` CLI, no `supabase/config.toml` project link). Apply it via `supabase db push` (or the Supabase dashboard SQL editor) against the linked project before Task 2's changes reach a live environment.

---

### Task 2: `listRequirements` reads the real catalog + org overrides

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts:254-270` (replace `listRequirements`, add row types + mapping helper)
- Test: `apps/microservices/notes/src/app/__tests__/supabase-notes.requirements.unit.test.ts` (new)

**Interfaces:**
- Consumes: `ok<T>(data, error)` helper already defined at `supabase-notes.strategy.ts:114`; `this.db: SupabaseClient` (constructor param, `supabase-notes.strategy.ts:120`).
- Produces: `toFrameworkRequirement(c: ControlCatalogRow, o: OrgRequirementStatusRow | undefined): FrameworkRequirement` — a module-level function other tasks' code (Task 3, Task 4) call directly.

- [ ] **Step 1: Write the failing tests**

Create `apps/microservices/notes/src/app/__tests__/supabase-notes.requirements.unit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseNotesStrategy } from '../supabase-notes.strategy';

type Row = Record<string, unknown>;

function createMockNotesDb(tables: { controls: Row[]; org_requirement_status: Row[] }) {
  function builder(rows: Row[]) {
    let filtered = rows;
    const chain = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] === val);
        return chain;
      },
      in: (col: string, vals: unknown[]) => {
        filtered = filtered.filter((r) => vals.includes(r[col] as never));
        return chain;
      },
      order: () => chain,
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: filtered, error: null }).then(resolve),
    };
    return chain;
  }

  return {
    from: (table: 'controls' | 'org_requirement_status') => {
      const rows = tables[table];
      return {
        ...builder(rows),
        upsert: (row: Row, opts: { onConflict: string }) => {
          const keys = opts.onConflict.split(',');
          const idx = rows.findIndex((r) => keys.every((k) => r[k] === row[k]));
          if (idx >= 0) rows[idx] = { ...rows[idx], ...row };
          else rows.push(row);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  } as unknown as SupabaseClient;
}

const CONTROL_A: Row = {
  id: 'ctrl-1',
  framework_id: 'fw-1',
  code: 'GV.PO-01',
  title: 'Policy established',
  description: 'Organizational policy is established.',
  category: 'Governance',
  category_code: 'GV.PO',
  function_code: 'GV',
  function_name: 'GOVERN',
  guidance: 'Document and publish the policy.',
  informative_references: ['ISO 27001 A.5.1'],
  cross_framework_mappings: [],
};

describe('SupabaseNotesStrategy.listRequirements', () => {
  it('returns catalog defaults when the org has no override row', async () => {
    const db = createMockNotesDb({ controls: [CONTROL_A], org_requirement_status: [] });
    const strategy = new SupabaseNotesStrategy(db);

    const result = await strategy.listRequirements('fw-1', 'org-1');

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'ctrl-1',
      code: 'GV.PO-01',
      functionCode: 'GV',
      applicability: 'not_determined',
      implementationStatus: 'not_implemented',
    });
  });

  it('merges the org override row over the catalog defaults', async () => {
    const db = createMockNotesDb({
      controls: [CONTROL_A],
      org_requirement_status: [
        {
          org_id: 'org-1',
          control_id: 'ctrl-1',
          applicability: 'applicable',
          applicability_rationale: 'Required by SOC 2.',
          not_applicable_reason: '',
          scope_business_units: ['Engineering'],
          scope_systems: [],
          scope_locations: [],
          scope_legal_entities: [],
          implementation_status: 'implemented',
          implementation_description: 'Policy published on the intranet.',
          control_owner: 'CISO',
          control_operator: 'SecOps',
          review_frequency: 'Annual',
          last_assessed: null,
          next_assessment: null,
        },
      ],
    });
    const strategy = new SupabaseNotesStrategy(db);

    const result = await strategy.listRequirements('fw-1', 'org-1');

    expect(result[0]).toMatchObject({
      applicability: 'applicable',
      applicabilityRationale: 'Required by SOC 2.',
      implementationStatus: 'implemented',
      controlOwner: 'CISO',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test notes -- supabase-notes.requirements.unit.test.ts`
Expected: FAIL — current `listRequirements` returns `applicability: 'applicable'` / `implementationStatus: 'implemented'` unconditionally (hardcoded), so the first test's `not_determined` / `not_implemented` expectation fails, and it never reads `org_requirement_status` at all, so the second test's override fields don't show up either.

- [ ] **Step 3: Replace `listRequirements` with the real implementation**

In `apps/microservices/notes/src/app/supabase-notes.strategy.ts`, replace the existing `listRequirements` method (lines 254-270) with:

```ts
interface ControlCatalogRow {
  id: string;
  framework_id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  category_code: string | null;
  function_code: string | null;
  function_name: string | null;
  guidance: string | null;
  informative_references: string[] | null;
  cross_framework_mappings: RequirementMapping[] | null;
}

interface OrgRequirementStatusRow {
  control_id: string;
  applicability: FrameworkApplicabilityStatus;
  applicability_rationale: string;
  not_applicable_reason: string;
  scope_business_units: string[];
  scope_systems: string[];
  scope_locations: string[];
  scope_legal_entities: string[];
  implementation_status: ImplementationStatus;
  implementation_description: string;
  control_owner: string;
  control_operator: string;
  review_frequency: string;
  last_assessed: string | null;
  next_assessment: string | null;
}

function toFrameworkRequirement(
  c: ControlCatalogRow,
  o: OrgRequirementStatusRow | undefined,
): FrameworkRequirement {
  return {
    id: c.id,
    frameworkId: c.framework_id,
    code: c.code,
    title: c.title,
    description: c.description,
    functionCode: c.function_code ?? undefined,
    functionName: c.function_name ?? undefined,
    categoryCode: c.category_code ?? c.code.split('-')[0] ?? c.code,
    categoryName: c.category,
    guidance: c.guidance ?? undefined,
    references: c.informative_references ?? undefined,
    crossFrameworkMappings: c.cross_framework_mappings ?? undefined,
    applicability: o?.applicability ?? 'not_determined',
    applicabilityRationale: o?.applicability_rationale ?? '',
    notApplicableReason: o?.not_applicable_reason ?? '',
    scopeBusinessUnits: o?.scope_business_units ?? [],
    scopeSystems: o?.scope_systems ?? [],
    scopeLocations: o?.scope_locations ?? [],
    scopeLegalEntities: o?.scope_legal_entities ?? [],
    implementationStatus: o?.implementation_status ?? 'not_implemented',
    implementationDescription: o?.implementation_description ?? '',
    controlOwner: o?.control_owner ?? '',
    controlOperator: o?.control_operator ?? '',
    reviewFrequency: o?.review_frequency ?? 'Annual',
    lastAssessed: o?.last_assessed ?? undefined,
    nextAssessment: o?.next_assessment ?? undefined,
    evidenceCount: 0,
    mappedControlsCount: 0,
    openFindingsCount: 0,
  };
}
```

Then, as the class method (keep it inside `SupabaseNotesStrategy`):

```ts
  async listRequirements(frameworkId: string, orgId?: string): Promise<FrameworkRequirement[]> {
    const { data, error } = await this.db
      .from('controls')
      .select(
        'id, framework_id, code, title, description, category, category_code, function_code, function_name, guidance, informative_references, cross_framework_mappings',
      )
      .eq('framework_id', frameworkId)
      .order('code');
    const controls = ok(data, error) as ControlCatalogRow[];
    if (controls.length === 0 || !orgId) {
      return controls.map((c) => toFrameworkRequirement(c, undefined));
    }

    const { data: statusData, error: statusError } = await this.db
      .from('org_requirement_status')
      .select(
        'control_id, applicability, applicability_rationale, not_applicable_reason, scope_business_units, scope_systems, scope_locations, scope_legal_entities, implementation_status, implementation_description, control_owner, control_operator, review_frequency, last_assessed, next_assessment',
      )
      .eq('org_id', orgId)
      .in(
        'control_id',
        controls.map((c) => c.id),
      );
    const statuses = ok(statusData, statusError) as OrgRequirementStatusRow[];
    const byControlId = new Map(statuses.map((s) => [s.control_id, s]));
    return controls.map((c) => toFrameworkRequirement(c, byControlId.get(c.id)));
  }
```

Place the two interfaces and the `toFrameworkRequirement` function above the `SupabaseNotesStrategy` class (near the `ok()` helper at line 114), not inside it — they're plain module-level helpers, matching how `ok()` is already scoped.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn nx test notes -- supabase-notes.requirements.unit.test.ts`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/__tests__/supabase-notes.requirements.unit.test.ts
git commit -m "feat(notes): read framework requirements from real catalog + org overrides"
```

---

### Task 3: `getRequirement` and `updateRequirement` persist for real

**Files:**
- Modify: `apps/microservices/notes/src/app/supabase-notes.strategy.ts:272-290` (`getRequirement` stays as-is logically but now benefits from Task 2's real data; `updateRequirement` gets rewritten)
- Test: `apps/microservices/notes/src/app/__tests__/supabase-notes.requirements.unit.test.ts` (extend)

**Interfaces:**
- Consumes: `toFrameworkRequirement`, `ControlCatalogRow`, `OrgRequirementStatusRow` from Task 2.
- Produces: `updateRequirement(frameworkId, reqId, orgId, patch): Promise<FrameworkRequirement>` that actually persists (public signature unchanged from the `NotesStrategy` interface).

- [ ] **Step 1: Write the failing tests**

Append to `apps/microservices/notes/src/app/__tests__/supabase-notes.requirements.unit.test.ts`:

```ts
describe('SupabaseNotesStrategy.getRequirement', () => {
  it('finds a requirement by code within a framework', async () => {
    const db = createMockNotesDb({ controls: [CONTROL_A], org_requirement_status: [] });
    const strategy = new SupabaseNotesStrategy(db);

    const result = await strategy.getRequirement('fw-1', 'GV.PO-01', 'org-1');

    expect(result?.id).toBe('ctrl-1');
  });

  it('returns null for an unknown requirement', async () => {
    const db = createMockNotesDb({ controls: [CONTROL_A], org_requirement_status: [] });
    const strategy = new SupabaseNotesStrategy(db);

    const result = await strategy.getRequirement('fw-1', 'does-not-exist', 'org-1');

    expect(result).toBeNull();
  });
});

describe('SupabaseNotesStrategy.updateRequirement', () => {
  it('persists the patch so a later read reflects it', async () => {
    const db = createMockNotesDb({ controls: [CONTROL_A], org_requirement_status: [] });
    const strategy = new SupabaseNotesStrategy(db);

    await strategy.updateRequirement('fw-1', 'ctrl-1', 'org-1', {
      applicability: 'applicable',
      implementationStatus: 'implemented',
      controlOwner: 'CISO',
    });
    const reread = await strategy.getRequirement('fw-1', 'ctrl-1', 'org-1');

    expect(reread).toMatchObject({
      applicability: 'applicable',
      implementationStatus: 'implemented',
      controlOwner: 'CISO',
    });
  });

  it('applying a second patch does not lose the first patch\'s other fields', async () => {
    const db = createMockNotesDb({ controls: [CONTROL_A], org_requirement_status: [] });
    const strategy = new SupabaseNotesStrategy(db);

    await strategy.updateRequirement('fw-1', 'ctrl-1', 'org-1', { controlOwner: 'CISO' });
    await strategy.updateRequirement('fw-1', 'ctrl-1', 'org-1', {
      implementationStatus: 'implemented',
    });
    const reread = await strategy.getRequirement('fw-1', 'ctrl-1', 'org-1');

    expect(reread).toMatchObject({
      controlOwner: 'CISO',
      implementationStatus: 'implemented',
    });
  });

  it('throws requirement_not_found for an unknown requirement', async () => {
    const db = createMockNotesDb({ controls: [CONTROL_A], org_requirement_status: [] });
    const strategy = new SupabaseNotesStrategy(db);

    await expect(
      strategy.updateRequirement('fw-1', 'does-not-exist', 'org-1', {}),
    ).rejects.toThrow('requirement_not_found');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `yarn nx test notes -- supabase-notes.requirements.unit.test.ts`
Expected: FAIL on all four new tests — `getRequirement` currently calls `this.listRequirements(frameworkId, orgId)` with the *old* signature order matching fine, but `updateRequirement` returns `{ ...req, ...patch }` without writing to `org_requirement_status`, so `getRequirement`'s fresh read afterward won't see the patch (it re-queries from scratch each time).

- [ ] **Step 3: Replace `updateRequirement`**

Replace `apps/microservices/notes/src/app/supabase-notes.strategy.ts:281-290`:

```ts
  async updateRequirement(
    frameworkId: string,
    reqId: string,
    orgId: string,
    patch: FrameworkRequirementPatch,
  ): Promise<FrameworkRequirement> {
    const req = await this.getRequirement(frameworkId, reqId, orgId);
    if (!req) throw new Error(`requirement_not_found: ${reqId}`);

    const merged: FrameworkRequirement = { ...req, ...patch };
    const { error } = await this.db.from('org_requirement_status').upsert(
      {
        org_id: orgId,
        control_id: req.id,
        applicability: merged.applicability,
        applicability_rationale: merged.applicabilityRationale ?? '',
        not_applicable_reason: merged.notApplicableReason ?? '',
        scope_business_units: merged.scopeBusinessUnits ?? [],
        scope_systems: merged.scopeSystems ?? [],
        scope_locations: merged.scopeLocations ?? [],
        scope_legal_entities: merged.scopeLegalEntities ?? [],
        implementation_status: merged.implementationStatus,
        implementation_description: merged.implementationDescription ?? '',
        control_owner: merged.controlOwner ?? '',
        control_operator: merged.controlOperator ?? '',
        review_frequency: merged.reviewFrequency ?? 'Annual',
        last_assessed: merged.lastAssessed || null,
        next_assessment: merged.nextAssessment || null,
      },
      { onConflict: 'org_id,control_id' },
    );
    if (error) throw new Error(error.message);
    return merged;
  }
```

`getRequirement` itself (lines 272-279) does not need to change — it already calls `this.listRequirements(frameworkId, orgId)` and finds by id/code, which now returns real merged data thanks to Task 2.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `yarn nx test notes -- supabase-notes.requirements.unit.test.ts`
Expected: PASS (all 6 tests in the file)

- [ ] **Step 5: Commit**

```bash
git add apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/__tests__/supabase-notes.requirements.unit.test.ts
git commit -m "fix(notes): persist requirement applicability/implementation updates"
```

---

### Task 4: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Format**

```bash
npx prettier --write apps/microservices/notes/src/app/supabase-notes.strategy.ts apps/microservices/notes/src/app/__tests__/supabase-notes.requirements.unit.test.ts supabase/migrations/20260919000001_framework_requirements_catalog.sql
```

- [ ] **Step 2: Lint**

```bash
yarn nx lint notes
```

Expected: 0 errors (pre-existing warnings elsewhere in the project, if any, are not this plan's concern).

- [ ] **Step 3: Full test suite for the notes service**

```bash
yarn nx test notes
```

Expected: all tests pass, including the new file and every pre-existing test (confirms nothing else in `supabase-notes.strategy.ts` broke).

- [ ] **Step 4: Build (best-effort)**

```bash
yarn nx build notes
```

If this errors with "no build target" or similar (some NestJS microservices in this repo may only define `serve`/`test`/`lint`), skip it — lint + test are the real gates for this service. If it runs, expected: success.

- [ ] **Step 5: Final commit if any formatting changes were made**

```bash
git add -A
git commit -m "chore(notes): prettier pass on requirements catalog changes"
```

(Skip this step entirely if Step 1 made no changes.)
