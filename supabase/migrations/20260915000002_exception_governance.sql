-- Exception governance: risk-linkage, renewal workflow, and approve/reject actor-tracking.

alter table public.exceptions
  add column risk_id uuid references public.risks(id) on delete set null,
  add column review_frequency_days integer,
  add column reviewed_by uuid,
  add column reviewed_at timestamptz;

create table public.exception_renewals (
  id uuid primary key default gen_random_uuid(),
  exception_id uuid not null references public.exceptions(id) on delete cascade,
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  requested_by uuid not null,
  proposed_expires_at timestamptz not null,
  justification text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid,
  review_notes text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index exception_renewals_exception_idx on public.exception_renewals(exception_id);
create index exception_renewals_org_idx on public.exception_renewals(org_id);

alter table public.exception_renewals enable row level security;

create policy "org members read exception renewals"
  on public.exception_renewals for select
  using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
  );

-- reviewed_by is NULL until review completes, so this USING clause matches only requested_by
-- pre-review. Inert today (the notes MS uses the service-role key and bypasses RLS), but a
-- user-scoped Supabase client against this table would need the policy widened.
create policy "requester or reviewer manage exception renewals"
  on public.exception_renewals for all
  using (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and (requested_by = auth.uid() or reviewed_by = auth.uid())
  )
  with check (
    exists (select 1 from public.org_profiles o where o.id = org_id and o.user_id = auth.uid())
    and (requested_by = auth.uid() or reviewed_by = auth.uid())
  );
