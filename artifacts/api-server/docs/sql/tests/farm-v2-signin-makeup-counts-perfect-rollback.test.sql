-- Regression: makeup days count toward the 30-day perfect attendance award.
-- The transaction rolls back all fixtures and wallet changes.
begin;
do $test$
declare
 v_user text;
 v_cycle integer:=995301;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_summary jsonb;
 v_award jsonb;
 v_pending integer;
begin
 select p.user_id into v_user from public.farm_v2_player_state p
 where public.farm_v2_resolve_verified_wallet_owner(p.user_id) is not null limit 1;
 if v_user is null then raise exception 'TEST_SETUP: no verified farm player'; end if;
 insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
 values(v_user,v_cycle,v_today-29);
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
 select v_user,v_cycle,d,(d=1) from pg_catalog.generate_series(1,30) d;
 v_summary:=public.farm_v2_signin_cycle_summary(v_user,v_cycle);
 if v_summary->>'perfectAttendanceReady'<>'true' then
   raise exception 'MAKEUP_NOT_COUNTED_IN_SUMMARY %',v_summary;
 end if;
 v_pending:=public.farm_v2_signin_pending_perfect_cycle(v_user);
 if v_pending is distinct from v_cycle then
   raise exception 'MAKEUP_NOT_COUNTED_IN_PENDING expected %, got %',v_cycle,v_pending;
 end if;
 v_award:=public.farm_v2_signin_claim_perfect(v_user,v_cycle);
 if v_award->>'status'<>'claimed' then
   raise exception 'MAKEUP_PERFECT_AWARD_FAILED %',v_award;
 end if;
 v_award:=public.farm_v2_signin_claim_perfect(v_user,v_cycle);
 if v_award->>'status'<>'already_claimed' then
   raise exception 'PERFECT_DUPLICATE_NOT_BLOCKED %',v_award;
 end if;
end;
$test$;
rollback;
