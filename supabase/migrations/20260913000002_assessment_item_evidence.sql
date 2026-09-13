-- Evidence gains assessment_item_id as a fourth possible owner (control_id,
-- framework_id, risk_id already exist from prior migrations).
alter table public.requirement_evidence
  add column assessment_item_id uuid references public.risk_assessment_items(id) on delete cascade;

alter table public.requirement_evidence drop constraint if exists requirement_evidence_check;
alter table public.requirement_evidence
  add constraint requirement_evidence_check
  check (
    control_id is not null
    or framework_id is not null
    or risk_id is not null
    or assessment_item_id is not null
  );

create index requirement_evidence_assessment_item_idx
  on public.requirement_evidence(assessment_item_id);

-- Recreate "users manage own evidence" with an added assessment_item_id
-- branch, reproducing the existing org_id/control_id/risk_id structure as-is.
drop policy if exists "users manage own evidence" on public.requirement_evidence;

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
        where r.id = requirement_evidence.risk_id and r.org_id = requirement_evidence.org_id
      )
    )
    and (
      assessment_item_id is null
      or exists (
        select 1 from public.risk_assessment_items rai
        join public.risk_assessments ra on ra.id = rai.assessment_id
        where rai.id = requirement_evidence.assessment_item_id
          and ra.org_id = requirement_evidence.org_id
      )
    )
  );
