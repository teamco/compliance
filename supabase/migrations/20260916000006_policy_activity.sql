-- Policy gains a real per-transition activity trail, same pattern as the
-- asset_id widening in 20260916000003_asset_activity.sql.
alter table public.framework_activities
  add column policy_id uuid references public.policies(id) on delete cascade;

alter table public.framework_activities drop constraint if exists framework_activities_check;
alter table public.framework_activities
  add constraint framework_activities_check
  check (
    framework_id is not null
    or control_id is not null
    or asset_id is not null
    or policy_id is not null
  );

create index framework_activities_policy_idx on public.framework_activities(policy_id);

drop policy if exists "org members read activities" on public.framework_activities;

create policy "org members read activities"
  on public.framework_activities for select using (
    (control_id is null and asset_id is null and policy_id is null)
    or exists (
      select 1 from public.internal_controls c
      join public.org_profiles o on o.id = c.org_id
      where c.id = control_id and o.user_id = auth.uid()
    )
    or exists (
      select 1 from public.assets a
      join public.org_profiles o on o.id = a.org_id
      where a.id = asset_id and o.user_id = auth.uid()
    )
    or exists (
      select 1 from public.policies p
      join public.org_profiles o on o.id = p.org_id
      where p.id = policy_id and o.user_id = auth.uid()
    )
  );
