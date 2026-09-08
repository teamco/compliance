-- Vendors: add contract owner field.
alter table public.vendors
  add column contract_owner_id uuid references auth.users(id);
