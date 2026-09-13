-- Risk Methodology: one active config per org, versioned (editing creates a
-- new version so historical risk scores stay interpretable against the
-- methodology version they were computed under).
create table public.risk_methodologies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  version int not null default 1,
  is_active boolean not null default true,
  scale_size int not null check (scale_size in (3, 4, 5)),
  likelihood_labels text[] not null,
  impact_labels text[] not null,
  thresholds jsonb not null, -- [{maxScore, label}]
  appetite_threshold int not null,
  created_at timestamptz not null default now(),
  unique (org_id, version)
);

create index risk_methodologies_org_idx on public.risk_methodologies(org_id);
create index risk_methodologies_active_idx on public.risk_methodologies(org_id, is_active);

alter table public.risk_methodologies enable row level security;

create policy "org members read risk methodologies"
  on public.risk_methodologies for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own risk methodologies"
  on public.risk_methodologies for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Risk Taxonomy: org-configurable category list, replaces free-text category.
create table public.risk_taxonomy_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  name text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create index risk_taxonomy_org_idx on public.risk_taxonomy_categories(org_id);

alter table public.risk_taxonomy_categories enable row level security;

create policy "org members read risk taxonomy"
  on public.risk_taxonomy_categories for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own risk taxonomy"
  on public.risk_taxonomy_categories for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Risks: alter the existing table (not recreate) to add the new fields.
-- Backfill for pre-existing rows happens in Step 2 below.
alter table public.risks
  add column risk_id text,
  add column risk_statement text,
  add column taxonomy_category_id uuid references public.risk_taxonomy_categories(id) on delete set null,
  add column owner_id uuid,
  add column business_unit text,
  add column source text not null default 'manual'
    check (source in ('manual','risk_assessment','gap_analysis','internal_audit','external_audit',
      'vendor_assessment','security_incident','vulnerability','issue','regulatory_change',
      'management_review','threat_intelligence')),
  add column source_ref text,
  add column asset_ids uuid[] not null default '{}',
  add column vendor_ids uuid[] not null default '{}',
  add column methodology_id uuid references public.risk_methodologies(id) on delete set null,
  add column inherent_likelihood int,
  add column inherent_impact int,
  add column inherent_score int,
  add column inherent_label text check (inherent_label in ('low','medium','high','critical')),
  add column residual_likelihood int,
  add column residual_impact int,
  add column residual_score int,
  add column residual_label text check (residual_label in ('low','medium','high','critical')),
  add column above_appetite boolean,
  add column treatment_strategy text check (treatment_strategy in ('avoid','mitigate','transfer','accept','monitor')),
  add column treatment_owner text,
  add column treatment_plan text,
  add column target_score int,
  add column target_date timestamptz,
  add column status text not null default 'open' check (status in ('open','monitoring','closed'));

-- Step 2: backfill existing rows so the new NOT NULL-bound columns (risk_id,
-- inherent_*, status already defaulted) have real data before we add the
-- unique constraint. Every org gets a default methodology + an
-- "Uncategorized" taxonomy category first.
insert into public.risk_methodologies (org_id, scale_size, likelihood_labels, impact_labels, thresholds, appetite_threshold)
select id, 5,
  array['Rare','Unlikely','Possible','Likely','Almost Certain'],
  array['Insignificant','Minor','Moderate','Major','Severe'],
  '[{"maxScore":4,"label":"low"},{"maxScore":9,"label":"medium"},{"maxScore":16,"label":"high"},{"maxScore":25,"label":"critical"}]'::jsonb,
  9
from public.org_profiles
where id in (select distinct org_id from public.risks)
on conflict (org_id, version) do nothing;

insert into public.risk_taxonomy_categories (org_id, name)
select distinct org_id, 'Uncategorized' from public.risks
on conflict (org_id, name) do nothing;

with likelihood_map(old_val, num) as (
  values ('very_low',1), ('low',2), ('medium',3), ('high',4), ('very_high',5)
)
update public.risks r
set
  risk_id = 'RSK-' || lpad((row_number() over (partition by r.org_id order by r.created_at))::text, 6, '0'),
  risk_statement = coalesce(r.description, ''),
  taxonomy_category_id = (select id from public.risk_taxonomy_categories tc where tc.org_id = r.org_id and tc.name = 'Uncategorized'),
  owner_id = r.user_id,
  methodology_id = (select id from public.risk_methodologies m where m.org_id = r.org_id and m.is_active),
  inherent_likelihood = (select num from likelihood_map where old_val = r.likelihood::text),
  inherent_impact = (select num from likelihood_map where old_val = r.impact::text),
  inherent_score = r.risk_score,
  inherent_label = case
    when r.risk_score <= 4 then 'low' when r.risk_score <= 9 then 'medium'
    when r.risk_score <= 16 then 'high' else 'critical' end,
  asset_ids = case when r.asset_id is not null then array[r.asset_id] else '{}' end
where r.risk_id is null;

alter table public.risks
  alter column risk_id set not null,
  alter column risk_statement set not null,
  alter column owner_id set not null,
  alter column inherent_likelihood set not null,
  alter column inherent_impact set not null,
  alter column inherent_score set not null,
  alter column inherent_label set not null,
  add constraint risks_risk_id_unique unique (org_id, risk_id);

create index risks_taxonomy_idx on public.risks(taxonomy_category_id);
create index risks_owner_idx on public.risks(owner_id);
create index risks_status_idx on public.risks(status);

-- Risk ↔ Control: direct many-to-many, independent of Findings.
create table public.risk_control_mappings (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references public.risks(id) on delete cascade,
  control_id uuid not null references public.internal_controls(id) on delete cascade,
  control_code text not null,
  control_title text not null,
  effectiveness_note text,
  created_at timestamptz not null default now(),
  unique (risk_id, control_id)
);

create index risk_control_mappings_risk_idx on public.risk_control_mappings(risk_id);
create index risk_control_mappings_control_idx on public.risk_control_mappings(control_id);

alter table public.risk_control_mappings enable row level security;

create policy "org members read risk control mappings"
  on public.risk_control_mappings for select using (
    exists (
      select 1 from public.risks r
      join public.org_profiles o on o.id = r.org_id
      where r.id = risk_id and o.user_id = auth.uid()
    )
  );

create policy "users manage own risk control mappings"
  on public.risk_control_mappings for all using (
    exists (
      select 1 from public.risks r
      join public.org_profiles o on o.id = r.org_id
      where r.id = risk_id and o.user_id = auth.uid()
    )
    and exists (
      select 1 from public.internal_controls c
      join public.risks r2 on r2.id = risk_id
      where c.id = control_id and c.org_id = r2.org_id
    )
  );

-- Risk Acceptance.
create table public.risk_acceptances (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references public.risks(id) on delete cascade,
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  requested_by uuid not null,
  justification text not null,
  compensating_controls text not null default '',
  expires_at timestamptz not null,
  approver_id uuid not null,
  status text not null default 'requested' check (status in ('requested','reviewed','approved','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index risk_acceptances_risk_idx on public.risk_acceptances(risk_id);
create index risk_acceptances_org_idx on public.risk_acceptances(org_id);

alter table public.risk_acceptances enable row level security;

create policy "org members read risk acceptances"
  on public.risk_acceptances for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own risk acceptances"
  on public.risk_acceptances for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and exists (select 1 from public.risks r where r.id = risk_id and r.org_id = risk_acceptances.org_id)
  );

-- Risk history: immutable snapshots.
create table public.risk_snapshots (
  id uuid primary key default gen_random_uuid(),
  risk_id uuid not null references public.risks(id) on delete cascade,
  inherent_score int not null,
  inherent_label text not null check (inherent_label in ('low','medium','high','critical')),
  residual_score int,
  residual_label text check (residual_label in ('low','medium','high','critical')),
  treatment_strategy text check (treatment_strategy in ('avoid','mitigate','transfer','accept','monitor')),
  changed_by uuid not null,
  reason text,
  created_at timestamptz not null default now()
);

create index risk_snapshots_risk_idx on public.risk_snapshots(risk_id);

alter table public.risk_snapshots enable row level security;

create policy "org members read risk snapshots"
  on public.risk_snapshots for select using (
    exists (
      select 1 from public.risks r
      join public.org_profiles o on o.id = r.org_id
      where r.id = risk_id and o.user_id = auth.uid()
    )
  );

create policy "users insert own risk snapshots"
  on public.risk_snapshots for insert with check (
    exists (
      select 1 from public.risks r
      join public.org_profiles o on o.id = r.org_id
      where r.id = risk_id and o.user_id = auth.uid()
    )
  );

-- Evidence gains riskId as a third possible owner (control_id/framework_id
-- already exist from the Controls migration).
alter table public.requirement_evidence
  add column risk_id uuid references public.risks(id) on delete cascade;

alter table public.requirement_evidence drop constraint if exists requirement_evidence_check;
alter table public.requirement_evidence
  add constraint requirement_evidence_check
  check (control_id is not null or framework_id is not null or risk_id is not null);

create index requirement_evidence_risk_idx on public.requirement_evidence(risk_id);

-- RLS fix: the pre-existing "users manage own evidence" write check validated
-- control_id's org but had no branch for the new risk_id column, letting a
-- user attach evidence to another org's risk. Recreate with a risk_id branch.
drop policy "users manage own evidence" on public.requirement_evidence;

create policy "users manage own evidence"
  on public.requirement_evidence for all
  using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  )
  with check (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and (
      control_id is null
      or exists (
        select 1 from public.internal_controls c
        where c.id = control_id and c.org_id = requirement_evidence.org_id
      )
    )
    and (
      risk_id is null
      or exists (
        select 1 from public.risks r
        where r.id = risk_id and r.org_id = requirement_evidence.org_id
      )
    )
  );

-- RLS fix: the pre-existing "users manage own risks" policy only checked
-- auth.uid() = user_id, with no ownership check on the new taxonomy_category_id
-- / methodology_id FKs, letting a user point a risk at another org's taxonomy
-- category or methodology. Recreate with a with-check clause covering both.
drop policy "users manage own risks" on public.risks;

create policy "users manage own risks"
  on public.risks for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      taxonomy_category_id is null
      or exists (
        select 1 from public.risk_taxonomy_categories tc
        where tc.id = taxonomy_category_id and tc.org_id = risks.org_id
      )
    )
    and (
      methodology_id is null
      or exists (
        select 1 from public.risk_methodologies m
        where m.id = methodology_id and m.org_id = risks.org_id
      )
    )
  );

-- RLS fix: the pre-existing "org members read risks" / "org members read assets"
-- SELECT policies used `using (true)`, letting any authenticated user read every
-- org's risks and assets. Scope both to the requesting user's own org via
-- org_profiles, matching the org-scoping pattern used throughout this migration.
drop policy "org members read risks" on public.risks;

create policy "org members read risks"
  on public.risks for select
  using (
    exists (select 1 from public.org_profiles o where o.id = risks.org_id and o.user_id = auth.uid())
  );

drop policy "org members read assets" on public.assets;

create policy "org members read assets"
  on public.assets for select
  using (
    exists (select 1 from public.org_profiles o where o.id = assets.org_id and o.user_id = auth.uid())
  );

-- Risk Acceptance: track who actually approved the request (Finding 6).
alter table public.risk_acceptances add column approved_by uuid;
