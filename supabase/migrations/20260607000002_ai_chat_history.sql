create table public.ai_chat_messages (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null,
  created_at  timestamptz not null default now()
);

create index ai_chat_messages_user_created
  on public.ai_chat_messages(user_id, created_at desc);

alter table public.ai_chat_messages enable row level security;

create policy "users can manage own chat messages"
  on public.ai_chat_messages
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
