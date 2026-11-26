-- Day-one makeup becomes available only after the day-three grant; no permanent data.
begin;
do $test$
declare
 v_user text;
 v_cycle integer:=995101;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_init jsonb;
 v_first jsonb;
 v_again jsonb;
 v_before integer;
 v_after integer;
begin
 select p.user_id into v_user from public.farm_v2_player_state p
 where public.farm_v2_resolve_verified_wallet_owner(p.user_id) is not null limit 1;
 if v_user is null then raise exception 'TEST_SETUP: no verified farm player'; end if;
 insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
 values(v_user,v_cycle,v_today-2);
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
 values(v_user,v_cycle,2,false);
 v_init:=public.farm_v2_signin_initialize(v_user);
 if v_init->>'status'<>'ready' then raise exception 'INIT_FAILED %',v_init; end if;
 if not exists(select 1 from public.farm_v2_signin_makeup_grants
   where user_id=v_user and cycle_number=v_cycle and grant_day=3)
 then raise exception 'DAY3_CREDIT_NOT_GRANTED'; end if;
 select coalesce(w.coin_balance,0) into v_before
 from public.core_wallets w
 where w.owner_id=public.farm_v2_resolve_verified_wallet_owner(v_user);
 v_first:=public.farm_v2_signin_makeup_day(v_user,v_cycle,1);
 v_again:=public.farm_v2_signin_makeup_day(v_user,v_cycle,1);
 if v_first->>'status'<>'claimed' or v_again->>'status'<>'already_signed'
 then raise exception 'DAY1_MAKEUP_FAILED first %, again %',v_first,v_again; end if;
 select coalesce(w.coin_balance,0) into v_after from public.core_wallets w
 where w.owner_id=public.farm_v2_resolve_verified_wallet_owner(v_user);
 if v_after<>v_before+10 then
 raise exception 'DAY1_COIN_AMOUNT_FAILED before %, after %',v_before,v_after; end if;
end;
$test$;
rollback;
