-- Add indexes for query performance on api_keys and webhooks user_id lookups
create index api_keys_user_id_idx on public.api_keys(user_id);
create index webhooks_user_id_idx on public.webhooks(user_id);
