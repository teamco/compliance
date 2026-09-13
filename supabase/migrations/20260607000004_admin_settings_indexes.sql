-- Add indexes for query performance on api_keys and webhooks user_id lookups
create index if not exists api_keys_user_id_idx on public.api_keys(user_id);
create index if not exists webhooks_user_id_idx on public.webhooks(user_id);
