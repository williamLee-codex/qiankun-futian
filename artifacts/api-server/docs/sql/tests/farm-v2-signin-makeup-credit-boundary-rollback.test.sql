-- Day-2 makeup must be denied without credit; day-3 grant unlocks day-1 makeup.
-- Day-30 makeup is unavailable in current cycle rules. Roll back all fixtures.
begin;
do $test$
declare
 v_user text;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_cycle integer:=995201;
 v_result jsonb;
 v_status jsonb;
begin
 select p.user_id into v_user from public.farm_v2_player_state p
 where public.farm_v2_resolve_verified_wallet_owner(p.user_id) is not null limit 1;
 if v_user is null then raise exception 'TEST_SETUP: no verified player'; end if;
 insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
 values(v_user,v_cycle,v_today-1);
 v_result:=public.farm_v2_signin_initialize(v_user);
 if v_result->>'status'<>'ready' then raise exception 'INIT_DAY2_FAILED %',v_result; end if;
 v_result:=public.farm_v2_signin_makeup_day(v_user,v_cycle,1);
 if v_result->>'status'<>'no_makeup_credit' then
 raise exception 'DAY2_MAKEUP_SHOULD_BE_DENIED %',v_result; end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=v_user and cycle_number=v_cycle)
 then raise exception 'DAY2_DENIAL_CREATED_SIGNIN'; end if;
 -- Advance only this synthetic cycle to day 3, retaining the same owner and cycle.
 update public.farm_v2_signin_cycles set cycle_start_day=v_today-2
 where user_id=v_user and cycle_number=v_cycle;
 v_result:=public.farm_v2_signin_initialize(v_user);
 if v_result->>'status'<>'ready' then raise exception 'INIT_DAY3_FAILED %',v_result; end if;
 v_status:=public.farm_v2_signin_status(v_user);
 if v_status->>'makeupClaimable'<>'true' or (v_status->>'nextMakeupDay')::int<>1
 then raise exception 'DAY3_STATUS_FAILED %',v_status; end if;
 v_result:=public.farm_v2_signin_makeup_day(v_user,v_cycle,1);
 if v_result->>'status'<>'claimed' then raise exception 'DAY3_MAKEUP_FAILED %',v_result; end if;
 v_result:=public.farm_v2_signin_makeup_day(v_user,v_cycle,1);
 if v_result->>'status'<>'already_signed' then raise exception 'DAY3_DUPLICATE_FAILED %',v_result; end if;
end;
$test$;
rollback;
