-- risk_assessments
create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  user_id uuid not null,
  type text not null check (type in ('cvra','ctra')),
  title text not null,
  scope text not null default '',
  status text not null default 'draft' check (status in ('draft','in_review','completed')),
  risk_score int not null default 0,
  item_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index risk_assessments_org_id_idx on public.risk_assessments(org_id);

alter table public.risk_assessments enable row level security;
create policy "org members read assessments"
  on public.risk_assessments for select using (true);
create policy "users manage own assessments"
  on public.risk_assessments for all using (auth.uid() = user_id);

-- risk_assessment_items
create table public.risk_assessment_items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.risk_assessments(id) on delete cascade,
  subject text not null,
  description text not null default '',
  likelihood text not null default 'medium' check (likelihood in ('very_low','low','medium','high','very_high')),
  impact text not null default 'medium' check (impact in ('very_low','low','medium','high','very_high')),
  item_score int not null default 9,
  mitigations text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index risk_assessment_items_assessment_id_idx on public.risk_assessment_items(assessment_id);

alter table public.risk_assessment_items enable row level security;
create policy "items inherit assessment access"
  on public.risk_assessment_items for all
  using (
    exists (
      select 1 from public.risk_assessments ra
      where ra.id = assessment_id and ra.user_id = auth.uid()
    )
  );
