-- Email reminders through Resend (Assessment 3, track 1).
--
-- 1. A new 24h reminder notification queues an email in message_outbox.
-- 2. pg_cron calls the message-dispatcher Edge Function every minute while
--    queued rows are due. The dispatcher claims rows, sends them via Resend,
--    and records the provider id or the error.
-- 3. The resend-webhook Edge Function stores each signed event once in
--    message_events and moves the outbox row to delivered, bounced, etc.
--
-- The cron call reads two Vault secrets, created outside this file so no
-- secret is stored in git: 'project_url' and 'dispatcher_token'.

create extension if not exists pg_net with schema extensions;

begin;

-- ---------------------------------------------------------------- tables

alter table public.profiles
  add column if not exists email_opt_out boolean not null default false;

create table if not exists public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'email' check (channel in ('email')),
  template text not null check (template in ('reminder_24h')),
  recipient_id uuid references public.profiles(id) on delete set null,
  recipient text,
  delivered_to text,
  appointment_id uuid references public.appointments(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in (
    'queued', 'sending', 'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'skipped'
  )),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  idempotency_key text not null unique,
  provider_id text unique,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists message_outbox_due
  on public.message_outbox (next_attempt_at) where status = 'queued';
create index if not exists message_outbox_recipient
  on public.message_outbox (recipient_id);
create index if not exists message_outbox_appointment
  on public.message_outbox (appointment_id);

create table if not exists public.message_events (
  id uuid primary key default gen_random_uuid(),
  svix_id text not null unique,
  outbox_id uuid references public.message_outbox(id) on delete set null,
  provider_id text,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now()
);
create index if not exists message_events_outbox on public.message_events (outbox_id);

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('reminder_24h', 'no_show', 'waitlist_offer', 'offer_expired', 'message_failed'));

-- ---------------------------------------------------------------- RLS

alter table public.message_outbox enable row level security;
alter table public.message_events enable row level security;

drop policy if exists "Receptionists read outbox" on public.message_outbox;
create policy "Receptionists read outbox" on public.message_outbox
  for select to authenticated using ((select public.get_user_role()) = 'receptionist');

-- message_events has no policy: only the service role (Edge Functions) uses it.
revoke all on public.message_outbox, public.message_events from anon, authenticated;
grant select on public.message_outbox to authenticated;

-- ---------------------------------------------------------------- enqueue

create or replace function public.enqueue_reminder_email()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles%rowtype;
  v_status text := 'queued';
  v_error text;
begin
  select * into v_profile from public.profiles where id = new.recipient_id;
  if v_profile.email is null or trim(v_profile.email) = '' then
    v_status := 'skipped';
    v_error := 'no email address';
  elsif v_profile.email_opt_out then
    v_status := 'skipped';
    v_error := 'patient opted out of email';
  end if;

  insert into public.message_outbox (template, recipient_id, recipient, appointment_id, payload, status, last_error, idempotency_key)
  values (
    'reminder_24h', new.recipient_id, v_profile.email, new.appointment_id,
    jsonb_build_object('title', new.title, 'body', new.body, 'name', v_profile.full_name),
    v_status, v_error,
    'reminder_24h:' || coalesce(new.appointment_id::text, new.id::text)
  )
  on conflict (idempotency_key) do nothing;
  return null;
end $$;

drop trigger if exists notification_reminder_email on public.notifications;
create trigger notification_reminder_email
  after insert on public.notifications
  for each row when (new.kind = 'reminder_24h')
  execute function public.enqueue_reminder_email();

-- ---------------------------------------------------------------- dispatcher helpers

-- Claims up to p_limit due rows for sending. Returns nothing during quiet
-- hours (22:00 to 08:00 Asia/Dhaka). Rows stuck in 'sending' for over
-- 10 minutes (a crashed run) are claimed again.
create or replace function public.claim_outbox_batch(p_limit int default 20)
returns setof public.message_outbox
language plpgsql security definer set search_path = public as $$
declare
  v_hour int := extract(hour from now() at time zone 'Asia/Dhaka');
begin
  if v_hour >= 22 or v_hour < 8 then
    return;
  end if;
  return query
  update public.message_outbox o
  set status = 'sending', attempts = o.attempts + 1, updated_at = now()
  where o.id in (
    select id from public.message_outbox
    where (status = 'queued' and next_attempt_at <= now())
       or (status = 'sending' and updated_at < now() - interval '10 minutes')
    order by next_attempt_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning o.*;
end $$;

-- True when p_token matches the Vault secret 'dispatcher_token'.
create or replace function public.dispatcher_token_ok(p_token text)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'dispatcher_token' and decrypted_secret = p_token
  )
$$;

revoke execute on function public.enqueue_reminder_email() from public, anon, authenticated;
revoke execute on function public.claim_outbox_batch(int) from public, anon, authenticated;
revoke execute on function public.dispatcher_token_ok(text) from public, anon, authenticated;
grant execute on function public.claim_outbox_batch(int) to service_role;
grant execute on function public.dispatcher_token_ok(text) to service_role;

commit;

-- ---------------------------------------------------------------- schedule

select cron.schedule(
  'message-dispatcher',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/message-dispatcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatcher-token', (select decrypted_secret from vault.decrypted_secrets where name = 'dispatcher_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  )
  where extract(hour from now() at time zone 'Asia/Dhaka') between 8 and 21
    and exists (
    select 1 from public.message_outbox
    where (status = 'queued' and next_attempt_at <= now())
       or (status = 'sending' and updated_at < now() - interval '10 minutes')
  )
  $$
);
