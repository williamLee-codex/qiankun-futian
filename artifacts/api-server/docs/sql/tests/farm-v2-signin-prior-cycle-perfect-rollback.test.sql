-- Regression: an unclaimed perfect-attendance award survives the next 30-day cycle.
-- Makeup counts as attendance; claiming the prior award is idempotent.
begin;
do $test$
declare
 v_user text;
 v_old integer:=995401;
 v_new integer:=995402;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_pending integer;
 v_award jsonb;
 v_summary jsonb;
begin
 select p.user_id into v_user from public.farm_v2_player_state p
 where public.farm_v2_resolve_verified_wallet_owner(p.user_id) is not null limit 1;
 if v_user is null then raise exception 'TEST_SETUP: no verified farm player'; end if;
 insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
 values(v_user,v_old,v_today-30),(v_user,v_new,v_today);
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
 select v_user,v_old,d,(d=1) from pg_catalog.generate_series(1,30) d;
 v_pending:=public.farm_v2_signin_pending_perfect_cycle(v_user);
 if v_pending is distinct from v_old then
   raise exception 'PRIOR_CYCLE_AWARD_LOST expected %, got %',v_old,v_pending;
 end if;
 v_summary:=public.farm_v2_signin_status(v_user);
 if (v_summary->>'cycleNumber')::integer<>v_new then
   raise exception 'NEW_CYCLE_NOT_ACTIVE %',v_summary;
 end if;
 v_award:=public.farm_v2_signin_claim_perfect(v_user,v_pending);
 if v_award->>'status'<>'claimed' then
   raise exception 'PRIOR_CYCLE_CLAIM_FAILED %',v_award;
 end if;
 v_award:=public.farm_v2_signin_claim_perfect(v_user,v_old);
 if v_award->>'status'<>'already_claimed' then
   raise exception 'PRIOR_CYCLE_DOUBLE_CLAIM %',v_award;
 end if;
 if public.farm_v2_signin_pending_perfect_cycle(v_user)=v_old then
   raise exception 'CLAIMED_CYCLE_STILL_PENDING';
 end if;
end;
$test$;
rollback;
