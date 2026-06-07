create table public.ai_usage_log (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  used_at       timestamptz not null default now(),
  provider      text        not null default 'anthropic',
  operation     text        not null,
  model         text        not null,
  key_source    text        not null default 'platform' check (key_source in ('platform', 'byok')),
  input_tokens  int         not null default 0,
  output_tokens int         not null default 0,
  success       boolean     not null default true,
  error_code    text,
  latency_ms    int         not null default 0
);

create index ai_usage_log_used_at_idx      on public.ai_usage_log (used_at desc);
create index ai_usage_log_user_used_idx    on public.ai_usage_log (user_id, used_at desc);
create index ai_usage_log_provider_op_idx  on public.ai_usage_log (provider, operation);

alter table public.ai_usage_log enable row level security;

-- Only service_role (gateway) reads/writes — no end-user direct access
