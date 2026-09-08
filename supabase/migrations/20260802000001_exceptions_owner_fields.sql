-- Exceptions: add gap-statement, owner, and compensating-controls fields.
alter table public.exceptions
  add column statement text not null default '',
  add column owner_id uuid references auth.users(id),
  add column compensating_controls text;

alter table public.exceptions alter column statement drop default;

-- organization_members was scaffolded self-row-only ("v2, no API/UI in v1").
-- The Exception "Owner" picker needs to list all members of the current org.
drop policy if exists "org_members_own" on public.organization_members;

-- SECURITY DEFINER function to avoid infinite RLS recursion when checking org membership.
-- RLS policies cannot use self-referencing subqueries on the same relation (causes
-- "infinite recursion detected in policy" error). This function bypasses RLS internally
-- and returns a boolean, breaking the recursion cycle.
create or replace function public.is_org_member(check_org_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from public.organization_members
    where org_id = check_org_id and user_id = auth.uid()
  );
end;
$$;

create policy "org_members_read_own_org"
  on public.organization_members for select
  using (public.is_org_member(org_id));

create policy "org_members_write_own_row"
  on public.organization_members for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
