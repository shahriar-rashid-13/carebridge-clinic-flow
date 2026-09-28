-- AI V2: server-side turn persistence, metadata, rate-limit index, delete policy.

alter table public.ai_messages
  add column if not exists metadata jsonb;

create index if not exists ai_messages_user_id_created_at_idx
  on public.ai_messages (user_id, created_at);

drop policy if exists "Users can delete their own AI conversations" on public.ai_conversations;
create policy "Users can delete their own AI conversations"
on public.ai_conversations for delete
to authenticated
using (user_id = auth.uid());

-- Saves one user/assistant turn atomically under the caller's RLS.
-- Creates the conversation when p_conversation_id is null.
create or replace function public.ai_append_turn(
  p_conversation_id uuid,
  p_user_text text,
  p_assistant_text text,
  p_metadata jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_conversation_id uuid := p_conversation_id;
  v_title text;
  v_user_message_id uuid;
  v_assistant_message_id uuid;
  v_user_created_at timestamptz := clock_timestamp();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if coalesce(length(trim(p_user_text)), 0) = 0
     or coalesce(length(trim(p_assistant_text)), 0) = 0 then
    raise exception 'Message text is required' using errcode = '22023';
  end if;

  v_title := left(regexp_replace(trim(p_user_text), '\s+', ' ', 'g'), 60);

  if v_conversation_id is null then
    insert into public.ai_conversations (user_id, title)
    values (v_uid, v_title)
    returning id into v_conversation_id;
  else
    perform 1
    from public.ai_conversations as c
    where c.id = v_conversation_id
      and c.user_id = v_uid
    for update;

    if not found then
      raise exception 'Conversation not found' using errcode = 'P0002';
    end if;

    update public.ai_conversations as c
    set updated_at = now(),
        title = case
          when (c.title is null or c.title = 'New conversation')
               and not exists (
                 select 1 from public.ai_messages as m where m.conversation_id = c.id
               )
            then v_title
          else c.title
        end
    where c.id = v_conversation_id;
  end if;

  insert into public.ai_messages (conversation_id, user_id, role, content, created_at)
  values (v_conversation_id, v_uid, 'user', trim(p_user_text), v_user_created_at)
  returning id into v_user_message_id;

  -- Offset keeps ordering by created_at stable within the same transaction.
  insert into public.ai_messages (conversation_id, user_id, role, content, metadata, created_at)
  values (
    v_conversation_id,
    v_uid,
    'assistant',
    trim(p_assistant_text),
    p_metadata,
    v_user_created_at + interval '1 millisecond'
  )
  returning id into v_assistant_message_id;

  return jsonb_build_object(
    'conversation_id', v_conversation_id,
    'user_message_id', v_user_message_id,
    'assistant_message_id', v_assistant_message_id
  );
end;
$$;

revoke all on function public.ai_append_turn(uuid, text, text, jsonb) from public, anon;
grant execute on function public.ai_append_turn(uuid, text, text, jsonb) to authenticated;
