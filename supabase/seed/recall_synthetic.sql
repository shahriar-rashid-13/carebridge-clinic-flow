-- Synthetic recall history so every recall segment has members.
-- Safe to run more than once: existing synthetic patients are skipped.
--
-- Creates 30 synthetic patients (recall.patientNN@example.test). They have no
-- password and cannot sign in. Groups:
--    1-10  checkup_overdue  completed visit 7 to 15 months ago, nothing upcoming
--   11-18  missed_visit     confirmed visit 9 to 16 days ago, open no-show follow-up
--   19-26  followup_due     visit about 2 months ago, prescription follow-up date passed
--   27-30  in no segment    recent visit and an upcoming requested appointment
--
-- Upcoming appointments are 'requested', not 'confirmed', so no reminder
-- emails are sent for them.
--
-- Remove everything again (cascades to appointments, prescriptions, follow-ups):
--   delete from auth.users where email like 'recall.patient%@example.test';

do $$
declare
  v_names text[] := array[
    'Ayesha Rahman', 'Tanvir Hossain', 'Nusrat Jahan', 'Rafiq Islam', 'Sadia Akter',
    'Imran Kabir', 'Farzana Haque', 'Mahmud Hasan', 'Shirin Sultana', 'Kamal Uddin',
    'Rumana Chowdhury', 'Arif Mahmud', 'Laila Begum', 'Sohel Rana', 'Tahmina Khatun',
    'Jahid Hasan', 'Mitu Das', 'Rakib Ahmed', 'Sumaiya Islam', 'Fahim Shahriar',
    'Nasrin Akhter', 'Habib Rahman', 'Sharmin Nahar', 'Anisur Rahman', 'Popy Saha',
    'Monir Hossain', 'Shapla Roy', 'Delwar Hossain', 'Ruma Sarkar', 'Zahid Karim'
  ];
  v_doctors uuid[];
  v_slots text[];
  v_today date := public.clinic_today();
  v_user uuid;
  v_doctor uuid;
  v_slot text;
  v_visit date;
  v_appt uuid;
  v_email text;
  i int;
begin
  select array_agg(id order by created_at, id) into v_doctors from public.doctors where status = 'active';
  if coalesce(array_length(v_doctors, 1), 0) = 0 then
    raise exception 'No active doctors to attach synthetic visits to.';
  end if;

  for i in 1..30 loop
    v_email := format('recall.patient%s@example.test', lpad(i::text, 2, '0'));
    continue when exists (select 1 from auth.users where email = v_email);

    v_user := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', v_email, '',
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', v_names[i]), now(), now(),
      '', '', '', ''
    );

    update public.profiles
    set is_synthetic = true,
        phone = format('+8801700%s', lpad((1000 + i)::text, 6, '0')),
        gender = case when i % 2 = 0 then 'Male' else 'Female' end,
        date_of_birth = date '1960-01-01' + (i * 523)
    where id = v_user;

    v_doctor := v_doctors[1 + (i % array_length(v_doctors, 1))];
    select slots into v_slots from public.doctors where id = v_doctor;
    v_slot := coalesce(v_slots[1 + (i % greatest(coalesce(array_length(v_slots, 1), 1), 1))], '10:00 AM');

    if i <= 10 then
      v_visit := v_today - (200 + i * 25);
      insert into public.appointments (patient_id, doctor_id, appointment_date, time_slot, reason, notes, status, is_synthetic)
      values (v_user, v_doctor, v_visit, v_slot, 'Routine check-up', '', 'completed', true)
      on conflict do nothing;

    elsif i <= 18 then
      v_visit := v_today - (i - 2);
      insert into public.appointments (patient_id, doctor_id, appointment_date, time_slot, reason, notes, status, is_synthetic)
      values (v_user, v_doctor, v_visit, v_slot, 'Consultation', '', 'confirmed', true)
      on conflict do nothing
      returning id into v_appt;
      if v_appt is not null then
        insert into public.appointment_followups (appointment_id, created_at)
        values (v_appt, (v_visit + 1)::timestamptz)
        on conflict (appointment_id) do nothing;
      end if;

    elsif i <= 26 then
      v_visit := v_today - (40 + i);
      insert into public.appointments (patient_id, doctor_id, appointment_date, time_slot, reason, notes, status, is_synthetic)
      values (v_user, v_doctor, v_visit, v_slot, 'Follow-up consultation', '', 'completed', true)
      on conflict do nothing
      returning id into v_appt;
      if v_appt is not null then
        insert into public.prescriptions (appointment_id, doctor_id, patient_id, diagnosis, medicines, notes, follow_up_date)
        values (v_appt, v_doctor, v_user, 'Synthetic: hypertension review', 'Synthetic: Amlodipine 5 mg once daily',
                'Synthetic record for recall testing.', v_visit + 21);
      end if;

    else
      insert into public.appointments (patient_id, doctor_id, appointment_date, time_slot, reason, notes, status, is_synthetic)
      values (v_user, v_doctor, v_today - 30, v_slot, 'Routine check-up', '', 'completed', true)
      on conflict do nothing;
      insert into public.appointments (patient_id, doctor_id, appointment_date, time_slot, reason, notes, status, is_synthetic)
      values (v_user, v_doctor, v_today + 10, v_slot, 'Routine check-up', '', 'requested', true)
      on conflict do nothing;
    end if;
  end loop;
end $$;
