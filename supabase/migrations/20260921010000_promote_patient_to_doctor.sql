create or replace function public.promote_patient_to_doctor(
  p_target_profile_id uuid,
  p_specialization text,
  p_consultation_fee numeric,
  p_available_days text[],
  p_slots text[],
  p_active boolean,
  p_bio text,
  p_room text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
  target_profile public.profiles%rowtype;
  created_doctor public.doctors%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to promote a patient.'
      using errcode = '42501';
  end if;

  select profile.role::text
    into caller_role
    from public.profiles as profile
   where profile.id = auth.uid();

  if caller_role is distinct from 'receptionist' then
    raise exception 'Only receptionists can promote a patient to doctor.'
      using errcode = '42501';
  end if;

  if nullif(btrim(p_specialization), '') is null then
    raise exception 'Specialization is required.'
      using errcode = '22023';
  end if;

  if p_consultation_fee is null or p_consultation_fee <= 0 then
    raise exception 'Consultation fee must be greater than zero.'
      using errcode = '22023';
  end if;

  if coalesce(cardinality(p_available_days), 0) = 0
     or exists (
       select 1
       from unnest(coalesce(p_available_days, array[]::text[])) as day_name
       where btrim(day_name) = ''
     ) then
    raise exception 'At least one valid working day is required.'
      using errcode = '22023';
  end if;

  if coalesce(cardinality(p_slots), 0) = 0
     or exists (
       select 1
       from unnest(coalesce(p_slots, array[]::text[])) as slot_name
       where btrim(slot_name) = ''
     ) then
    raise exception 'At least one valid time slot is required.'
      using errcode = '22023';
  end if;

  -- Lock the profile so concurrent promotion attempts are serialized.
  select profile.*
    into target_profile
    from public.profiles as profile
   where profile.id = p_target_profile_id
   for update;

  if not found then
    raise exception 'The selected patient profile no longer exists.'
      using errcode = 'P0002';
  end if;

  if target_profile.role::text <> 'patient' then
    raise exception
      'The selected profile is no longer an active patient and cannot be promoted.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.doctors as doctor
    where doctor.user_id = p_target_profile_id
  ) then
    raise exception 'This profile already has a doctor record.'
      using errcode = '23505';
  end if;

  update public.profiles
     set role = 'doctor'
   where id = p_target_profile_id;

  insert into public.doctors (
    user_id,
    specialization,
    consultation_fee,
    available_days,
    slots,
    status,
    bio,
    room
  )
  values (
    p_target_profile_id,
    btrim(p_specialization),
    p_consultation_fee,
    p_available_days,
    p_slots,
    case when p_active then 'active' else 'inactive' end,
    p_bio,
    p_room
  )
  returning * into created_doctor;

  return to_jsonb(created_doctor) || jsonb_build_object(
    'profile',
    jsonb_build_object(
      'id', target_profile.id,
      'full_name', target_profile.full_name,
      'email', target_profile.email,
      'role', 'doctor'
    )
  );
end;
$$;

revoke all on function public.promote_patient_to_doctor(
  uuid,
  text,
  numeric,
  text[],
  text[],
  boolean,
  text,
  text
) from public;

grant execute on function public.promote_patient_to_doctor(
  uuid,
  text,
  numeric,
  text[],
  text[],
  boolean,
  text,
  text
) to authenticated;