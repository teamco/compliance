alter table public.profiles
  add column if not exists last_signed_in timestamptz;
