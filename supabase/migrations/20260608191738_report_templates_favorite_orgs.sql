-- Per-org favorites: a global template can be favorited (assigned) to specific
-- orgs so it surfaces first in the export menu for those orgs.

alter table public.report_templates
  add column if not exists favorite_org_ids uuid[] not null default '{}';
