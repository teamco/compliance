-- Policy gains the same 5-state WorkflowStatus lifecycle Standards already
-- has, instead of its previous ad-hoc 2-value status column.
alter table public.policies rename column status to workflow_status;
alter table public.policies drop constraint if exists policies_status_check;
alter table public.policies
  add constraint policies_workflow_status_check
  check (workflow_status in ('draft','in_review','approved','published','superseded'));
-- Existing 'draft'/'approved' rows remain valid under the widened constraint; no backfill needed.
