-- audit_logs: immutable record of significant system events
create table public.audit_logs (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  action        text        not null,
  resource_type text,
  resource_id   text,
  metadata      jsonb       not null default '{}',
  created_at    timestamptz not null default now()
);
create index audit_logs_user_created on public.audit_logs(user_id, created_at desc);
create index audit_logs_action       on public.audit_logs(action);
alter table public.audit_logs enable row level security;
create policy "audit_logs: own select"
  on public.audit_logs for select using (auth.uid() = user_id);

-- api_keys: named tokens for programmatic access
create table public.api_keys (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  name         text        not null,
  key_hash     text        not null unique,
  key_prefix   text        not null,
  expires_at   timestamptz,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
alter table public.api_keys enable row level security;
create policy "api_keys: own all"
  on public.api_keys for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- webhooks: external HTTP endpoints for event delivery
create table public.webhooks (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  url        text        not null,
  events     text[]      not null default '{}',
  secret     text        not null,
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);
alter table public.webhooks enable row level security;
create policy "webhooks: own all"
  on public.webhooks for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- retention preferences stored on profiles
alter table public.profiles
  add column if not exists retention_prefs jsonb not null default '{}';
