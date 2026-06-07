-- Drop the one-org-per-user constraint so a user can own many orgs
alter table public.org_profiles
  drop constraint if exists org_profiles_user_id_key;

-- ---------------------------------------------------------------------------
-- organization_members  (v2 scaffold — no API / UI in v1)
-- ---------------------------------------------------------------------------
create table if not exists public.organization_members (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.org_profiles(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'viewer' check (role in ('owner', 'admin', 'viewer')),
  joined_at timestamptz not null default now(),
  unique(org_id, user_id)
);
alter table public.organization_members enable row level security;
drop policy if exists "org_members_own" on public.organization_members;
create policy "org_members_own"
  on public.organization_members for all
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- gap_analyses  (persist gap analysis results)
-- ---------------------------------------------------------------------------
create table if not exists public.gap_analyses (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.org_profiles(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  doc_id     uuid references public.generated_standards(id) on delete set null,
  result     jsonb not null,
  risk_score int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.gap_analyses enable row level security;
drop policy if exists "gap_analyses_own" on public.gap_analyses;
create policy "gap_analyses_own"
  on public.gap_analyses for all
  using (auth.uid() = user_id);

create index if not exists gap_analyses_org_id_idx  on public.gap_analyses(org_id);
create index if not exists org_members_org_id_idx   on public.organization_members(org_id);
create index if not exists gap_analyses_user_id_idx  on public.gap_analyses(user_id);
create index if not exists org_members_user_id_idx   on public.organization_members(user_id);
