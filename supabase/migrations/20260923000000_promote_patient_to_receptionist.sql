create or replace function public.promote_patient_to_receptionist(
  p_target_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_role text;
  target_profile public.profiles%rowtype;
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
    raise exception 'Only receptionists can promote a patient.'
      using errcode = '42501';
  end if;

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
    raise exception 'Only an active patient can be promoted to receptionist.'
      using errcode = 'P0001';
  end if;

  update public.profiles
     set role = 'receptionist'
   where id = p_target_profile_id;

  return jsonb_build_object(
    'id', target_profile.id,
    'full_name', target_profile.full_name,
    'email', target_profile.email,
    'role', 'receptionist'
  );
end;
$$;

revoke all on function public.promote_patient_to_receptionist(uuid) from public;

grant execute on function public.promote_patient_to_receptionist(uuid) to authenticated;
