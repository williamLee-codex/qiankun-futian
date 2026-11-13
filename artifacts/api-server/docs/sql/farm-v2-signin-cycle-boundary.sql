-- Explicit cycle boundary: day 30 is claimable normally on day 30;
-- makeup applies only to earlier missed days and closes when day 30 ends.
create or replace function public.farm_v2_signin_cycle_summary(
 p_user_id text,p_cycle_number integer
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_raw_day integer;
 v_day integer;
 v_signed integer[];
 v_makeup integer[];
 v_earned integer;
 v_used integer;
 v_missing integer[];
begin
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_raw_day:=v_today-v_cycle.cycle_start_day+1;
 v_day:=greatest(0,least(30,v_raw_day));
 select coalesce(array_agg(cycle_day order by cycle_day),'{}'::integer[]),
        coalesce(array_agg(cycle_day order by cycle_day) filter(where is_makeup),'{}'::integer[]),
        count(*) filter(where is_makeup)::integer
 into v_signed,v_makeup,v_used
 from public.farm_v2_signin_days where user_id=p_user_id and cycle_number=p_cycle_number;
 select count(*)::integer into v_earned from public.farm_v2_signin_makeup_grants
 where user_id=p_user_id and cycle_number=p_cycle_number;
 select coalesce(array_agg(d order by d),'{}'::integer[]) into v_missing
 from pg_catalog.generate_series(1,30) d where not(d=any(v_signed));
 return jsonb_build_object(
 'status',case when v_raw_day<1 then 'not_started' when v_raw_day>30 then 'closed' else 'ready' end,
 'cycleNumber',p_cycle_number,'cycleDay',v_day,'cycleClosed',v_raw_day>30,
 'signedDays',to_jsonb(v_signed),'makeupDays',to_jsonb(v_makeup),
 'missingDays',to_jsonb(v_missing),
 'makeupCreditsAvailable',case when v_raw_day between 1 and 30 then greatest(0,v_earned-v_used) else 0 end,
 'makeupEligibleDays',case when v_raw_day between 2 and 30 then
 (select coalesce(to_jsonb(array_agg(d order by d)),'[]'::jsonb)
 from pg_catalog.generate_series(1,v_raw_day-1) d where d=any(v_missing))
 else '[]'::jsonb end,
 'perfectAttendanceReady',(coalesce(array_length(v_signed,1),0)=30 and v_cycle.perfect_reward_claimed_at is null),
 'perfectAttendanceClaimed',(v_cycle.perfect_reward_claimed_at is not null));
end; $$;
revoke all on function public.farm_v2_signin_cycle_summary(text,integer) from public,anon,authenticated;
