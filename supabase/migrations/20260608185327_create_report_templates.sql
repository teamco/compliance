-- Report templates for PDF/CSV/JSON exports (gap analysis & standards).
-- Global, admin-managed; readable by any authenticated user.

create table if not exists public.report_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  scope text not null default 'all' check (scope in ('gap','standards','all')),
  brand_name text not null default '',
  accent_color text not null default '#16a34a',
  include_summary boolean not null default true,
  include_details boolean not null default true,
  include_recommendations boolean not null default true,
  footer_note text not null default 'Confidential',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now()
);

alter table public.report_templates enable row level security;

-- Any authenticated user may read templates (shared, admin-managed).
create policy report_templates_read on public.report_templates
  for select to authenticated using (true);

-- Writes go through the notes MS service-role connection (bypasses RLS);
-- the gateway gates write access to admins via CASL.

insert into public.report_templates (name, scope, include_details, include_recommendations, footer_note)
values
  ('Default', 'all', true, true, 'Confidential'),
  ('Executive Summary', 'all', false, true, 'Confidential — Executive Summary');
