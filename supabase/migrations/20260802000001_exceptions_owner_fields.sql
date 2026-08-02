-- Exceptions: add gap-statement, owner, and compensating-controls fields.
alter table public.exceptions
  add column statement text not null default '',
  add column owner_id uuid references auth.users(id),
  add column compensating_controls text;

alter table public.exceptions alter column statement drop default;

-- organization_members was scaffolded self-row-only ("v2, no API/UI in v1").
-- The Exception "Owner" picker needs to list all members of the current org.
drop policy if exists "org_members_own" on public.organization_members;

create policy "org_members_read_own_org"
  on public.organization_members for select
  using (
    exists (
      select 1 from public.organization_members self
      where self.org_id = organization_members.org_id
        and self.user_id = auth.uid()
    )
  );

create policy "org_members_write_own_row"
  on public.organization_members for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
