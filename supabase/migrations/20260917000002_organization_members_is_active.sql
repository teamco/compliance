alter table public.organization_members
  add column is_active boolean not null default true;
