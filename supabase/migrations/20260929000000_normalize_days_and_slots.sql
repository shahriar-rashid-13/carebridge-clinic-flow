-- Normalize doctor working days to "Mon".."Sun" and all slot strings to "09:00 AM".
-- Existing rows mix "Monday"/"Mon" and "09:00AM"/"09:00 AM". Slot comparisons
-- (get_taken_slots, patient_reschedule_appointment, appointments_active_slot_unique)
-- match exact strings, so mixed formats can hide conflicts.

begin;

create function pg_temp.norm_slot(s text) returns text
language sql immutable as $$
  select case
    when upper(trim(s)) ~ '^\d{1,2}:\d{2}\s*(AM|PM)$' then
      regexp_replace(
        regexp_replace(upper(trim(s)), '^(\d{1,2}):(\d{2})\s*(AM|PM)$', '\1:\2 \3'),
        '^(\d):', '0\1:')
    else trim(s)
  end
$$;

-- Stop if normalizing appointment slots would create two active bookings for one slot.
do $$
begin
  if exists (
    select 1 from public.appointments
    where status <> 'cancelled'
    group by doctor_id, appointment_date, pg_temp.norm_slot(time_slot)
    having count(*) > 1
  ) then
    raise exception 'Normalizing would create duplicate active bookings. Resolve them first.';
  end if;
end $$;

update public.doctors
set available_days = (
  select coalesce(array_agg(day order by array_position(array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], day)), '{}')
  from (
    select distinct initcap(left(trim(d), 3)) as day
    from unnest(available_days) as d
    where initcap(left(trim(d), 3)) = any (array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])
  ) as days
)
where available_days is distinct from (
  select coalesce(array_agg(day order by array_position(array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'], day)), '{}')
  from (
    select distinct initcap(left(trim(d), 3)) as day
    from unnest(available_days) as d
    where initcap(left(trim(d), 3)) = any (array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])
  ) as days
);

update public.doctors
set slots = (
  select coalesce(array_agg(slot order by first_position), '{}')
  from (
    select pg_temp.norm_slot(s) as slot, min(position) as first_position
    from unnest(slots) with ordinality as t(s, position)
    group by pg_temp.norm_slot(s)
  ) as normalized
)
where exists (select 1 from unnest(slots) as s where s <> pg_temp.norm_slot(s));

update public.appointments
set time_slot = pg_temp.norm_slot(time_slot)
where time_slot <> pg_temp.norm_slot(time_slot);

commit;
