-- The "org_members_own" policy from 20260802000002 is `for all using (auth.uid() = user_id)`
-- with no explicit `with check`, so Postgres reuses `using` as the update/delete check too --
-- a user could theoretically PATCH/DELETE their own membership row directly via Supabase's
-- PostgREST API, bypassing the soft-deactivate guarantee this feature relies on. This app's
-- own writes always go through the service-role key (which bypasses RLS entirely) and never
-- ships an anon/publishable key to the browser, so this isn't reachable through the shipped
-- app today -- narrowing the policy costs nothing and removes the theoretical escape hatch.
drop policy if exists "org_members_own" on public.organization_members;
create policy "org_members_own"
  on public.organization_members for select
  using (auth.uid() = user_id);
