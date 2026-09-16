-- Asset Profile's Activity tab has been showing 2 hardcoded lines, not real
-- data. framework_activities is already reused for both framework- and
-- control-level history; widen it a third time for assets rather than
-- duplicating the table.
alter table public.framework_activities
  add column asset_id uuid references public.assets(id) on delete cascade;

alter table public.framework_activities drop constraint framework_activities_check;
alter table public.framework_activities
  add constraint framework_activities_check
  check (framework_id is not null or control_id is not null or asset_id is not null);

create index framework_activities_asset_idx on public.framework_activities(asset_id);

drop policy if exists "org members read activities" on public.framework_activities;

create policy "org members read activities"
  on public.framework_activities for select using (
    (control_id is null and asset_id is null)
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
  );
