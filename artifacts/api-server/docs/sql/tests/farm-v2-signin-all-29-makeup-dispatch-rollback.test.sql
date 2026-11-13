-- Test all 29 makeup-eligible days through the actual dispatcher, rollback all rewards.
begin;
do $test$
declare
 v_user text;
 v_day integer;
 v_cycle integer;
 v_first jsonb;
 v_again jsonb;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
begin
 select p.user_id into v_user from public.farm_v2_player_state p
 where public.farm_v2_resolve_verified_wallet_owner(p.user_id) is not null
 and jsonb_typeof(p.warehouse_state #> '{workshop,pots}')='array' limit 1;
 if v_user is null then raise exception 'TEST_SETUP: no verified player with workshop'; end if;
 for v_day in 1..29 loop
  v_cycle:=994000+v_day;
  insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
  values(v_user,v_cycle,v_today-v_day);
  insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
  select v_user,v_cycle,d,false from pg_catalog.generate_series(1,v_day-1)d;
  insert into public.farm_v2_signin_makeup_grants(user_id,cycle_number,grant_day)
  values(v_user,v_cycle,3);
  v_first:=public.farm_v2_signin_makeup_day(v_user,v_cycle,v_day);
  if v_first->>'status'<>'claimed' then
   raise exception 'MAKEUP_FAILED day %, response %',v_day,v_first;
  end if;
  v_again:=public.farm_v2_signin_makeup_day(v_user,v_cycle,v_day);
  if v_again->>'status'<>'already_signed' then
   raise exception 'MAKEUP_DUPLICATE_FAILED day %, response %',v_day,v_again;
  end if;
  if (select count(*) from public.farm_v2_signin_days
      where user_id=v_user and cycle_number=v_cycle and cycle_day=v_day and is_makeup)<>1
  then raise exception 'MAKEUP_LEDGER_FAILED day %',v_day; end if;
 end loop;
end;
$test$;
rollback;
