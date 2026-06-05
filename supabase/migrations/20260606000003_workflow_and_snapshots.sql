-- Add workflow_status to generated_standards
alter table public.generated_standards
  add column if not exists workflow_status text not null default 'draft'
  check (workflow_status in ('draft','in_review','approved','published'));

-- Immutable approval snapshots
create table if not exists public.standards_snapshots (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references public.generated_standards(id) on delete cascade,
  version         integer not null,
  workflow_status text not null check (workflow_status in ('draft','in_review','approved','published')),
  controls        jsonb not null default '[]',
  created_at      timestamptz not null default now(),
  created_by      text,
  unique(document_id, version)
);

create index if not exists snapshots_document_id_idx
  on public.standards_snapshots(document_id, version desc);

-- RLS
alter table public.standards_snapshots enable row level security;

-- Authenticated users can read snapshots for their own documents
create policy "snapshots_select_own"
  on public.standards_snapshots for select
  using (
    exists (
      select 1 from public.generated_standards gs
      where gs.id = document_id and gs.user_id = auth.uid()
    )
  );

-- Append-only: no UPDATE or DELETE allowed via RLS
-- (INSERT is handled by service role key from the MS; anon/authenticated cannot insert)
