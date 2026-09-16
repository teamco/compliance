-- Evidence review already enforces a reason on reject (evidence_review_notes_required)
-- but had nowhere to store it, unlike every sibling review workflow
-- (exception_renewals, issue_validations, risk_acceptances all have review_notes).
alter table public.requirement_evidence
  add column review_notes text;
