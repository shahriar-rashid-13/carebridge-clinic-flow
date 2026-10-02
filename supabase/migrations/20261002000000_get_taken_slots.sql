-- Patients can only read their own appointments, so the booking page could not see
-- slots held by other patients and offered them as free. This function returns only
-- the date and time of active appointments for one doctor, with no patient details.

create or replace function public.get_taken_slots(p_doctor_id uuid, p_from date, p_to date)
returns table (appointment_date date, time_slot text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.appointment_date, a.time_slot
  from public.appointments a
  where a.doctor_id = p_doctor_id
    and a.appointment_date between p_from and least(p_to, p_from + 62)
    and a.status <> 'cancelled';
$$;

revoke execute on function public.get_taken_slots(uuid, date, date) from public, anon;
grant execute on function public.get_taken_slots(uuid, date, date) to authenticated;
