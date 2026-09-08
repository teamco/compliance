-- vendors
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.org_profiles(id) on delete cascade,
  name text not null,
  domain text not null,
  tags text[] not null default '{}',
  tier text not null default 'medium',
  rescan_interval_days int not null default 7,
  alert_threshold int not null default 10,
  last_scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- vendor_scans
create table public.vendor_scans (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  triggered_by text not null,
  score int not null,
  grade text not null,
  breakdown jsonb not null,
  findings jsonb not null default '[]',
  scorecard_data jsonb,
  scanned_at timestamptz not null default now()
);

-- vendor_ai_analyses
create table public.vendor_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.vendor_scans(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  summary text not null,
  risk_rating text not null,
  recommendations jsonb not null default '[]',
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  created_at timestamptz not null default now()
);

-- vendor_alert_events
create table public.vendor_alert_events (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  scan_id uuid not null references public.vendor_scans(id) on delete cascade,
  score_before int not null,
  score_after int not null,
  drop int not null,
  channels text[] not null default '{}',
  fired_at timestamptz not null default now()
);

create index on public.vendor_scans (vendor_id, scanned_at desc);
create index on public.vendors (org_id);
