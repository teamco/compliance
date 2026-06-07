-- ai_usage_summary: returns totals + breakdowns + by_user list
create or replace function ai_usage_summary(p_since timestamptz, p_user_id uuid default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with
    all_rows as (
      select * from ai_usage_log where used_at >= p_since
    ),
    filtered as (
      select * from all_rows
      where (p_user_id is null or user_id = p_user_id)
    )
  select jsonb_build_object(
    'total_calls',         (select count(*) from filtered),
    'total_input_tokens',  coalesce((select sum(input_tokens)  from filtered), 0),
    'total_output_tokens', coalesce((select sum(output_tokens) from filtered), 0),
    'success_count',       (select count(*) from filtered where success),
    'error_count',         (select count(*) from filtered where not success),
    'by_provider', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'provider', provider, 'calls', cnt, 'input_tokens', sum_in, 'output_tokens', sum_out
      ) order by cnt desc)
       from (
         select provider, count(*) as cnt, sum(input_tokens) as sum_in, sum(output_tokens) as sum_out
         from filtered group by provider
       ) t),
      '[]'::jsonb
    ),
    'by_operation', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'operation', operation, 'calls', cnt, 'input_tokens', sum_in, 'output_tokens', sum_out
      ) order by cnt desc)
       from (
         select operation, count(*) as cnt, sum(input_tokens) as sum_in, sum(output_tokens) as sum_out
         from filtered group by operation
       ) t),
      '[]'::jsonb
    ),
    'by_key_source', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'key_source', key_source, 'calls', cnt, 'input_tokens', sum_in, 'output_tokens', sum_out
      ) order by cnt desc)
       from (
         select key_source, count(*) as cnt, sum(input_tokens) as sum_in, sum(output_tokens) as sum_out
         from filtered group by key_source
       ) t),
      '[]'::jsonb
    ),
    'by_user', coalesce(
      (select jsonb_agg(jsonb_build_object(
        'user_id',      r.uid,
        'email',        r.email,
        'full_name',    r.display_name,
        'calls',        r.cnt,
        'input_tokens', r.sum_in,
        'output_tokens',r.sum_out
      ) order by r.cnt desc)
       from (
         select raw.user_id                  as uid,
                u.email                      as email,
                p.display_name               as display_name,
                count(*)                     as cnt,
                sum(raw.input_tokens)        as sum_in,
                sum(raw.output_tokens)       as sum_out
         from all_rows raw
         left join auth.users u on u.id = raw.user_id
         left join public.profiles p on p.id = raw.user_id
         group by raw.user_id, u.email, p.display_name
         order by count(*) desc
         limit 50
       ) r),
      '[]'::jsonb
    )
  )
$$;

revoke all     on function ai_usage_summary(timestamptz, uuid) from public;
revoke execute on function ai_usage_summary(timestamptz, uuid) from anon;
revoke execute on function ai_usage_summary(timestamptz, uuid) from authenticated;
grant  execute on function ai_usage_summary(timestamptz, uuid) to service_role;

-- ai_usage_timeseries: daily buckets with gap-fill so every day in range has a point
create or replace function ai_usage_timeseries(p_since timestamptz, p_user_id uuid default null)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with days as (
    select generate_series(
      date_trunc('day', p_since)::date,
      current_date,
      interval '1 day'
    )::date as d
  ),
  agg as (
    select
      date_trunc('day', used_at)::date         as d,
      count(*)                                  as calls,
      coalesce(sum(input_tokens), 0)            as input_tokens,
      coalesce(sum(output_tokens), 0)           as output_tokens,
      count(*) filter (where not success)       as errors
    from ai_usage_log
    where used_at >= p_since
      and (p_user_id is null or user_id = p_user_id)
    group by d
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date',          to_char(days.d, 'YYYY-MM-DD'),
    'calls',         coalesce(agg.calls, 0),
    'input_tokens',  coalesce(agg.input_tokens, 0),
    'output_tokens', coalesce(agg.output_tokens, 0),
    'errors',        coalesce(agg.errors, 0)
  ) order by days.d), '[]'::jsonb)
  from days
  left join agg on agg.d = days.d
$$;

revoke all     on function ai_usage_timeseries(timestamptz, uuid) from public;
revoke execute on function ai_usage_timeseries(timestamptz, uuid) from anon;
revoke execute on function ai_usage_timeseries(timestamptz, uuid) from authenticated;
grant  execute on function ai_usage_timeseries(timestamptz, uuid) to service_role;
