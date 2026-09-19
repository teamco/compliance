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
