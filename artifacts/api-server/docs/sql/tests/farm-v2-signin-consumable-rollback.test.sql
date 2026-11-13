-- Sign-in functional-item credit: one grant only, no permanent test data.
begin;
do $test$
declare
 v_user text;
 v_cycle integer:=990103;
 v_before integer;
 v_after integer;
 v_first jsonb;
 v_duplicate jsonb;
begin
 select user_id into v_user from public.farm_v2_player_state limit 1;
 if v_user is null then raise exception 'TEST_SETUP: no farm player'; end if;
 insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
 values(v_user,v_cycle,(now() at time zone 'Asia/Taipei')::date-2);
 select coalesce(quantity,0) into v_before from public.farm_v2_consumable_balances
 where user_id=v_user and item_id='instant_harvest';
 v_before:=coalesce(v_before,0);
 v_first:=public.farm_v2_signin_claim_day(v_user,v_cycle,3);
 v_duplicate:=public.farm_v2_signin_claim_day(v_user,v_cycle,3);
 select quantity into v_after from public.farm_v2_consumable_balances
 where user_id=v_user and item_id='instant_harvest';
 if v_first->>'status'<>'claimed'
 or v_duplicate->>'status'<>'already_signed'
 or v_after<>v_before+1
 or (select count(*) from public.farm_v2_consumable_ledger
     where user_id=v_user and source_type='signin' and source_key=v_cycle::text||':3')<>1
 then raise exception 'SIGNIN_CONSUMABLE_REGRESSION: % % % %',
  v_first,v_duplicate,v_before,v_after;
 end if;
end;
$test$;
rollback;
