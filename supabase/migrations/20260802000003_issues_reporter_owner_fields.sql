-- Issues: add reporter, owner, and affected-assets fields.
alter table public.issues
  add column reporter_id uuid references auth.users(id),
  add column owner_id uuid references auth.users(id),
  add column affected_assets text;
