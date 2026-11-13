-- All eleven functional-item makeup days, exact quantities and idempotency.
-- Every synthetic record is rolled back.
begin;
do $test$
declare
 v_user text;
 v_cycle integer:=992100;
 v_day integer;
 v_item text;
 v_quantity integer;
 v_before integer;
 v_after integer;
 v_first jsonb;
 v_second jsonb;
begin
 select user_id into v_user from public.farm_v2_player_state limit 1;
 if v_user is null then raise exception 'TEST_SETUP: no farm player'; end if;
 for v_day,v_item,v_quantity in
  select * from (values
   (3,'instant_harvest',1),(5,'double_harvest',1),
   (8,'farm_protection_1h',2),(9,'yellow_upgrade',1),
   (13,'instant_harvest',2),(14,'double_harvest',2),
   (18,'farm_protection_1h',3),(19,'mystic_upgrade',1),
   (23,'double_harvest',3),(26,'mystic_upgrade',1),
   (28,'farm_protection_1h',5)
  ) v(day_number,item_id,quantity)
 loop
  v_cycle:=v_cycle+1;
  insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
  values(v_user,v_cycle,(now() at time zone 'Asia/Taipei')::date-v_day);
  insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
  select v_user,v_cycle,x,false from pg_catalog.generate_series(1,v_day-1)x;
  insert into public.farm_v2_signin_makeup_grants(user_id,cycle_number,grant_day)
  values(v_user,v_cycle,3) on conflict do nothing;
  select coalesce(quantity,0) into v_before from public.farm_v2_consumable_balances
  where user_id=v_user and item_id=v_item;
  v_before:=coalesce(v_before,0);
  v_first:=public.farm_v2_signin_makeup_day(v_user,v_cycle,v_day);
  v_second:=public.farm_v2_signin_makeup_day(v_user,v_cycle,v_day);
  select quantity into v_after from public.farm_v2_consumable_balances
  where user_id=v_user and item_id=v_item;
  if v_first->>'status'<>'claimed'
   or v_second->>'status'<>'already_signed'
   or v_after<>v_before+v_quantity
  then raise exception 'MAKEUP_CONSUMABLE_FAILED day %, item %, first %, second %, before %, after %',
   v_day,v_item,v_first,v_second,v_before,v_after;
  end if;
 end loop;
end;
$test$;
rollback;
