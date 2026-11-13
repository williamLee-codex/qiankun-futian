-- End-to-end SQL dispatcher regression: all thirty daily reward paths, idempotency, rollback.
begin;
do $test$
declare
 v_user text;
 v_day integer;
 v_cycle integer;
 v_result jsonb;
 v_duplicate jsonb;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
begin
 select p.user_id into v_user from public.farm_v2_player_state p
 where public.farm_v2_resolve_verified_wallet_owner(p.user_id) is not null
   and jsonb_typeof(p.warehouse_state #> '{workshop,pots}')='array'
 limit 1;
 if v_user is null then raise exception 'TEST_SETUP: no verified player with workshop'; end if;
 for v_day in 1..30 loop
  v_cycle:=993000+v_day;
  insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
   values(v_user,v_cycle,v_today-(v_day-1));
  v_result:=public.farm_v2_signin_claim_day(v_user,v_cycle,v_day);
  if v_result->>'status'<>'claimed' then
   raise exception 'SIGNIN_DAY_FAILED day %, result %',v_day,v_result;
  end if;
  v_duplicate:=public.farm_v2_signin_claim_day(v_user,v_cycle,v_day);
  if v_duplicate->>'status'<>'already_signed' then
   raise exception 'SIGNIN_DUPLICATE_FAILED day %, result %',v_day,v_duplicate;
  end if;
  if (select count(*) from public.farm_v2_signin_days
      where user_id=v_user and cycle_number=v_cycle and cycle_day=v_day)<>1 then
   raise exception 'SIGNIN_LEDGER_COUNT_FAILED day %',v_day;
  end if;
 end loop;
end;
$test$;
rollback;
