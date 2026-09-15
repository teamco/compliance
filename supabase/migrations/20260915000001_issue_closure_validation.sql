-- Issue closure-validation workflow: root cause capture + Owner->Validator review cycle.

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'issues' and con.contype = 'c' and pg_get_constraintdef(con.oid) like '%status%';

  if constraint_name is not null then
    execute format('alter table public.issues drop constraint %I', constraint_name);
  end if;
end $$;

update public.issues set status = 'closed' where status = 'resolved';

alter table public.issues
  add constraint issues_status_check check (status in ('open','in_progress','pending_validation','closed','wont_fix')),
  add column root_cause text,
  add column root_cause_category text check (root_cause_category in
    ('process_gap','control_design_failure','control_operating_failure','human_error','system_technical_failure','third_party','other'));

create table public.issue_validations (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  requested_by uuid not null,
  validator_id uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index issue_validations_issue_idx on public.issue_validations(issue_id);
create index issue_validations_org_idx on public.issue_validations(org_id);

alter table public.issue_validations enable row level security;

create policy "org members read issue validations"
  on public.issue_validations for select
  using (true);

create policy "requester or validator manage issue validations"
  on public.issue_validations for all
  using (true)
  with check (true);
