-- Internal Controls: org-owned, testable control instances.
-- Named `internal_controls` (not `controls`) because public.controls already
-- holds the seeded per-framework control catalog (FrameworkControl).
create table public.internal_controls (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  code text not null,
  title text not null,
  description text not null default '',
  domain text not null default '',
  owner text not null default '',
  operator text not null default '',
  criticality text not null default 'medium'
    check (criticality in ('critical','high','medium','low')),
  control_type text not null default 'preventive'
    check (control_type in ('preventive','detective','corrective')),
  execution text not null default 'manual'
    check (execution in ('manual','automated','hybrid')),
  frequency text not null default 'quarterly'
    check (frequency in ('continuous','daily','weekly','monthly','quarterly','annual','event_driven')),
  nature text not null default 'technical'
    check (nature in ('technical','administrative','physical')),
  key_control boolean not null default false,
  parent_control_id uuid references public.internal_controls(id) on delete set null,
  category text not null default '',
  implementation_status text not null default 'not_implemented'
    check (implementation_status in
      ('not_implemented','planned','partially_implemented','implemented','not_applicable')),
  implementation_description text not null default '',
  design_effectiveness text not null default 'not_tested'
    check (design_effectiveness in ('effective','partially_effective','ineffective','not_tested')),
  operating_effectiveness text not null default 'not_tested'
    check (operating_effectiveness in ('effective','partially_effective','ineffective','not_tested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, code)
);

create index internal_controls_org_id_idx on public.internal_controls(org_id);
create index internal_controls_parent_idx on public.internal_controls(parent_control_id);

alter table public.internal_controls enable row level security;

create policy "org members read internal_controls"
  on public.internal_controls for select using (true);

create policy "users manage own internal_controls"
  on public.internal_controls for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Many-to-many: one internal control maps to many framework requirements.
create table public.internal_control_framework_mappings (
  id uuid primary key default gen_random_uuid(),
  control_id uuid not null references public.internal_controls(id) on delete cascade,
  framework_id uuid not null references public.frameworks(id) on delete cascade,
  requirement_code text not null,
  requirement_title text,
  mapping_type text not null default 'direct'
    check (mapping_type in ('direct','partial','supporting')),
  validation text not null default 'ai_suggested'
    check (validation in ('ai_suggested','human_validated')),
  created_at timestamptz not null default now(),
  unique (control_id, framework_id, requirement_code)
);

create index icfm_control_idx on public.internal_control_framework_mappings(control_id);
create index icfm_framework_idx on public.internal_control_framework_mappings(framework_id);

alter table public.internal_control_framework_mappings enable row level security;

create policy "org members read control mappings"
  on public.internal_control_framework_mappings for select using (true);

create policy "users manage own control mappings"
  on public.internal_control_framework_mappings for all using (
    exists (
      select 1 from public.internal_controls c
      join public.org_profiles o on o.id = c.org_id
      where c.id = control_id and o.user_id = auth.uid()
    )
  );

-- Evidence: owned by a control, a framework requirement, or both.
create table public.requirement_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  control_id uuid references public.internal_controls(id) on delete cascade,
  framework_id uuid references public.frameworks(id) on delete set null,
  requirement_id text,
  title text not null,
  owner text not null default '',
  evidence_type text not null default '',
  source text not null default '',
  collection_date timestamptz not null default now(),
  period_covered text not null default '',
  expiration_date timestamptz,
  verification_status text not null default 'pending_review'
    check (verification_status in ('verified','pending_review','rejected','expired')),
  url text,
  created_at timestamptz not null default now(),
  check (control_id is not null or framework_id is not null)
);

create index requirement_evidence_org_idx on public.requirement_evidence(org_id);
create index requirement_evidence_control_idx on public.requirement_evidence(control_id);
create index requirement_evidence_framework_idx on public.requirement_evidence(framework_id);

alter table public.requirement_evidence enable row level security;

create policy "org members read evidence"
  on public.requirement_evidence for select using (true);

create policy "users manage own evidence"
  on public.requirement_evidence for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Assessments: control-centric or requirement-centric testing cycles.
create table public.requirement_assessments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  control_id uuid references public.internal_controls(id) on delete cascade,
  framework_id uuid references public.frameworks(id) on delete set null,
  requirement_id text,
  cycle_name text not null default '',
  status text not null default 'scheduled'
    check (status in ('completed','in_progress','scheduled')),
  implementation_status text not null default 'not_implemented'
    check (implementation_status in
      ('not_implemented','planned','partially_implemented','implemented','not_applicable')),
  design_effectiveness text not null default 'not_tested'
    check (design_effectiveness in ('effective','partially_effective','ineffective','not_tested')),
  operating_effectiveness text not null default 'not_tested'
    check (operating_effectiveness in ('effective','partially_effective','ineffective','not_tested')),
  assessor text not null default '',
  assessment_date timestamptz not null default now(),
  observation text not null default '',
  finding_id uuid,
  created_at timestamptz not null default now(),
  check (control_id is not null or framework_id is not null)
);

create index requirement_assessments_org_idx on public.requirement_assessments(org_id);
create index requirement_assessments_control_idx on public.requirement_assessments(control_id);

alter table public.requirement_assessments enable row level security;

create policy "org members read assessments"
  on public.requirement_assessments for select using (true);

create policy "users manage own assessments"
  on public.requirement_assessments for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Findings: created by an assessment, may bridge into Issue/Exception/Risk.
create table public.findings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  code text not null,
  control_id uuid not null references public.internal_controls(id) on delete cascade,
  assessment_id uuid not null references public.requirement_assessments(id) on delete cascade,
  title text not null,
  description text not null default '',
  severity text not null default 'medium'
    check (severity in ('critical','high','medium','low')),
  status text not null default 'open'
    check (status in ('open','remediated','accepted')),
  linked_issue_id uuid references public.issues(id) on delete set null,
  linked_exception_id uuid references public.exceptions(id) on delete set null,
  linked_risk_id uuid references public.risks(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index findings_org_idx on public.findings(org_id);
create index findings_control_idx on public.findings(control_id);

alter table public.findings enable row level security;

create policy "org members read findings"
  on public.findings for select using (true);

create policy "users manage own findings"
  on public.findings for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Activity log: reused for both framework-level and control-level history tabs.
create table public.framework_activities (
  id uuid primary key default gen_random_uuid(),
  framework_id uuid references public.frameworks(id) on delete cascade,
  control_id uuid references public.internal_controls(id) on delete cascade,
  action text not null,
  details text not null default '',
  actor text not null default '',
  timestamp timestamptz not null default now(),
  check (framework_id is not null or control_id is not null)
);

create index framework_activities_framework_idx on public.framework_activities(framework_id);
create index framework_activities_control_idx on public.framework_activities(control_id);

alter table public.framework_activities enable row level security;

create policy "org members read activities"
  on public.framework_activities for select using (true);

create policy "authenticated users insert activities"
  on public.framework_activities for insert using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
