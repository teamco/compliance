-- Assessment Types: org-configurable, replaces the hardcoded cvra/ctra enum.
create table public.assessment_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  name text not null,
  item_noun_singular text not null,
  item_noun_plural text not null,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create index assessment_types_org_idx on public.assessment_types(org_id);

alter table public.assessment_types enable row level security;

create policy "org members read assessment types"
  on public.assessment_types for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

create policy "users manage own assessment types"
  on public.assessment_types for all using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Seed two default types per org that already has assessments, matching the
-- existing hardcoded cvra/ctra values so the backfill below can map to them.
insert into public.assessment_types (org_id, name, item_noun_singular, item_noun_plural)
select distinct org_id, 'Cyber Vulnerability Risk Assessment', 'Vulnerability', 'Vulnerabilities'
from public.risk_assessments
on conflict (org_id, name) do nothing;

insert into public.assessment_types (org_id, name, item_noun_singular, item_noun_plural)
select distinct org_id, 'Cyber Threat Risk Assessment', 'Threat Scenario', 'Threat Scenarios'
from public.risk_assessments
on conflict (org_id, name) do nothing;

-- Alter risk_assessments: add the new columns, backfill, fix the pre-existing
-- using(true) SELECT policy while we're already touching this table's RLS.
alter table public.risk_assessments
  alter column type drop not null,
  drop constraint if exists risk_assessments_type_check,
  add column assessment_code text,
  add column assessment_type_id uuid references public.assessment_types(id) on delete set null,
  add column owner_id uuid,
  add column business_unit text,
  add column asset_ids uuid[] not null default '{}',
  add column vendor_ids uuid[] not null default '{}',
  add column due_date timestamptz,
  add column approver_id uuid,
  add column methodology_id uuid references public.risk_methodologies(id) on delete set null,
  add column highest_inherent_score int,
  add column highest_inherent_label text check (highest_inherent_label in ('low','medium','high','critical')),
  add column highest_residual_score int,
  add column highest_residual_label text check (highest_residual_label in ('low','medium','high','critical')),
  add column last_review_note text;

-- Drop the old status check before backfill remaps 'in_review' -> 'pending_review'
-- (the new constraint below doesn't allow 'in_review', so it must be added only
-- after the backfill has already rewritten every row to a value it permits).
alter table public.risk_assessments drop constraint if exists risk_assessments_status_check;

with numbered as (
  select id, row_number() over (partition by org_id order by created_at) as rn
  from public.risk_assessments
  where assessment_code is null
)
update public.risk_assessments r
set
  assessment_code = 'ASM-' || lpad(numbered.rn::text, 6, '0'),
  assessment_type_id = (
    select at.id from public.assessment_types at
    where at.org_id = r.org_id
      and at.name = case when r.type = 'ctra' then 'Cyber Threat Risk Assessment' else 'Cyber Vulnerability Risk Assessment' end
  ),
  owner_id = r.user_id,
  methodology_id = (select id from public.risk_methodologies m where m.org_id = r.org_id and m.is_active),
  status = case r.status when 'in_review' then 'pending_review' else r.status end,
  highest_inherent_score = r.risk_score
from numbered
where numbered.id = r.id;

alter table public.risk_assessments
  add constraint risk_assessments_status_check
  check (status in ('draft','in_progress','pending_review','changes_requested','approved','completed','archived'));

alter table public.risk_assessments
  alter column assessment_code set not null,
  alter column owner_id set not null,
  add constraint risk_assessments_code_unique unique (org_id, assessment_code);

create index risk_assessments_type_idx on public.risk_assessments(assessment_type_id);
create index risk_assessments_owner_idx on public.risk_assessments(owner_id);
create index risk_assessments_status_idx on public.risk_assessments(status);

drop policy if exists "org members read assessments" on public.risk_assessments;
create policy "org members read assessments"
  on public.risk_assessments for select using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- Alter risk_assessment_items: add inherent/residual scoring columns.
alter table public.risk_assessment_items
  add column inherent_likelihood int,
  add column inherent_impact int,
  add column inherent_score int,
  add column inherent_label text check (inherent_label in ('low','medium','high','critical')),
  add column residual_likelihood int,
  add column residual_impact int,
  add column residual_score int,
  add column residual_label text check (residual_label in ('low','medium','high','critical'));

with likelihood_map(old_val, num) as (
  values ('very_low',1), ('low',2), ('medium',3), ('high',4), ('very_high',5)
)
update public.risk_assessment_items i
set
  inherent_likelihood = (select num from likelihood_map where old_val = i.likelihood::text),
  inherent_impact = (select num from likelihood_map where old_val = i.impact::text),
  inherent_score = i.item_score,
  inherent_label = case
    when i.item_score <= 4 then 'low' when i.item_score <= 9 then 'medium'
    when i.item_score <= 16 then 'high' else 'critical' end
where i.inherent_likelihood is null;

alter table public.risk_assessment_items
  alter column inherent_likelihood set not null,
  alter column inherent_impact set not null,
  alter column inherent_score set not null,
  alter column inherent_label set not null;

-- Item <-> Control mapping (reuses the risk_control_mappings pattern).
create table public.assessment_item_control_mappings (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.risk_assessment_items(id) on delete cascade,
  control_id uuid not null references public.internal_controls(id) on delete cascade,
  control_code text not null,
  control_title text not null,
  effectiveness_note text,
  created_at timestamptz not null default now(),
  unique (item_id, control_id)
);

create index assessment_item_control_mappings_item_idx on public.assessment_item_control_mappings(item_id);
create index assessment_item_control_mappings_control_idx on public.assessment_item_control_mappings(control_id);

alter table public.assessment_item_control_mappings enable row level security;

create policy "org members read assessment item control mappings"
  on public.assessment_item_control_mappings for select using (
    exists (
      select 1 from public.risk_assessment_items i
      join public.risk_assessments ra on ra.id = i.assessment_id
      join public.org_profiles o on o.id = ra.org_id
      where i.id = item_id and o.user_id = auth.uid()
    )
  );

create policy "users manage own assessment item control mappings"
  on public.assessment_item_control_mappings for all using (
    exists (
      select 1 from public.risk_assessment_items i
      join public.risk_assessments ra on ra.id = i.assessment_id
      join public.org_profiles o on o.id = ra.org_id
      where i.id = item_id and o.user_id = auth.uid()
    )
    and exists (
      select 1 from public.internal_controls c
      join public.risk_assessment_items i2 on i2.id = item_id
      join public.risk_assessments ra2 on ra2.id = i2.assessment_id
      where c.id = control_id and c.org_id = ra2.org_id
    )
  );
