-- Recall campaigns, opt-outs and frequency cap (Assessment 3, track 2).
--
-- A receptionist previews a recall segment, then sends a campaign. Each
-- eligible patient gets one 'campaign' email in message_outbox, so campaigns
-- reuse the dispatcher, retries, quiet hours, sandbox and webhook tracking.
--
-- Rules:
--   - email_opt_out stops all email; campaign_opt_out stops campaigns only.
--   - At most one campaign email per patient per 7 days.
--   - A patient is never added twice to the same campaign.
--   - Emails above the daily quota are scheduled for 08:00 the next day.
--   - Conversion = recipients who booked within 14 days of the campaign.

begin;

-- ---------------------------------------------------------------- tables

alter table public.message_outbox drop constraint if exists message_outbox_template_check;
alter table public.message_outbox add constraint message_outbox_template_check
  check (template in ('reminder_24h', 'campaign'));

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  segment text not null check (segment in ('checkup_overdue', 'missed_visit', 'followup_due')),
  subject text not null check (length(trim(subject)) between 1 and 150),
  body text not null check (length(trim(body)) between 1 and 2000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists campaigns_created_by on public.campaigns (created_by);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  outbox_id uuid references public.message_outbox(id) on delete set null,
  status text not null check (status in ('queued', 'scheduled', 'skipped')),
  skip_reason text check (skip_reason in ('opted_out', 'no_email', 'frequency_cap')),
  created_at timestamptz not null default now(),
  unique (campaign_id, patient_id)
);
create index if not exists campaign_recipients_patient on public.campaign_recipients (patient_id, created_at desc);
create index if not exists campaign_recipients_outbox on public.campaign_recipients (outbox_id);

create table if not exists public.communication_opt_outs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('campaign', 'all')),
  source text not null check (source in ('unsubscribe_link', 'reception')),
  campaign_id uuid references public.campaigns(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists communication_opt_outs_patient on public.communication_opt_outs (patient_id);
create index if not exists communication_opt_outs_campaign on public.communication_opt_outs (campaign_id);

alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.communication_opt_outs enable row level security;

drop policy if exists "Receptionists read campaigns" on public.campaigns;
create policy "Receptionists read campaigns" on public.campaigns
  for select to authenticated using ((select public.get_user_role()) = 'receptionist');
drop policy if exists "Receptionists read campaign recipients" on public.campaign_recipients;
create policy "Receptionists read campaign recipients" on public.campaign_recipients
  for select to authenticated using ((select public.get_user_role()) = 'receptionist');
drop policy if exists "Receptionists read opt-outs" on public.communication_opt_outs;
create policy "Receptionists read opt-outs" on public.communication_opt_outs
  for select to authenticated using ((select public.get_user_role()) = 'receptionist');

revoke all on public.campaigns, public.campaign_recipients, public.communication_opt_outs from anon, authenticated;
grant select on public.campaigns, public.campaign_recipients, public.communication_opt_outs to authenticated;

-- ---------------------------------------------------------------- helpers

create or replace function public.email_daily_quota()
returns int
language sql immutable set search_path = '' as $$ select 100 $$;

create or replace function public.campaign_cap_days()
returns int
language sql immutable set search_path = '' as $$ select 7 $$;

-- Emails still allowed today (Asia/Dhaka), counting everything queued or sent today.
create or replace function public.email_quota_left()
returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, public.email_daily_quota() - count(*)::int)
  from public.message_outbox
  where status <> 'skipped'
    and created_at >= (public.clinic_today()::timestamp at time zone 'Asia/Dhaka')
$$;

create or replace function public.require_receptionist()
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if public.get_user_role() is distinct from 'receptionist' then
    raise exception 'Only receptionists can manage campaigns.' using errcode = '42501';
  end if;
end $$;

-- Segment members with the reason they cannot receive a campaign, if any.
create or replace function public.campaign_audience(p_segment text)
returns table (patient_id uuid, full_name text, email text, detail text, skip_reason text)
language sql stable security definer set search_path = public as $$
  select m.patient_id, m.full_name, m.email, m.detail,
         case
           when m.email_opt_out or m.campaign_opt_out then 'opted_out'
           when m.email is null or trim(m.email) = '' then 'no_email'
           when exists (
             select 1 from public.campaign_recipients r
             where r.patient_id = m.patient_id and r.status in ('queued', 'scheduled')
               and r.created_at > now() - make_interval(days => public.campaign_cap_days())
           ) then 'frequency_cap'
         end
  from public.recall_segment_members(p_segment) m
$$;

-- ---------------------------------------------------------------- preview and send

create or replace function public.preview_campaign(p_segment text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_result jsonb;
  v_quota int := public.email_quota_left();
begin
  perform public.require_receptionist();
  select jsonb_build_object(
    'segment', p_segment,
    'total', count(*),
    'eligible', count(*) filter (where skip_reason is null),
    'excluded', jsonb_build_object(
      'opted_out', count(*) filter (where skip_reason = 'opted_out'),
      'no_email', count(*) filter (where skip_reason = 'no_email'),
      'frequency_cap', count(*) filter (where skip_reason = 'frequency_cap')
    ),
    'quota_left', v_quota,
    'send_today', least(count(*) filter (where skip_reason is null), v_quota)
  ) into v_result
  from public.campaign_audience(p_segment);

  select v_result || jsonb_build_object('sample', coalesce(jsonb_agg(s), '[]'::jsonb)) into v_result
  from (
    select jsonb_build_object('full_name', full_name, 'detail', detail, 'skip_reason', skip_reason) as s
    from public.campaign_audience(p_segment)
    order by skip_reason nulls first, full_name
    limit 8
  ) sample;
  return v_result;
end $$;

create or replace function public.send_campaign(p_name text, p_segment text, p_subject text, p_body text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_campaign uuid;
  v_quota int := public.email_quota_left();
  v_tomorrow timestamptz := ((public.clinic_today() + 1)::timestamp + time '08:00') at time zone 'Asia/Dhaka';
  v_member record;
  v_outbox uuid;
  v_queued int := 0;
begin
  perform public.require_receptionist();

  insert into public.campaigns (name, segment, subject, body, created_by)
  values (trim(p_name), p_segment, trim(p_subject), trim(p_body), auth.uid())
  returning id into v_campaign;

  for v_member in
    select * from public.campaign_audience(p_segment) order by skip_reason nulls first, full_name
  loop
    if v_member.skip_reason is not null then
      insert into public.campaign_recipients (campaign_id, patient_id, status, skip_reason)
      values (v_campaign, v_member.patient_id, 'skipped', v_member.skip_reason);
      continue;
    end if;

    insert into public.message_outbox (template, recipient_id, recipient, payload, idempotency_key, next_attempt_at)
    values (
      'campaign', v_member.patient_id, v_member.email,
      jsonb_build_object(
        'name', v_member.full_name, 'subject', trim(p_subject), 'body', trim(p_body),
        'campaign_id', v_campaign, 'patient_id', v_member.patient_id
      ),
      format('campaign:%s:%s', v_campaign, v_member.patient_id),
      case when v_queued < v_quota then now() else v_tomorrow end
    )
    returning id into v_outbox;

    insert into public.campaign_recipients (campaign_id, patient_id, outbox_id, status)
    values (v_campaign, v_member.patient_id, v_outbox, case when v_queued < v_quota then 'queued' else 'scheduled' end);
    v_queued := v_queued + 1;
  end loop;

  return v_campaign;
end $$;

-- ---------------------------------------------------------------- results

create or replace function public.campaign_results()
returns table (
  id uuid,
  name text,
  segment text,
  subject text,
  created_at timestamptz,
  recipients int,
  skipped int,
  scheduled int,
  sent int,
  delivered int,
  bounced int,
  complained int,
  failed int,
  opted_out int,
  booked_14d int
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_receptionist();
  return query
  select c.id, c.name, c.segment, c.subject, c.created_at,
         count(r.id) filter (where r.status <> 'skipped')::int,
         count(r.id) filter (where r.status = 'skipped')::int,
         count(r.id) filter (where o.status = 'queued' and o.next_attempt_at > now())::int,
         count(r.id) filter (where o.status in ('sent', 'delivered', 'delayed', 'bounced', 'complained'))::int,
         count(r.id) filter (where o.status in ('delivered', 'complained'))::int,
         count(r.id) filter (where o.status = 'bounced')::int,
         count(r.id) filter (where o.status = 'complained')::int,
         count(r.id) filter (where o.status = 'failed')::int,
         (select count(distinct x.patient_id)::int from public.communication_opt_outs x where x.campaign_id = c.id),
         count(r.id) filter (
           where r.status <> 'skipped' and exists (
             select 1 from public.appointments a
             where a.patient_id = r.patient_id and a.status <> 'cancelled'
               and a.created_at > c.created_at and a.created_at <= c.created_at + interval '14 days'
           )
         )::int
  from public.campaigns c
  left join public.campaign_recipients r on r.campaign_id = c.id
  left join public.message_outbox o on o.id = r.outbox_id
  group by c.id
  order by c.created_at desc;
end $$;

-- ---------------------------------------------------------------- dispatcher: honour opt-outs at send time

create or replace function public.claim_outbox_batch(p_limit int default 20)
returns setof public.message_outbox
language plpgsql security definer set search_path = public as $$
declare
  v_hour int := extract(hour from now() at time zone 'Asia/Dhaka');
begin
  if v_hour >= 22 or v_hour < 8 then
    return;
  end if;

  -- A patient may opt out after an email was queued (for example, a campaign
  -- scheduled for the next day). Skip those rows instead of sending them.
  update public.message_outbox o
  set status = 'skipped', last_error = 'patient opted out before sending', updated_at = now()
  from public.profiles p
  where p.id = o.recipient_id
    and o.status = 'queued' and o.next_attempt_at <= now()
    and (p.email_opt_out or (o.template = 'campaign' and p.campaign_opt_out));

  return query
  update public.message_outbox o
  set status = 'sending', attempts = o.attempts + 1, updated_at = now()
  where o.id in (
    select id from public.message_outbox
    where (status = 'queued' and next_attempt_at <= now())
       or (status = 'sending' and updated_at < now() - interval '10 minutes')
    order by next_attempt_at
    limit greatest(1, least(p_limit, 50))
    for update skip locked
  )
  returning o.*;
end $$;

-- ---------------------------------------------------------------- grants

revoke execute on function public.email_quota_left() from public, anon, authenticated;
revoke execute on function public.require_receptionist() from public, anon, authenticated;
revoke execute on function public.campaign_audience(text) from public, anon, authenticated;
revoke execute on function public.preview_campaign(text) from public, anon;
revoke execute on function public.send_campaign(text, text, text, text) from public, anon;
revoke execute on function public.campaign_results() from public, anon;
grant execute on function public.preview_campaign(text) to authenticated;
grant execute on function public.send_campaign(text, text, text, text) to authenticated;
grant execute on function public.campaign_results() to authenticated;

commit;
