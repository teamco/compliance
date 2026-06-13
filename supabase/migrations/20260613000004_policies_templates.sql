-- policy_templates (platform-wide, seeded)
create table public.policy_templates (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  title text not null,
  content text not null,
  created_at timestamptz not null default now()
);

create index policy_templates_framework_id_idx on public.policy_templates(framework_id);

-- Seed one template per framework (content is generic, intended to be customized)
insert into public.policy_templates (framework_id, title, content)
select
  id,
  name || ' Policy Template',
  '# ' || name || ' Policy' || E'\n\n' ||
  '## Purpose' || E'\n' ||
  'This policy establishes ' || name || ' compliance requirements for the organization.' || E'\n\n' ||
  '## Scope' || E'\n' ||
  'This policy applies to all systems, personnel, and processes within the organization.' || E'\n\n' ||
  '## Policy Statements' || E'\n' ||
  '1. The organization shall maintain compliance with ' || name || ' ' || version || ' controls.' || E'\n' ||
  '2. All personnel shall be trained annually on relevant ' || name || ' requirements.' || E'\n' ||
  '3. Compliance status shall be reviewed quarterly.' || E'\n\n' ||
  '## Enforcement' || E'\n' ||
  'Violations of this policy shall be addressed through the organization''s disciplinary process.' || E'\n\n' ||
  '## Review' || E'\n' ||
  'This policy shall be reviewed and updated annually or following significant changes.'
from public.frameworks;

-- policies (org-owned, can be cloned from template or created fresh)
create table public.policies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  user_id uuid not null,
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  title text not null,
  content text not null,
  status text not null default 'draft' check (status in ('draft','approved')),
  version int not null default 1,
  template_id uuid references public.policy_templates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index policies_org_id_idx on public.policies(org_id);
create index policies_framework_id_idx on public.policies(framework_id);

alter table public.policies enable row level security;
create policy "org members read policies"
  on public.policies for select using (true);
create policy "users manage own policies"
  on public.policies for all using (auth.uid() = user_id);

-- policy_controls (many-to-many: policy ↔ framework control codes)
create table public.policy_controls (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  control_code text not null,
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(policy_id, control_code, framework_id)
);

create index policy_controls_policy_id_idx on public.policy_controls(policy_id);
create index policy_controls_code_fw_idx on public.policy_controls(control_code, framework_id);

alter table public.policy_controls enable row level security;
create policy "policy_controls inherit policy access"
  on public.policy_controls for all
  using (
    exists (
      select 1 from public.policies p
      where p.id = policy_id and p.user_id = auth.uid()
    )
  );
