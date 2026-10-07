-- Per-conversation shared memory for carebridge-ai-v3 agents (specialization, doctor, date,
-- patient, pending intents). State expires after 24 hours of inactivity; the edge function
-- enforces this (STATE_TTL_HOURS in state.ts) by ignoring rows with an older updated_at.

create table public.ai_conversation_state (
  conversation_id uuid primary key references public.ai_conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id),
  state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(state) = 'object' and pg_column_size(state) < 8192),
  updated_at timestamptz not null default now()
);

create index ai_conversation_state_user_id_idx on public.ai_conversation_state(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;

create trigger ai_conversation_state_set_updated_at
before update on public.ai_conversation_state
for each row execute function public.set_updated_at();

alter table public.ai_conversation_state enable row level security;

create policy "Users can view their own AI conversation state"
on public.ai_conversation_state for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.ai_conversations conversation
    where conversation.id = ai_conversation_state.conversation_id
      and conversation.user_id = (select auth.uid())
  )
);

create policy "Users can create their own AI conversation state"
on public.ai_conversation_state for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.ai_conversations conversation
    where conversation.id = ai_conversation_state.conversation_id
      and conversation.user_id = (select auth.uid())
  )
);

create policy "Users can update their own AI conversation state"
on public.ai_conversation_state for update
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.ai_conversations conversation
    where conversation.id = ai_conversation_state.conversation_id
      and conversation.user_id = (select auth.uid())
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.ai_conversations conversation
    where conversation.id = ai_conversation_state.conversation_id
      and conversation.user_id = (select auth.uid())
  )
);

create policy "Users can delete their own AI conversation state"
on public.ai_conversation_state for delete
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.ai_conversations conversation
    where conversation.id = ai_conversation_state.conversation_id
      and conversation.user_id = (select auth.uid())
  )
);

revoke all on table public.ai_conversation_state from anon;
grant select, insert, update, delete on table public.ai_conversation_state to authenticated;
