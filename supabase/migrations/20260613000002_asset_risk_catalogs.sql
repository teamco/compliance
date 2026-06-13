-- assets
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  user_id uuid not null,
  name text not null,
  type text not null default 'other' check (type in ('service','application','infrastructure','data','device','other')),
  criticality text not null default 'medium' check (criticality in ('critical','high','medium','low')),
  description text not null default '',
  owner text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assets_org_id_idx on public.assets(org_id);

alter table public.assets enable row level security;

create policy "org members read assets"
  on public.assets for select using (true);

create policy "users manage own assets"
  on public.assets for all using (auth.uid() = user_id);

-- risks
create table public.risks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  user_id uuid not null,
  title text not null,
  description text not null,
  category text not null,
  likelihood text not null default 'medium' check (likelihood in ('very_low','low','medium','high','very_high')),
  impact text not null default 'medium' check (impact in ('very_low','low','medium','high','very_high')),
  risk_score int not null default 9,
  treatment text not null default 'mitigate' check (treatment in ('accept','mitigate','transfer','avoid')),
  asset_id uuid references public.assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index risks_org_id_idx on public.risks(org_id);

alter table public.risks enable row level security;

create policy "org members read risks"
  on public.risks for select using (true);

create policy "users manage own risks"
  on public.risks for all using (auth.uid() = user_id);
