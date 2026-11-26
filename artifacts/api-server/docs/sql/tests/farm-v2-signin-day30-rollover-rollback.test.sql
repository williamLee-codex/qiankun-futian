-- Day 30 can be claimed on time, day 31 opens a new cycle.
-- Day-30 makeup is not available after rollover under current rules.
-- Every fixture and reward is rolled back.
begin;
do $test$
declare
 v_user text;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_old integer:=995601;
 v_result jsonb;
 v_status jsonb;
begin
 select p.user_id into v_user from public.farm_v2_player_state p
 where public.farm_v2_resolve_verified_wallet_owner(p.user_id) is not null limit 1;
 if v_user is null then raise exception 'TEST_SETUP: no verified player'; end if;
 insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
 values(v_user,v_old,v_today-29);
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
 select v_user,v_old,d,false from pg_catalog.generate_series(1,29) d;
 v_result:=public.farm_v2_signin_initialize(v_user);
 if v_result->>'status'<>'ready' or (v_result->>'cycleDay')::integer<>30 then
  raise exception 'DAY30_INITIALIZE_FAILED %',v_result; end if;
 v_status:=public.farm_v2_signin_status(v_user);
 if v_status->>'todayClaimable'<>'true' or (v_status->>'todayClaimDay')::integer<>30 then
  raise exception 'DAY30_NOT_CLAIMABLE %',v_status; end if;
 v_result:=public.farm_v2_signin_claim_day(v_user,v_old,30);
 if v_result->>'status'<>'claimed' then raise exception 'DAY30_CLAIM_FAILED %',v_result; end if;
 v_result:=public.farm_v2_signin_claim_day(v_user,v_old,30);
 if v_result->>'status'<>'already_signed' then
  raise exception 'DAY30_DUPLICATE_NOT_REJECTED %',v_result; end if;
 if public.farm_v2_signin_pending_perfect_cycle(v_user) is distinct from v_old then
  raise exception 'DAY30_PERFECT_NOT_READY'; end if;
 -- Simulate the boundary by moving this synthetic cycle's start back one day.
 update public.farm_v2_signin_cycles set cycle_start_day=v_today-30
 where user_id=v_user and cycle_number=v_old;
 v_result:=public.farm_v2_signin_initialize(v_user);
 if (v_result->>'cycleNumber')::integer<>v_old+1
 or (v_result->>'cycleDay')::integer<>1 then
  raise exception 'DAY31_ROLLOVER_FAILED %',v_result; end if;
 if public.farm_v2_signin_pending_perfect_cycle(v_user) is distinct from v_old then
  raise exception 'PREVIOUS_PERFECT_LOST_ON_ROLLOVER'; end if;
 v_result:=public.farm_v2_signin_makeup_day(v_user,v_old,30);
 if v_result->>'status'='claimed' then
  raise exception 'CLOSED_CYCLE_MAKEUP_WAS_ALLOWED'; end if;
end;
$test$;
rollback;
