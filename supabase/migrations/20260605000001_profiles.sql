-- Profiles table: one row per auth.users entry.
-- Role is the source of truth for CASL checks (synced from app_metadata via setRole).

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  avatar_url   text,
  role         text not null default 'user',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read their own row; admins handled by service-role key (bypasses RLS).
create policy "profiles: own read"
  on public.profiles for select
  using (auth.uid() = id);

-- Users can update own display_name / avatar_url but not role.
create policy "profiles: own update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
  );

-- Auto-insert a profile row when a new user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
