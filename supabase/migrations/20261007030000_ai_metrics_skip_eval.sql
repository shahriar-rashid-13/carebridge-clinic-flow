-- Leave agent evaluation traffic out of ai_metrics. The eval runner (scripts/agent-eval.mjs) titles
-- its conversations "[eval] ...", so those turns do not mix with real usage on /metrics.
-- Same function as 20261007020000_ai_metrics.sql plus the [eval] filter.

create or replace function public.ai_metrics(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_result jsonb;
begin
  if public.get_user_role() is distinct from 'receptionist' then
    raise exception 'Only receptionists can view AI metrics.' using errcode = '42501';
  end if;

  with turns as (
    select
      m.created_at,
      m.metadata,
      m.metadata->>'function_version' as version,
      nullif(m.metadata->>'latency_ms', '')::numeric as latency_ms,
      m.metadata ? 'emergency' as emergency,
      coalesce(nullif(m.metadata->>'fallback_calls', '')::int, 0) as fallback_calls,
      (
        select coalesce(sum(nullif(u->>'total_tokens', '')::numeric), 0)
        from jsonb_array_elements(
          case when jsonb_typeof(m.metadata->'usage') = 'array' then m.metadata->'usage' else '[]'::jsonb end
          || case when jsonb_typeof(m.metadata->'supervisor'->'usage') = 'array'
                  then m.metadata->'supervisor'->'usage' else '[]'::jsonb end
        ) u
      ) as tokens,
      coalesce(jsonb_array_length(case when jsonb_typeof(m.metadata->'models') = 'array'
                                       then m.metadata->'models' end), 0)
        + coalesce(nullif(m.metadata->'supervisor'->>'calls', '')::int, 0) as model_calls,
      case when jsonb_typeof(m.metadata->'tools') = 'array' then m.metadata->'tools' else '[]'::jsonb end as tools
    from public.ai_messages m
    where m.role = 'assistant'
      and m.metadata->>'function_version' in ('v2', 'v3')
      and not (m.metadata ? 'action')
      and not exists (
        select 1 from public.ai_conversations c
        where c.id = m.conversation_id and c.title like '[eval]%'
      )
      and m.created_at >= now() - make_interval(days => v_days)
  ),
  per_version as (
    select
      t.version,
      count(*) as turns,
      round(avg(t.latency_ms) filter (where not t.emergency)) as avg_latency_ms,
      round((percentile_cont(0.5) within group (order by t.latency_ms)
             filter (where not t.emergency))::numeric) as p50_latency_ms,
      round((percentile_cont(0.95) within group (order by t.latency_ms)
             filter (where not t.emergency))::numeric) as p95_latency_ms,
      round(avg(t.tokens) filter (where t.tokens > 0)) as avg_tokens,
      round(avg(t.model_calls) filter (where not t.emergency), 2) as avg_model_calls,
      count(*) filter (where t.fallback_calls > 0) as fallback_turns,
      coalesce(sum(jsonb_array_length(t.tools)), 0) as tool_calls,
      coalesce(sum((select count(*) from jsonb_array_elements(t.tools) x where (x->>'ok')::boolean is false)), 0)
        as tool_errors,
      count(*) filter (where jsonb_array_length(coalesce(t.metadata->'proposals', '[]'::jsonb)) > 0) as proposal_turns,
      count(*) filter (where t.emergency) as emergency_turns,
      count(*) filter (where t.metadata ? 'injection') as injection_turns,
      count(*) filter (where t.metadata ? 'pii_redacted') as pii_turns,
      count(*) filter (where t.metadata ? 'output_guard') as output_guard_turns,
      count(*) filter (where t.metadata->'route'->>'source' = 'keywords') as keyword_route_turns,
      count(*) filter (where jsonb_array_length(coalesce(t.metadata->'agents', '[]'::jsonb)) > 1) as handoff_turns,
      count(*) filter (where t.metadata ? 'route' and not (t.metadata ? 'agents')) as clarification_turns
    from turns t
    group by t.version
  ),
  agents as (
    select coalesce(jsonb_object_agg(agent, n), '{}'::jsonb) as counts
    from (
      select a.agent, count(*) as n
      from turns t, jsonb_array_elements_text(coalesce(t.metadata->'agents', '[]'::jsonb)) a(agent)
      where t.version = 'v3'
      group by a.agent
    ) s
  ),
  knowledge as (
    select coalesce(jsonb_object_agg(route, n), '{}'::jsonb) as counts
    from (
      select t.metadata->'route'->>'knowledge' as route, count(*) as n
      from turns t
      where t.version = 'v3' and t.metadata ? 'route'
      group by 1
    ) s
  ),
  daily as (
    select coalesce(jsonb_agg(jsonb_build_object('day', day, 'v2', v2, 'v3', v3) order by day), '[]'::jsonb) as rows
    from (
      select (t.created_at at time zone 'Asia/Dhaka')::date as day,
             count(*) filter (where t.version = 'v2') as v2,
             count(*) filter (where t.version = 'v3') as v3
      from turns t
      group by 1
    ) s
  )
  select jsonb_build_object(
    'days', v_days,
    'versions', coalesce((select jsonb_agg(to_jsonb(p) order by p.version) from per_version p), '[]'::jsonb),
    'v3_agents', (select counts from agents),
    'v3_knowledge', (select counts from knowledge),
    'daily', (select rows from daily)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.ai_metrics(int) from public, anon;
grant execute on function public.ai_metrics(int) to authenticated;
