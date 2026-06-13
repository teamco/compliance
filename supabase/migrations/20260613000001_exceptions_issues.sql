-- exceptions
create table public.exceptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  user_id uuid not null,
  control_code text not null,
  standard_code text,
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  title text not null,
  justification text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index exceptions_org_id_idx on public.exceptions(org_id);

alter table public.exceptions enable row level security;

create policy "org members read exceptions"
  on public.exceptions for select
  using (true);

create policy "users manage own exceptions"
  on public.exceptions for all
  using (auth.uid() = user_id);

-- issues
create table public.issues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  user_id uuid not null,
  title text not null,
  description text not null,
  severity text not null default 'medium' check (severity in ('critical','high','medium','low','info')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','wont_fix')),
  source text not null default 'manual' check (source in ('manual','gap_analysis','vendor_risk')),
  source_id uuid,
  due_date timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index issues_org_id_idx on public.issues(org_id);
create index issues_status_idx on public.issues(status);

alter table public.issues enable row level security;

create policy "org members read issues"
  on public.issues for select
  using (true);

create policy "users manage own issues"
  on public.issues for all
  using (auth.uid() = user_id);
