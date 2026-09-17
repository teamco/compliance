create table public.organization_invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.org_profiles(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('admin', 'viewer')),
  token       text not null unique,
  invited_by  uuid not null references auth.users(id),
  status      text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index organization_invites_pending_unique
  on public.organization_invites (org_id, lower(email))
  where status = 'pending';

create index organization_invites_token_idx on public.organization_invites (token);
