-- Widen the workflow_status check constraint on generated_standards and
-- standards_snapshots to include 'superseded', added as part of the Policy
-- lifecycle feature (Policy reuses this same WorkflowStatus type).
alter table public.generated_standards drop constraint if exists generated_standards_workflow_status_check;
alter table public.generated_standards
  add constraint generated_standards_workflow_status_check
  check (workflow_status in ('draft','in_review','approved','published','superseded'));

alter table public.standards_snapshots drop constraint if exists standards_snapshots_workflow_status_check;
alter table public.standards_snapshots
  add constraint standards_snapshots_workflow_status_check
  check (workflow_status in ('draft','in_review','approved','published','superseded'));
