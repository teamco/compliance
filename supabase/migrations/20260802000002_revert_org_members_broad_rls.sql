-- The read/write broadening added in 20260802000001 was unnecessary: this app's
-- SupabaseAuthStrategy always connects with the service-role key, which bypasses
-- RLS entirely, so nothing in the codebase depends on these policies. Left in
-- place, they open a cross-tenant escalation path via Supabase's auto-generated
-- PostgREST API (any authenticated user could self-insert into organization_members
-- for an arbitrary org_id, then read that org's member list). Revert to the
-- original locked-down, self-row-only policy.
drop policy if exists "org_members_read_own_org" on public.organization_members;
drop policy if exists "org_members_write_own_row" on public.organization_members;
drop function if exists public.is_org_member(uuid);

create policy "org_members_own"
  on public.organization_members for all
  using (auth.uid() = user_id);
