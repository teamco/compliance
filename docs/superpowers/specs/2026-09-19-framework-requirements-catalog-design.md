# Framework Requirements Catalog — Design

Status: implemented (Phase 1), premise correction below
Date: 2026-09-19

**Correction (post-implementation, final review):** the paragraph below
originally claimed `public.controls` "has never been seeded for any
framework." That's false — `supabase/migrations/20260606000002_notes_seed.sql`
seeds 10 rows each for SOC 2, ISO 27001, NIST CSF 2.0, and GDPR, and this is
confirmed live in the dev database (the Frameworks list's `requirementsCount`
badges query `controls` directly and showed 10/10/10/10/0/0 across the six
frameworks before this branch's changes). Only CIS Controls v8 and PCI DSS
v4.0.1 (0 seeded rows) match the original "always empty" description. For the
other four, the pre-existing `listRequirements` returned 10 fabricated-status
rows (`applicability: 'applicable'`, `implementationStatus: 'implemented'`
hardcoded) — not an empty list. This branch's fix is still correct and
needed (the no-op save bug and the fabricated status were real regardless),
but it also means real orgs using those 4 frameworks see 40 existing rows
flip from fabricated `applicable`/`implemented` to honest
`not_determined`/`not_implemented` once shipped — a data-semantics change
confirmed and approved by the project owner, not a silent side effect.

## Problem

The Frameworks workspace's "Requirements" tab and "Open Requirements" button
render empty for CIS Controls v8 and PCI DSS v4.0.1 (0 seeded `controls`
rows), and return fabricated status data for SOC 2, ISO 27001, NIST CSF 2.0,
and GDPR (10 seeded rows each, but with hardcoded fake status — see
correction above). Root cause, traced in
`apps/microservices/notes/src/app/supabase-notes.strategy.ts:254-270`:

`listRequirements` fabricates "requirements" by reading `public.controls`
filtered by `framework_id` and hardcoding `applicability: 'applicable'`,
`implementationStatus: 'implemented'` on every row, regardless of whether any
org has actually reviewed that requirement. Separately, `updateRequirement`
(`supabase-notes.strategy.ts:281-290`) never writes to the database — it
returns `{ ...req, ...patch }` and discards it. The drawer's "Save Changes"
button silently does nothing today.

Migration comments already establish the intended design:
`supabase/migrations/20260606000001_notes_schema.sql:1-2` — "Compliance
frameworks (seeded static data)" / "Framework controls (seeded, FK →
frameworks)". `public.controls` is meant to be the official, immutable
requirement catalog per framework. It was simply never populated, and the
per-org mutable state (applicability, implementation, scope, etc.) was never
given a real home.

The `FakeNotesStrategy` test double (`libs/shared/src/strategies/fakes/fake-notes.ts:433`
onward) already contains a hand-written NIST CSF 2.0 catalog used only for
tests/dev-fake-mode — proof the data shape is well understood, but it was
never wired into the real backend.

## Goals

1. `public.controls` becomes a real, seeded, immutable requirement catalog
   for at least NIST CSF 2.0 and CIS Controls v8 (round 1). Content is
   summarized/paraphrased from real published sources — not model-recalled
   fabrication, and not verbatim copyrighted reproduction.
2. Org-specific requirement state (applicability, implementation, scope,
   ownership, review dates) persists for real, per org, per requirement.
3. `RequirementDrawer`'s "Save Changes" button actually saves.
4. Catalog editing (fixing/updating baseline text) is a backend script, not
   a UI surface, for this round — no platform-admin role exists yet and
   building one is out of scope here.
5. Other 13 frameworks remain empty (tab shows empty state, button disabled)
   until seeded in follow-up work — this spec does not block on them.

## Non-goals

- No platform/superadmin role or catalog-editing UI (deferred).
- No per-org customization of baseline requirement text (catalog stays
  global/shared, per earlier decision).
- No seeding of the other 13 frameworks (ISO 27001, SOC 2, PCI-DSS, GDPR,
  etc.) — separate follow-up work, each independently researched.
- No change to `internal_controls` / `internal_control_framework_mappings`
  (org's own control implementations) — those already work and stay as-is,
  linked to the catalog only by `requirement_code` text match as today.

## Architecture

### Schema changes

**Extend `public.controls`** (already exists — add columns needed to
render the drawer's "Area 1: Requirement" immutable content, currently
absent):

```sql
alter table public.controls
  add column function_code text,
  add column function_name text,
  add column guidance text,
  add column informative_references text[] default '{}',
  add column cross_framework_mappings jsonb default '[]';
```

(`informative_references` avoids the reserved SQL keyword `references`;
strategy code maps it to `FrameworkRequirement.references` on read.)

`category` (existing column) maps to `categoryName`; add `category_code`
alongside it for the function/category filter UI
(`frameworks_.$id.tsx:197-198` filters on `req.functionCode` /
`req.categoryCode`):

```sql
alter table public.controls
  add column category_code text;
```

**New table `org_requirement_status`** — the org-scoped override that
`updateRequirement` should actually write to. One row per
(org, control) once an org touches that requirement; absence of a row
means defaults (not_determined / not_implemented, matching
`RequirementDrawer.tsx:78,86` initial state):

```sql
create table public.org_requirement_status (
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

create index org_requirement_status_org_id_idx on public.org_requirement_status(org_id);

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

RLS pattern copied verbatim from `internal_controls`
(`supabase/migrations/20260912000001_internal_controls.sql:39-49`).

### Backend wiring (`supabase-notes.strategy.ts`)

- `listRequirements(frameworkId, orgId)`: select from `controls` (by
  `framework_id`) left-joined with `org_requirement_status` (by
  `control_id` + `org_id`). Map to `FrameworkRequirement`, using the
  override row's fields when present, else the column defaults above.
- `getRequirement(frameworkId, reqId, orgId)`: same join, filtered to one
  row, matching by `control_id` or `code` (unchanged public signature).
- `updateRequirement(frameworkId, reqId, orgId, patch)`: resolve
  `control_id` from `controls` by id/code, then `upsert` into
  `org_requirement_status` on `(org_id, control_id)` with the patch
  fields, returning the merged `FrameworkRequirement`. This is the fix for
  the silent no-op bug.
- `_orgId` parameter on `listRequirements`/the underlying private helper
  stops being unused — it becomes required for the join. Public
  `MessagePattern` signatures in `notes.controller.ts` already pass
  `orgId` through; no controller/DTO change needed.

### Seed script (round 1 data)

A standalone script under `apps/microservices/notes/scripts/` (run
manually, not part of app boot — matches the "backend-only, no UI"
decision) that upserts rows into `public.controls` for:

- NIST CSF 2.0 (106 requirements)
- CIS Controls v8 (153 safeguards)

Content is summarized/paraphrased (not verbatim) from the real published
NIST CSF 2.0 and CIS Controls v8 documents, researched via web search as
a separate, dedicated implementation task — not generated from model
recall. Upsert is idempotent on `controls(framework_id, code)` (existing
unique constraint) so the script can be re-run safely to correct entries.

This is the large, research-heavy half of the work and is sequenced as
its own implementation phase, separate from the schema/wiring phase below.

## Data flow

1. Org opens a framework's Requirements tab →
   `useFrameworkRequirements(frameworkId, orgId)` →
   `notes.frameworks.requirements.list` → `listRequirements` joins
   `controls` + `org_requirement_status` → tab renders real rows for
   NIST CSF 2.0 / CIS Controls v8, still empty for unseeded frameworks
   (expected, not a bug).
2. Org opens the drawer, edits Applicability/Implementation, clicks Save →
   `useUpdateRequirement` → `notes.frameworks.requirements.update` →
   `updateRequirement` upserts `org_requirement_status` → refetch shows
   persisted state (survives reload, unlike today).
3. Baseline text (title/description/guidance/references) is read-only in
   the UI (already enforced — "Immutable Source Content" panel has no
   inputs) and only ever changes via re-running the seed script.

## Error handling

- `updateRequirement` on an unknown `reqId`/`control_id`: keep existing
  `requirement_not_found` throw.
- Seed script: upsert (not insert) so re-running after a content fix
  doesn't duplicate or fail on the unique constraint.
- No new client-facing error states — the empty-tab state for unseeded
  frameworks already renders correctly (this spec doesn't change that UI).

## Testing

- Strategy unit tests (`libs/shared` / notes strategy test suite pattern):
  join logic returns catalog defaults when no override row exists, and
  returns override values once one is written.
- `updateRequirement` test: call twice with different patches, assert the
  second read reflects the latest patch (regression test for the no-op
  bug being fixed).
- Seed script: idempotency test — running it twice yields the same row
  count and no duplicate-key errors.
- No new frontend tests needed — `frameworks.unit.test.tsx` already
  covers the drawer/list UI against the `FrameworkRequirement` shape,
  which is unchanged.

## Sequencing

- **Phase 1 (mechanical, small)**: migrations + strategy wiring +
  strategy tests. Fixes the save-no-op bug immediately even before any
  content is seeded.
- **Phase 2 (research-heavy, large)**: seed script + NIST CSF 2.0 content
  + CIS Controls v8 content, researched and verified against real
  published sources.
