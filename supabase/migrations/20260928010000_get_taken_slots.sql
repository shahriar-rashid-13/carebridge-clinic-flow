-- Returns occupied slot strings for a doctor/date without exposing who booked them.
-- Needed because patient RLS only shows the caller's own appointments, so
-- availability computed under patient RLS would miss other patients' bookings.

create or replace function public.get_taken_slots(p_doctor_id uuid, p_date date)
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.time_slot
  from public.appointments as a
  where auth.uid() is not null
    and a.doctor_id = p_doctor_id
    and a.appointment_date::date = p_date
    and a.status <> 'cancelled';
$$;

revoke all on function public.get_taken_slots(uuid, date) from public, anon;
grant execute on function public.get_taken_slots(uuid, date) to authenticated;
