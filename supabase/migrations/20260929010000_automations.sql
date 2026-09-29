-- Clinic automations (Assessment 2, track 2).
--
-- 1. Scheduled: 24h appointment reminders and no-show follow-ups.
--    pg_cron runs public.run_clinic_automations() every 15 minutes.
-- 2. Event-driven: when an active appointment is cancelled or moved, the freed
--    slot is offered to the next waitlisted patient. Offers expire and pass on.
--
-- Requires pg_cron (Dashboard > Database > Extensions) and the slot format
-- "09:00 AM" from 20260929000000_normalize_days_and_slots.sql.

create extension if not exists pg_cron with schema pg_catalog;

begin;

-- ---------------------------------------------------------------- helpers

create or replace function public.clinic_today()
returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Dhaka')::date
$$;

create or replace function public.appointment_starts_at(p_date date, p_slot text)
returns timestamptz
language sql stable set search_path = '' as $$
  select (p_date + make_time((m[1]::int % 12) + case when m[3] = 'PM' then 12 else 0 end, m[2]::int, 0))
         at time zone 'Asia/Dhaka'
  from (select regexp_match(upper(trim(p_slot)), '^(\d{1,2}):(\d{2})\s*(AM|PM)$') as m) as parts
  where m is not null
$$;

-- Minutes a patient has to accept a waitlist offer. Replace to change it.
create or replace function public.waitlist_offer_minutes()
returns int
language sql immutable set search_path = '' as $$ select 120 $$;

-- ---------------------------------------------------------------- tables

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('reminder_24h', 'no_show', 'waitlist_offer', 'offer_expired')),
  title text not null,
  body text not null default '',
  appointment_id uuid references public.appointments(id) on delete cascade,
  offer_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists notifications_once
  on public.notifications (kind, recipient_id, coalesce(appointment_id, offer_id));
create index if not exists notifications_recipient_created
  on public.notifications (recipient_id, created_at desc);

create table if not exists public.appointment_followups (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete cascade,
  reason text not null default 'no_show' check (reason in ('no_show')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  note text not null default '',
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  preferred_date date not null,
  preferred_slot text,
  reason text not null default '',
  status text not null default 'waiting' check (status in ('waiting', 'offered', 'booked', 'expired', 'cancelled')),
  created_at timestamptz not null default now()
);
create unique index if not exists waitlist_one_open
  on public.waitlist (patient_id, doctor_id, preferred_date) where status in ('waiting', 'offered');
create index if not exists waitlist_lookup
  on public.waitlist (doctor_id, preferred_date, status, created_at);

create table if not exists public.waitlist_offers (
  id uuid primary key default gen_random_uuid(),
  waitlist_id uuid not null references public.waitlist(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  offer_date date not null,
  time_slot text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  appointment_id uuid references public.appointments(id) on delete set null,
  expires_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists waitlist_offers_one_pending_slot
  on public.waitlist_offers (doctor_id, offer_date, time_slot) where status = 'pending';

-- ---------------------------------------------------------------- RLS

alter table public.notifications enable row level security;
alter table public.appointment_followups enable row level security;
alter table public.waitlist enable row level security;
alter table public.waitlist_offers enable row level security;

drop policy if exists "Users read own notifications" on public.notifications;
create policy "Users read own notifications" on public.notifications
  for select to authenticated using (recipient_id = auth.uid());

drop policy if exists "Users mark own notifications read" on public.notifications;
create policy "Users mark own notifications read" on public.notifications
  for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

drop policy if exists "Receptionists read followups" on public.appointment_followups;
create policy "Receptionists read followups" on public.appointment_followups
  for select to authenticated using (public.get_user_role() = 'receptionist');

drop policy if exists "Patients and reception read waitlist" on public.waitlist;
create policy "Patients and reception read waitlist" on public.waitlist
  for select to authenticated using (patient_id = auth.uid() or public.get_user_role() = 'receptionist');

drop policy if exists "Patients and reception read offers" on public.waitlist_offers;
create policy "Patients and reception read offers" on public.waitlist_offers
  for select to authenticated using (patient_id = auth.uid() or public.get_user_role() = 'receptionist');

-- All writes go through the security-definer functions below, except marking
-- a notification read.
revoke all on public.notifications, public.appointment_followups, public.waitlist, public.waitlist_offers
  from anon, authenticated;
grant select on public.notifications, public.appointment_followups, public.waitlist, public.waitlist_offers
  to authenticated;
grant update (read_at) on public.notifications to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------------------------------------------------------------- waitlist

-- Offers a free future slot to the oldest matching waitlist entry.
-- Returns the offer id, or null when nothing was offered.
create or replace function public.offer_slot(p_doctor_id uuid, p_date date, p_slot text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_entry public.waitlist%rowtype;
  v_offer_id uuid;
  v_doctor_name text;
begin
  if coalesce(public.appointment_starts_at(p_date, p_slot) <= now(), true) then
    return null;
  end if;
  if exists (
    select 1 from public.appointments
    where doctor_id = p_doctor_id and appointment_date = p_date and time_slot = p_slot and status <> 'cancelled'
  ) or exists (
    select 1 from public.waitlist_offers
    where doctor_id = p_doctor_id and offer_date = p_date and time_slot = p_slot and status = 'pending'
  ) then
    return null;
  end if;

  select w.* into v_entry
  from public.waitlist w
  where w.doctor_id = p_doctor_id
    and w.preferred_date = p_date
    and w.status = 'waiting'
    and (w.preferred_slot is null or w.preferred_slot = p_slot)
    and not exists (
      select 1 from public.appointments a
      where a.patient_id = w.patient_id and a.appointment_date = p_date
        and a.time_slot = p_slot and a.status <> 'cancelled'
    )
    and not exists (
      select 1 from public.waitlist_offers o
      where o.waitlist_id = w.id and o.time_slot = p_slot and o.status in ('declined', 'expired')
    )
  order by (w.preferred_slot = p_slot) desc nulls last, w.created_at
  limit 1
  for update skip locked;

  if not found then
    return null;
  end if;

  insert into public.waitlist_offers (waitlist_id, patient_id, doctor_id, offer_date, time_slot, expires_at)
  values (v_entry.id, v_entry.patient_id, p_doctor_id, p_date, p_slot,
          now() + make_interval(mins => public.waitlist_offer_minutes()))
  returning id into v_offer_id;

  update public.waitlist set status = 'offered' where id = v_entry.id;

  select p.full_name into v_doctor_name
  from public.doctors d join public.profiles p on p.id = d.user_id
  where d.id = p_doctor_id;

  insert into public.notifications (recipient_id, kind, title, body, offer_id)
  values (
    v_entry.patient_id, 'waitlist_offer', 'A slot opened up for you',
    format('%s on %s at %s is free. Accept it in My Appointments within %s minutes.',
           coalesce(v_doctor_name, 'Your doctor'), to_char(p_date, 'Dy DD Mon'), p_slot,
           public.waitlist_offer_minutes()),
    v_offer_id
  )
  on conflict do nothing;

  return v_offer_id;
end $$;

create or replace function public.on_appointment_slot_freed()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'cancelled' and (
       new.status = 'cancelled'
       or new.appointment_date is distinct from old.appointment_date
       or new.time_slot is distinct from old.time_slot
     ) then
    perform public.offer_slot(old.doctor_id, old.appointment_date, old.time_slot);
  end if;
  return null;
end $$;

drop trigger if exists appointment_slot_freed on public.appointments;
create trigger appointment_slot_freed
  after update on public.appointments
  for each row execute function public.on_appointment_slot_freed();

create or replace function public.join_waitlist(
  p_doctor_id uuid,
  p_date date,
  p_slot text default null,
  p_reason text default ''
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_doctor public.doctors%rowtype;
  v_id uuid;
begin
  if public.get_user_role() is distinct from 'patient' then
    raise exception 'Only patients can join the waitlist.' using errcode = '42501';
  end if;
  if p_date is null or p_date < public.clinic_today() then
    raise exception 'Choose today or a future date.' using errcode = '22023';
  end if;

  select * into v_doctor from public.doctors where id = p_doctor_id;
  if not found or v_doctor.status <> 'active' then
    raise exception 'That doctor is not available.' using errcode = '22023';
  end if;
  if not (to_char(p_date, 'Dy') = any (v_doctor.available_days)) then
    raise exception 'The doctor does not work on %.', to_char(p_date, 'Dy') using errcode = '22023';
  end if;
  if p_slot is not null then
    if not (p_slot = any (v_doctor.slots)) then
      raise exception '% is not one of the doctor''s slot times.', p_slot using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.appointments
      where doctor_id = p_doctor_id and appointment_date = p_date and time_slot = p_slot and status <> 'cancelled'
    ) then
      raise exception 'That slot is free. Book it directly.' using errcode = '22023';
    end if;
  end if;

  insert into public.waitlist (patient_id, doctor_id, preferred_date, preferred_slot, reason)
  values (auth.uid(), p_doctor_id, p_date, p_slot, left(coalesce(p_reason, ''), 300))
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'You are already on the waitlist for that doctor and day.' using errcode = '22023';
end $$;

create or replace function public.leave_waitlist(p_waitlist_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_offer public.waitlist_offers%rowtype;
begin
  update public.waitlist set status = 'cancelled'
  where id = p_waitlist_id and patient_id = auth.uid() and status in ('waiting', 'offered');
  if not found then
    raise exception 'Waitlist entry not found.' using errcode = 'P0002';
  end if;

  for v_offer in
    update public.waitlist_offers set status = 'declined', resolved_at = now()
    where waitlist_id = p_waitlist_id and status = 'pending'
    returning *
  loop
    perform public.offer_slot(v_offer.doctor_id, v_offer.offer_date, v_offer.time_slot);
  end loop;
end $$;

create or replace function public.accept_waitlist_offer(p_offer_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_offer public.waitlist_offers%rowtype;
  v_reason text;
  v_appointment_id uuid;
begin
  select * into v_offer from public.waitlist_offers where id = p_offer_id for update;
  if not found or v_offer.patient_id <> auth.uid() then
    raise exception 'Offer not found.' using errcode = 'P0002';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'This offer is already %.', v_offer.status using errcode = '22023';
  end if;
  if v_offer.expires_at <= now() then
    raise exception 'This offer has expired.' using errcode = '22023';
  end if;

  select reason into v_reason from public.waitlist where id = v_offer.waitlist_id;

  begin
    insert into public.appointments (patient_id, doctor_id, appointment_date, time_slot, reason, notes, status)
    values (auth.uid(), v_offer.doctor_id, v_offer.offer_date, v_offer.time_slot,
            coalesce(nullif(v_reason, ''), 'Waitlist booking'), '', 'requested')
    returning id into v_appointment_id;
  exception
    when unique_violation then
      raise exception 'Sorry, that slot was just taken.' using errcode = '22023';
  end;

  update public.waitlist_offers
  set status = 'accepted', appointment_id = v_appointment_id, resolved_at = now()
  where id = p_offer_id;
  update public.waitlist set status = 'booked' where id = v_offer.waitlist_id;
  return v_appointment_id;
end $$;

create or replace function public.decline_waitlist_offer(p_offer_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_offer public.waitlist_offers%rowtype;
begin
  update public.waitlist_offers set status = 'declined', resolved_at = now()
  where id = p_offer_id and patient_id = auth.uid() and status = 'pending'
  returning * into v_offer;
  if not found then
    raise exception 'Offer not found or no longer pending.' using errcode = 'P0002';
  end if;

  update public.waitlist set status = 'waiting' where id = v_offer.waitlist_id and status = 'offered';
  perform public.offer_slot(v_offer.doctor_id, v_offer.offer_date, v_offer.time_slot);
end $$;

-- ---------------------------------------------------------------- follow-ups

create or replace function public.resolve_followup(p_followup_id uuid, p_note text default '')
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.get_user_role() is distinct from 'receptionist' then
    raise exception 'Only receptionists can resolve follow-ups.' using errcode = '42501';
  end if;
  update public.appointment_followups
  set status = 'resolved', note = left(coalesce(p_note, ''), 500), resolved_by = auth.uid(), resolved_at = now()
  where id = p_followup_id and status = 'open';
  if not found then
    raise exception 'Follow-up not found or already resolved.' using errcode = 'P0002';
  end if;
end $$;

-- ---------------------------------------------------------------- scheduled run

create or replace function public.run_clinic_automations()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_reminders int;
  v_no_shows int;
  v_expired int := 0;
  v_offered int := 0;
  v_offer public.waitlist_offers%rowtype;
begin
  -- Reminders: confirmed visits starting within the next 24 hours, once each.
  with due as (
    select a.id, a.patient_id, a.appointment_date, a.time_slot, d.user_id as doctor_user_id
    from public.appointments a
    join public.doctors d on d.id = a.doctor_id
    where a.status = 'confirmed'
      and public.appointment_starts_at(a.appointment_date, a.time_slot) > now()
      and public.appointment_starts_at(a.appointment_date, a.time_slot) <= now() + interval '24 hours'
  ),
  inserted as (
    insert into public.notifications (recipient_id, kind, title, body, appointment_id)
    select due.patient_id, 'reminder_24h', 'Appointment reminder',
           format('You see %s on %s at %s.', coalesce(p.full_name, 'your doctor'),
                  to_char(due.appointment_date, 'Dy DD Mon'), due.time_slot),
           due.id
    from due left join public.profiles p on p.id = due.doctor_user_id
    on conflict do nothing
    returning 1
  )
  select count(*) into v_reminders from inserted;

  -- No-shows: confirmed visits that started 1 hour to 7 days ago and were never completed.
  with missed as (
    select a.id, a.patient_id, a.appointment_date, a.time_slot
    from public.appointments a
    where a.status = 'confirmed'
      and public.appointment_starts_at(a.appointment_date, a.time_slot) < now() - interval '1 hour'
      and public.appointment_starts_at(a.appointment_date, a.time_slot) > now() - interval '7 days'
  ),
  flagged as (
    insert into public.appointment_followups (appointment_id)
    select id from missed
    on conflict (appointment_id) do nothing
    returning appointment_id
  ),
  notified as (
    insert into public.notifications (recipient_id, kind, title, body, appointment_id)
    select staff.id, 'no_show', 'Possible no-show',
           format('%s missed %s at %s. Please follow up.', coalesce(patient.full_name, 'A patient'),
                  to_char(m.appointment_date, 'Dy DD Mon'), m.time_slot),
           m.id
    from flagged f
    join missed m on m.id = f.appointment_id
    left join public.profiles patient on patient.id = m.patient_id
    cross join public.profiles staff
    where staff.role = 'receptionist'
    on conflict do nothing
    returning 1
  )
  select count(*) into v_no_shows from flagged;

  -- Expired offers go back on the waitlist and the slot moves to the next patient.
  for v_offer in
    select * from public.waitlist_offers
    where status = 'pending' and expires_at <= now()
    for update skip locked
  loop
    update public.waitlist_offers set status = 'expired', resolved_at = now() where id = v_offer.id;
    update public.waitlist set status = 'waiting' where id = v_offer.waitlist_id and status = 'offered';
    insert into public.notifications (recipient_id, kind, title, body, offer_id)
    values (v_offer.patient_id, 'offer_expired', 'Waitlist offer expired',
            format('The %s slot on %s was offered to the next patient.', v_offer.time_slot,
                   to_char(v_offer.offer_date, 'Dy DD Mon')),
            v_offer.id)
    on conflict do nothing;
    v_expired := v_expired + 1;
    if public.offer_slot(v_offer.doctor_id, v_offer.offer_date, v_offer.time_slot) is not null then
      v_offered := v_offered + 1;
    end if;
  end loop;

  update public.waitlist set status = 'expired'
  where status = 'waiting' and preferred_date < public.clinic_today();

  return jsonb_build_object(
    'reminders', v_reminders,
    'no_shows', v_no_shows,
    'offers_expired', v_expired,
    'offers_made', v_offered,
    'ran_at', now()
  );
end $$;

create or replace function public.run_clinic_automations_now()
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if public.get_user_role() is distinct from 'receptionist' then
    raise exception 'Only receptionists can run automations.' using errcode = '42501';
  end if;
  return public.run_clinic_automations();
end $$;

-- ---------------------------------------------------------------- grants

revoke execute on function public.offer_slot(uuid, date, text) from public, anon, authenticated;
revoke execute on function public.on_appointment_slot_freed() from public, anon, authenticated;
revoke execute on function public.run_clinic_automations() from public, anon, authenticated;

revoke execute on function public.join_waitlist(uuid, date, text, text) from public, anon;
revoke execute on function public.leave_waitlist(uuid) from public, anon;
revoke execute on function public.accept_waitlist_offer(uuid) from public, anon;
revoke execute on function public.decline_waitlist_offer(uuid) from public, anon;
revoke execute on function public.resolve_followup(uuid, text) from public, anon;
revoke execute on function public.run_clinic_automations_now() from public, anon;

grant execute on function public.join_waitlist(uuid, date, text, text) to authenticated;
grant execute on function public.leave_waitlist(uuid) to authenticated;
grant execute on function public.accept_waitlist_offer(uuid) to authenticated;
grant execute on function public.decline_waitlist_offer(uuid) to authenticated;
grant execute on function public.resolve_followup(uuid, text) to authenticated;
grant execute on function public.run_clinic_automations_now() to authenticated;

commit;

-- ---------------------------------------------------------------- schedule

select cron.schedule('clinic-automations', '*/15 * * * *', $$select public.run_clinic_automations()$$);
