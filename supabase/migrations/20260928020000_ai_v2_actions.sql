-- AI V2 Phase E: confirmation framework for AI write actions, transactional
-- write RPCs, and RLS hardening found during the AI V2 policy review.

------------------------------------------------------------------------------
-- 1. Pending actions (AI proposals awaiting explicit user confirmation)
------------------------------------------------------------------------------

create table if not exists public.ai_pending_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('patient', 'doctor', 'receptionist')),
  action_type text not null,
  payload jsonb not null,
  summary text not null,
  details jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'executing', 'confirmed', 'cancelled', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  resolved_at timestamptz
);

create index if not exists ai_pending_actions_user_id_idx
  on public.ai_pending_actions (user_id, created_at desc);

alter table public.ai_pending_actions enable row level security;

-- Clients may only read their own actions. All writes go through the RPCs below.
drop policy if exists "Users can view their own AI pending actions" on public.ai_pending_actions;
create policy "Users can view their own AI pending actions"
on public.ai_pending_actions for select
to authenticated
using (user_id = auth.uid());

create or replace function public.ai_create_pending_action(
  p_action_type text,
  p_payload jsonb,
  p_summary text,
  p_details jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.get_user_role();
  v_row public.ai_pending_actions%rowtype;
begin
  if v_uid is null or v_role is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into public.ai_pending_actions (user_id, role, action_type, payload, summary, details)
  values (v_uid, v_role, p_action_type, p_payload, left(p_summary, 500), coalesce(p_details, '[]'::jsonb))
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'action_type', v_row.action_type,
    'summary', v_row.summary,
    'details', v_row.details,
    'status', v_row.status,
    'expires_at', v_row.expires_at
  );
end;
$$;

-- Atomically moves a pending, unexpired action owned by the caller to 'executing'.
create or replace function public.ai_claim_pending_action(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.ai_pending_actions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  update public.ai_pending_actions
  set status = 'executing'
  where id = p_id
    and user_id = auth.uid()
    and status = 'pending'
    and expires_at > now()
  returning * into v_row;

  if not found then
    select * into v_row from public.ai_pending_actions where id = p_id and user_id = auth.uid();
    if not found then
      raise exception 'Action not found' using errcode = 'P0002';
    end if;
    if v_row.status = 'pending' then
      raise exception 'This proposal has expired. Ask the assistant again.' using errcode = '22023';
    end if;
    raise exception 'This proposal was already %.', v_row.status using errcode = '22023';
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.ai_finish_pending_action(p_id uuid, p_status text, p_result jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status not in ('confirmed', 'failed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;

  update public.ai_pending_actions
  set status = p_status, result = p_result, resolved_at = now()
  where id = p_id and user_id = auth.uid() and status = 'executing';
end;
$$;

create or replace function public.ai_cancel_pending_action(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.ai_pending_actions
  set status = 'cancelled', resolved_at = now()
  where id = p_id and user_id = auth.uid() and status = 'pending';

  if not found then
    raise exception 'This proposal can no longer be cancelled.' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.ai_create_pending_action(text, jsonb, text, jsonb) from public, anon;
revoke all on function public.ai_claim_pending_action(uuid) from public, anon;
revoke all on function public.ai_finish_pending_action(uuid, text, jsonb) from public, anon;
revoke all on function public.ai_cancel_pending_action(uuid) from public, anon;
grant execute on function public.ai_create_pending_action(text, jsonb, text, jsonb) to authenticated;
grant execute on function public.ai_claim_pending_action(uuid) to authenticated;
grant execute on function public.ai_finish_pending_action(uuid, text, jsonb) to authenticated;
grant execute on function public.ai_cancel_pending_action(uuid) to authenticated;

------------------------------------------------------------------------------
-- 2. RLS hardening
------------------------------------------------------------------------------

-- Roles change only through the security-definer promotion RPCs, which run as
-- the function owner rather than as 'authenticated'.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role and current_user = 'authenticated' then
    raise exception 'Roles can only be changed through the promotion workflow.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_role_change on public.profiles;
create trigger guard_profile_role_change
before update on public.profiles
for each row execute function public.guard_profile_role_change();

-- Patients and doctors may change only the appointment status directly.
create or replace function public.guard_appointment_update()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated'
     and public.get_user_role() in ('patient', 'doctor')
     and (new.patient_id, new.doctor_id, new.appointment_date, new.time_slot)
         is distinct from (old.patient_id, old.doctor_id, old.appointment_date, old.time_slot) then
    raise exception 'Only the appointment status can be changed.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_appointment_update on public.appointments;
create trigger guard_appointment_update
before update on public.appointments
for each row execute function public.guard_appointment_update();

-- New patient bookings always start as 'requested'.
drop policy if exists "Patients can book appointments" on public.appointments;
create policy "Patients can book appointments"
on public.appointments for insert
to authenticated
with check (
  patient_id = (select auth.uid())
  and (select public.get_user_role()) = 'patient'
  and status = 'requested'
);

-- Patients cancel only active appointments.
drop policy if exists "Patients can cancel their appointments" on public.appointments;
create policy "Patients can cancel their appointments"
on public.appointments for update
to authenticated
using (patient_id = (select auth.uid()) and status in ('requested', 'confirmed'))
with check (patient_id = (select auth.uid()) and status = 'cancelled');

-- Doctors complete only confirmed appointments.
drop policy if exists "Doctors can complete their appointments" on public.appointments;
create policy "Doctors can complete their appointments"
on public.appointments for update
to authenticated
using (
  status = 'confirmed'
  and exists (
    select 1 from public.doctors d
    where d.id = appointments.doctor_id and d.user_id = (select auth.uid())
  )
)
with check (
  status = 'completed'
  and exists (
    select 1 from public.doctors d
    where d.id = appointments.doctor_id and d.user_id = (select auth.uid())
  )
);

-- One bill and one prescription per appointment. Skipped with a notice if
-- existing data already violates the rule.
do $$
begin
  if exists (select 1 from public.bills group by appointment_id having count(*) > 1) then
    raise notice 'Duplicate bills exist; bills_appointment_id_unique was not created.';
  else
    create unique index if not exists bills_appointment_id_unique on public.bills (appointment_id);
  end if;

  if exists (select 1 from public.prescriptions group by appointment_id having count(*) > 1) then
    raise notice 'Duplicate prescriptions exist; prescriptions_appointment_id_unique was not created.';
  else
    create unique index if not exists prescriptions_appointment_id_unique on public.prescriptions (appointment_id);
  end if;
end;
$$;

------------------------------------------------------------------------------
-- 3. Transactional write RPCs
------------------------------------------------------------------------------

-- Patient reschedule: same doctor, new date/slot, back to 'requested' for review.
create or replace function public.patient_reschedule_appointment(
  p_appointment_id uuid,
  p_date date,
  p_time_slot text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_doctor public.doctors%rowtype;
begin
  if v_uid is null or public.get_user_role() is distinct from 'patient' then
    raise exception 'Only patients can use this action.' using errcode = '42501';
  end if;

  select * into v_appointment
  from public.appointments
  where id = p_appointment_id and patient_id = v_uid
  for update;
  if not found then
    raise exception 'Appointment not found.' using errcode = 'P0002';
  end if;
  if v_appointment.status not in ('requested', 'confirmed') then
    raise exception 'Only requested or confirmed appointments can be rescheduled.' using errcode = '22023';
  end if;
  if p_date < current_date then
    raise exception 'The new date is in the past.' using errcode = '22023';
  end if;

  select * into v_doctor from public.doctors where id = v_appointment.doctor_id;
  if not found or v_doctor.status is distinct from 'active' then
    raise exception 'The doctor is not available for booking.' using errcode = '22023';
  end if;
  if not (to_char(p_date, 'Dy') = any (v_doctor.available_days)) then
    raise exception 'The doctor does not work on that day.' using errcode = '22023';
  end if;
  if not (p_time_slot = any (v_doctor.slots)) then
    raise exception 'That time is not one of the doctor''s slots.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.appointments
    where doctor_id = v_appointment.doctor_id
      and appointment_date::date = p_date
      and time_slot = p_time_slot
      and status <> 'cancelled'
      and id <> p_appointment_id
  ) then
    raise exception 'That slot is already booked.' using errcode = '23505';
  end if;

  update public.appointments
  set appointment_date = p_date, time_slot = p_time_slot, status = 'requested'
  where id = p_appointment_id;

  return jsonb_build_object(
    'appointment_id', p_appointment_id,
    'appointment_date', p_date,
    'time_slot', p_time_slot,
    'status', 'requested'
  );
end;
$$;

-- Doctor consultation: prescription insert and completion in one transaction.
create or replace function public.complete_consultation(
  p_appointment_id uuid,
  p_diagnosis text,
  p_medicines jsonb,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_medicines_type text;
  v_prescription_id uuid;
begin
  if v_uid is null or public.get_user_role() is distinct from 'doctor' then
    raise exception 'Only doctors can complete consultations.' using errcode = '42501';
  end if;
  if nullif(btrim(p_diagnosis), '') is null then
    raise exception 'Diagnosis is required.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_medicines) is distinct from 'array' then
    raise exception 'Medicines must be a list.' using errcode = '22023';
  end if;

  select a.* into v_appointment
  from public.appointments as a
  join public.doctors as d on d.id = a.doctor_id
  where a.id = p_appointment_id and d.user_id = v_uid
  for update of a;
  if not found then
    raise exception 'Appointment not found among your appointments.' using errcode = 'P0002';
  end if;
  if v_appointment.status <> 'confirmed' then
    raise exception 'Only confirmed appointments can be completed.' using errcode = '22023';
  end if;
  if exists (select 1 from public.prescriptions where appointment_id = p_appointment_id) then
    raise exception 'This appointment already has a prescription.' using errcode = '23505';
  end if;

  select data_type into v_medicines_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'prescriptions' and column_name = 'medicines';

  if v_medicines_type = 'jsonb' then
    insert into public.prescriptions (appointment_id, doctor_id, patient_id, diagnosis, medicines, notes)
    values (p_appointment_id, v_appointment.doctor_id, v_appointment.patient_id, btrim(p_diagnosis), p_medicines, coalesce(p_notes, ''))
    returning id into v_prescription_id;
  elsif v_medicines_type = 'json' then
    insert into public.prescriptions (appointment_id, doctor_id, patient_id, diagnosis, medicines, notes)
    values (p_appointment_id, v_appointment.doctor_id, v_appointment.patient_id, btrim(p_diagnosis), p_medicines::json, coalesce(p_notes, ''))
    returning id into v_prescription_id;
  else
    insert into public.prescriptions (appointment_id, doctor_id, patient_id, diagnosis, medicines, notes)
    values (p_appointment_id, v_appointment.doctor_id, v_appointment.patient_id, btrim(p_diagnosis), p_medicines::text, coalesce(p_notes, ''))
    returning id into v_prescription_id;
  end if;

  update public.appointments set status = 'completed' where id = p_appointment_id;

  return jsonb_build_object('prescription_id', v_prescription_id, 'appointment_id', p_appointment_id, 'status', 'completed');
end;
$$;

revoke all on function public.patient_reschedule_appointment(uuid, date, text) from public, anon;
revoke all on function public.complete_consultation(uuid, text, jsonb, text) from public, anon;
grant execute on function public.patient_reschedule_appointment(uuid, date, text) to authenticated;
grant execute on function public.complete_consultation(uuid, text, jsonb, text) to authenticated;
