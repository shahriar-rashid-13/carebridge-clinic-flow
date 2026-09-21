-- Prevent concurrent bookings for the same doctor/date/time slot.
-- Cancelled appointments intentionally do not participate in this unique index.
create unique index if not exists appointments_active_slot_unique
on public.appointments (doctor_id, appointment_date, time_slot)
where status <> 'cancelled';
