-- Assessment item can link to a Risk in the Risk Register (e.g. an assessment
-- finding that gets promoted into a tracked risk). Deleting the Risk must not
-- delete the assessment item that referenced it, hence `on delete set null`.
alter table public.risk_assessment_items
  add column linked_risk_id uuid references public.risks(id) on delete set null;

create index risk_assessment_items_linked_risk_idx
  on public.risk_assessment_items(linked_risk_id);

-- Recreate "org members manage assessment items" with an added linked_risk_id
-- branch. risk_assessment_items has no org_id of its own (org scoping is via
-- assessment_id -> risk_assessments.org_id, per the existing exists() below),
-- so the new branch must join through risk_assessments rather than assuming
-- a risk_assessment_items.org_id column exists.
drop policy if exists "org members manage assessment items" on public.risk_assessment_items;

create policy "org members manage assessment items"
  on public.risk_assessment_items for all using (
    exists (
      select 1 from public.risk_assessments ra
      join public.org_profiles o on o.id = ra.org_id
      where ra.id = risk_assessment_items.assessment_id and o.user_id = auth.uid()
    )
    and (
      risk_assessment_items.linked_risk_id is null
      or exists (
        select 1 from public.risks r
        join public.risk_assessments ra2 on ra2.id = risk_assessment_items.assessment_id
        where r.id = risk_assessment_items.linked_risk_id
          and r.org_id = ra2.org_id
      )
    )
  );
