-- Google Calendar sync. Confirming an appointment queues an 'upsert' job,
-- changing its doctor, date or time queues another, and cancelling it queues a
-- 'delete'. The calendar-sync Edge Function works the queue every minute.
-- Event ids are derived from the appointment id, so retries never duplicate
-- an event and no event id has to be stored on the appointment.
begin;

create table if not exists public.calendar_jobs (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  action text not null check (action in ('upsert', 'delete')),
  status text not null default 'queued' check (status in ('queued', 'sending', 'done', 'failed', 'skipped')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one waiting job per appointment; a newer change replaces its action.
create unique index if not exists calendar_jobs_one_queued
  on public.calendar_jobs (appointment_id) where status = 'queued';
create index if not exists calendar_jobs_due
  on public.calendar_jobs (next_attempt_at) where status in ('queued', 'sending');

alter table public.calendar_jobs enable row level security;
drop policy if exists "Receptionists read calendar jobs" on public.calendar_jobs;
create policy "Receptionists read calendar jobs" on public.calendar_jobs
  for select to authenticated using ((select public.get_user_role()) = 'receptionist');
revoke all on public.calendar_jobs from anon, authenticated;
grant select on public.calendar_jobs to authenticated;

create or replace function public.enqueue_calendar_job(p_appointment_id uuid, p_action text)
returns void
language sql security definer set search_path = public as $$
  insert into public.calendar_jobs (appointment_id, action)
  values (p_appointment_id, p_action)
  on conflict (appointment_id) where status = 'queued'
  do update set action = excluded.action, next_attempt_at = now(), attempts = 0,
                last_error = null, updated_at = now()
$$;

create or replace function public.on_appointment_calendar_change()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'confirmed' and (
       tg_op = 'INSERT'
       or old.status is distinct from 'confirmed'
       or (new.doctor_id, new.appointment_date, new.time_slot)
          is distinct from (old.doctor_id, old.appointment_date, old.time_slot)
     ) then
    perform public.enqueue_calendar_job(new.id, 'upsert');
  elsif tg_op = 'UPDATE' and new.status = 'cancelled' and old.status in ('confirmed', 'completed') then
    perform public.enqueue_calendar_job(new.id, 'delete');
  end if;
  return new;
end $$;

drop trigger if exists appointment_calendar_sync on public.appointments;
create trigger appointment_calendar_sync
  after insert or update on public.appointments
  for each row execute function public.on_appointment_calendar_change();

create or replace function public.claim_calendar_jobs(p_limit int default 20)
returns setof public.calendar_jobs
language plpgsql security definer set search_path = public as $$
begin
  return query
  update public.calendar_jobs j
  set status = 'sending', attempts = j.attempts + 1, updated_at = now()
  where j.id in (
    select id from public.calendar_jobs
    where (status = 'queued' and next_attempt_at <= now())
       or (status = 'sending' and updated_at < now() - interval '10 minutes')
    order by next_attempt_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning j.*;
end $$;

revoke execute on function public.enqueue_calendar_job(uuid, text) from public, anon, authenticated;
revoke execute on function public.on_appointment_calendar_change() from public, anon, authenticated;
revoke execute on function public.claim_calendar_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_calendar_jobs(int) to service_role;

select cron.schedule(
  'calendar-sync',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/calendar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatcher-token', (select decrypted_secret from vault.decrypted_secrets where name = 'dispatcher_token')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
  where exists (
    select 1 from public.calendar_jobs
    where (status = 'queued' and next_attempt_at <= now())
       or (status = 'sending' and updated_at < now() - interval '10 minutes')
  )
  $$
);

commit;
