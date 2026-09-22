create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index ai_conversations_user_id_idx on public.ai_conversations(user_id);
create index ai_messages_conversation_id_idx on public.ai_messages(conversation_id);
create index ai_messages_user_id_idx on public.ai_messages(user_id);

alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

create policy "Users can view their own AI conversations"
on public.ai_conversations for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create their own AI conversations"
on public.ai_conversations for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update their own AI conversations"
on public.ai_conversations for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Users can view their own AI messages"
on public.ai_messages for select
to authenticated
using (
  user_id = auth.uid()
  and exists (
    select 1
    from public.ai_conversations as conversation
    where conversation.id = ai_messages.conversation_id
      and conversation.user_id = auth.uid()
  )
);

create policy "Users can create their own AI messages"
on public.ai_messages for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.ai_conversations as conversation
    where conversation.id = ai_messages.conversation_id
      and conversation.user_id = auth.uid()
  )
);
