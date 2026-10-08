-- 20261006010000_recall_segments.sql added appointments_patient_date, which duplicates the
-- base schema index idx_appointments_patient_date (patient_id, appointment_date).
drop index if exists public.appointments_patient_date;
