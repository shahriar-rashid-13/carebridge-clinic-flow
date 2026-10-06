-- Patient recall segments (Assessment 3, track 2).
--
-- Three segments of patients to contact, for receptionists only:
--   checkup_overdue  last completed visit over 180 days ago and nothing upcoming
--   missed_visit     open no-show follow-up and no booking made since
--   followup_due     a prescription's follow-up date has passed with no visit since
--
-- is_synthetic marks the seeded recall history (supabase/seed/recall_synthetic.sql)
-- so it can be told apart from, and removed without touching, the demo accounts.

begin;

alter table public.profiles add column if not exists is_synthetic boolean not null default false;
alter table public.profiles add column if not exists campaign_opt_out boolean not null default false;
alter table public.appointments add column if not exists is_synthetic boolean not null default false;
alter table public.prescriptions add column if not exists follow_up_date date;

create index if not exists prescriptions_follow_up
  on public.prescriptions (follow_up_date) where follow_up_date is not null;
create index if not exists appointments_patient_date
  on public.appointments (patient_id, appointment_date);

create or replace function public.recall_checkup_months()
returns int
language sql immutable set search_path = '' as $$ select 6 $$;

-- Members of one segment. Each patient appears once per segment.
create or replace function public.recall_segment_members(p_segment text)
returns table (
  patient_id uuid,
  full_name text,
  email text,
  email_opt_out boolean,
  campaign_opt_out boolean,
  reference_date date,
  detail text
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.clinic_today();
begin
  if public.get_user_role() is distinct from 'receptionist' then
    raise exception 'Only receptionists can view recall segments.' using errcode = '42501';
  end if;

  if p_segment = 'checkup_overdue' then
    return query
    with last_visit as (
      select a.patient_id, max(a.appointment_date) as visit_date
      from public.appointments a
      where a.status = 'completed'
      group by a.patient_id
    )
    select p.id, p.full_name, p.email, p.email_opt_out, p.campaign_opt_out, lv.visit_date,
           format('Last visit %s', to_char(lv.visit_date, 'DD Mon YYYY'))
    from last_visit lv
    join public.profiles p on p.id = lv.patient_id and p.role = 'patient'
    where lv.visit_date < v_today - make_interval(months => public.recall_checkup_months())
      and not exists (
        select 1 from public.appointments u
        where u.patient_id = lv.patient_id and u.status in ('requested', 'confirmed') and u.appointment_date >= v_today
      )
    order by lv.visit_date;

  elsif p_segment = 'missed_visit' then
    return query
    select distinct on (p.id)
           p.id, p.full_name, p.email, p.email_opt_out, p.campaign_opt_out, a.appointment_date,
           format('Missed %s at %s', to_char(a.appointment_date, 'DD Mon YYYY'), a.time_slot)
    from public.appointment_followups f
    join public.appointments a on a.id = f.appointment_id
    join public.profiles p on p.id = a.patient_id and p.role = 'patient'
    where f.status = 'open'
      and not exists (
        select 1 from public.appointments b
        where b.patient_id = a.patient_id and b.id <> a.id
          and b.status <> 'cancelled' and b.created_at > f.created_at
      )
    order by p.id, a.appointment_date desc;

  elsif p_segment = 'followup_due' then
    return query
    select distinct on (p.id)
           p.id, p.full_name, p.email, p.email_opt_out, p.campaign_opt_out, rx.follow_up_date,
           format('Follow-up was due %s', to_char(rx.follow_up_date, 'DD Mon YYYY'))
    from public.prescriptions rx
    join public.appointments a on a.id = rx.appointment_id
    join public.profiles p on p.id = rx.patient_id and p.role = 'patient'
    where rx.follow_up_date < v_today
      and not exists (
        select 1 from public.appointments b
        where b.patient_id = rx.patient_id and b.status <> 'cancelled' and b.appointment_date > a.appointment_date
      )
    order by p.id, rx.follow_up_date desc;

  else
    raise exception 'Unknown segment %.', p_segment using errcode = '22023';
  end if;
end $$;

create or replace function public.recall_segment_counts()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if public.get_user_role() is distinct from 'receptionist' then
    raise exception 'Only receptionists can view recall segments.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'checkup_overdue', (select count(*) from public.recall_segment_members('checkup_overdue')),
    'missed_visit', (select count(*) from public.recall_segment_members('missed_visit')),
    'followup_due', (select count(*) from public.recall_segment_members('followup_due'))
  );
end $$;

revoke execute on function public.recall_segment_members(text) from public, anon;
revoke execute on function public.recall_segment_counts() from public, anon;
grant execute on function public.recall_segment_members(text) to authenticated;
grant execute on function public.recall_segment_counts() to authenticated;

commit;
