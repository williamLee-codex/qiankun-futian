-- Transactional sign-in cycle state reader. Does not create cycles or issue rewards.
-- Uses the persisted cycle start date, never the calendar month or client day.
create or replace function public.farm_v2_signin_cycle_summary(
  p_user_id text,
  p_cycle_number integer
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  v_cycle public.farm_v2_signin_cycles%rowtype;
  v_today date := (now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
  v_day integer;
  v_signed integer[];
  v_makeup integer[];
  v_earned integer;
  v_used integer;
begin
  select * into v_cycle from public.farm_v2_signin_cycles
  where user_id=p_user_id and cycle_number=p_cycle_number;
  if not found then return jsonb_build_object('status','cycle_not_found'); end if;
  v_day := greatest(0, least(30, v_today-v_cycle.cycle_start_day+1));
  select coalesce(array_agg(cycle_day order by cycle_day),'{}'::integer[]),
         coalesce(array_agg(cycle_day order by cycle_day) filter(where is_makeup),'{}'::integer[]),
         count(*) filter(where is_makeup)::integer
    into v_signed,v_makeup,v_used
    from public.farm_v2_signin_days
   where user_id=p_user_id and cycle_number=p_cycle_number;
  select count(*)::integer into v_earned
    from public.farm_v2_signin_makeup_grants
   where user_id=p_user_id and cycle_number=p_cycle_number;
  return jsonb_build_object(
    'status','ready','cycleNumber',p_cycle_number,'cycleDay',v_day,
    'signedDays',to_jsonb(v_signed),'makeupDays',to_jsonb(v_makeup),
    'makeupCreditsAvailable',greatest(0,v_earned-v_used),
    'perfectAttendanceReady',(coalesce(array_length(v_signed,1),0)=30 and coalesce(array_length(v_makeup,1),0)=0 and v_cycle.perfect_reward_claimed_at is null),
    'perfectAttendanceClaimed',(v_cycle.perfect_reward_claimed_at is not null)
  );
end;
$$;
revoke all on function public.farm_v2_signin_cycle_summary(text,integer) from public,anon,authenticated;
