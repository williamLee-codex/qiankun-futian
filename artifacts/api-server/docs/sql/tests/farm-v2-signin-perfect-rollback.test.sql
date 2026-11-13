-- Isolated DB regression. Entire transaction MUST roll back.
begin;
do $test$
declare
 v_user text;
 v_owner uuid;
 v_before_coin integer;
 v_before_crystal integer;
 v_before_sand integer;
 v_before_jade integer;
 v_after_coin integer;
 v_after_crystal integer;
 v_after_sand integer;
 v_after_jade integer;
 v_first jsonb;
 v_second jsonb;
 v_incomplete jsonb;
 v_cycle integer:=987103;
begin
 select p.user_id,public.farm_v2_resolve_verified_wallet_owner(p.user_id)
 into v_user,v_owner
 from public.farm_v2_player_state p
 where public.farm_v2_resolve_verified_wallet_owner(p.user_id) is not null limit 1;
 if v_owner is null then raise exception 'TEST_SETUP: no verified player'; end if;
 insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
 values(v_user,v_cycle,(now() at time zone 'Asia/Taipei' - interval '5 hours')::date-29);
 v_incomplete:=public.farm_v2_signin_claim_perfect(v_user,v_cycle);
 if v_incomplete->>'status'<>'incomplete' then raise exception 'incomplete award granted'; end if;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
 select v_user,v_cycle,d,(d=2) from pg_catalog.generate_series(1,30) d;
 select coin_balance,crystal_balance into v_before_coin,v_before_crystal
 from public.core_wallets where owner_id=v_owner;
 select coalesce((warehouse_state#>>'{workshop,materials,蘊靈砂}')::integer,0),
 coalesce((warehouse_state#>>'{workshop,materials,九霄玉髓}')::integer,0)
 into v_before_sand,v_before_jade from public.farm_v2_player_state where user_id=v_user;
 v_first:=public.farm_v2_signin_claim_perfect(v_user,v_cycle);
 v_second:=public.farm_v2_signin_claim_perfect(v_user,v_cycle);
 select coin_balance,crystal_balance into v_after_coin,v_after_crystal
 from public.core_wallets where owner_id=v_owner;
 select coalesce((warehouse_state#>>'{workshop,materials,蘊靈砂}')::integer,0),
 coalesce((warehouse_state#>>'{workshop,materials,九霄玉髓}')::integer,0)
 into v_after_sand,v_after_jade from public.farm_v2_player_state where user_id=v_user;
 if v_first->>'status'<>'claimed' or v_second->>'status'<>'already_claimed'
 or v_after_coin<>v_before_coin+200 or v_after_crystal<>v_before_crystal+3
 or v_after_sand<>v_before_sand+2 or v_after_jade<>v_before_jade+2
 or not exists(select 1 from public.farm_v2_signin_perfect_badges
 where user_id=v_user and cycle_number=v_cycle)
 or not exists(select 1 from public.farm_v2_signin_days
 where user_id=v_user and cycle_number=v_cycle and cycle_day=2 and is_makeup)
 then raise exception 'perfect attendance regression: % %',v_first,v_second; end if;
end;
$test$;
rollback;
