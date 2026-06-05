-- Compliance frameworks (seeded static data)
create table if not exists public.frameworks (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  version     text not null,
  category    text not null check (category in ('security','privacy','cloud','risk')),
  created_at  timestamptz default now()
);

-- Framework controls (seeded, FK → frameworks)
create table if not exists public.controls (
  id           uuid primary key default gen_random_uuid(),
  framework_id uuid references public.frameworks(id) on delete cascade,
  code         text not null,
  title        text not null,
  description  text,
  category     text,
  created_at   timestamptz default now(),
  unique(framework_id, code)
);

-- Organization profiles (one per user for Phase 1)
create table if not exists public.org_profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  name        text not null,
  industry    text not null,
  size        text not null check (size in ('startup','smb','enterprise')),
  regions     text[] default '{}',
  tech_stack  text[] default '{}',
  regulations text[] default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique(user_id)
);

-- AI-generated standards documents
create table if not exists public.generated_standards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  org_profile_id  uuid references public.org_profiles(id) on delete cascade,
  framework_ids   uuid[] not null default '{}',
  controls        jsonb not null default '[]',
  status          text not null default 'pending' check (status in ('pending','completed','failed')),
  created_at      timestamptz default now()
);

-- Indexes for common queries
create index if not exists controls_framework_id_idx on public.controls(framework_id);
create index if not exists org_profiles_user_id_idx  on public.org_profiles(user_id);
create index if not exists gen_standards_user_id_idx on public.generated_standards(user_id);

-- RLS
alter table public.frameworks         enable row level security;
alter table public.controls           enable row level security;
alter table public.org_profiles       enable row level security;
alter table public.generated_standards enable row level security;

-- Frameworks + controls: readable by any authenticated user (public catalog)
create policy "frameworks_select"
  on public.frameworks for select
  using (auth.role() = 'authenticated');

create policy "controls_select"
  on public.controls for select
  using (auth.role() = 'authenticated');

-- Org profiles: full access for own row only
create policy "org_profiles_own"
  on public.org_profiles for all
  using (auth.uid() = user_id);

-- Generated standards: full access for own rows only
create policy "gen_standards_own"
  on public.generated_standards for all
  using (auth.uid() = user_id);
