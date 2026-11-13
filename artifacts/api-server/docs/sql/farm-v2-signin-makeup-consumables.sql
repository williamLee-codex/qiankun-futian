-- Atomic makeup issuance for all eleven functional-item sign-in days.
create or replace function public.farm_v2_signin_makeup_consumable_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_current integer;
 v_granted integer;
 v_used integer;
 v_item text;
 v_qty integer;
 v_receipt uuid;
begin
 v_item:=case when p_cycle_day in (3,13) then 'instant_harvest'
 when p_cycle_day in (5,14,23) then 'double_harvest'
 when p_cycle_day in (8,18,28) then 'farm_protection_1h'
 when p_cycle_day=9 then 'yellow_upgrade'
 when p_cycle_day in (19,26) then 'mystic_upgrade' end;
 v_qty:=case p_cycle_day when 3 then 1 when 5 then 1 when 8 then 2 when 9 then 1
 when 13 then 2 when 14 then 2 when 18 then 3 when 19 then 1 when 23 then 3
 when 26 then 1 when 28 then 5 end;
 if v_item is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_current:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date-v_cycle.cycle_start_day+1;
 if v_current not between 1 and 30 then return jsonb_build_object('status','cycle_inactive'); end if;
 if p_cycle_day>=v_current then return jsonb_build_object('status','not_past_day'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id
 and cycle_number=p_cycle_number and cycle_day=p_cycle_day)
 then return jsonb_build_object('status','already_signed'); end if;
 select count(*) into v_granted from public.farm_v2_signin_makeup_grants
 where user_id=p_user_id and cycle_number=p_cycle_number and grant_day<=v_current;
 select count(*) into v_used from public.farm_v2_signin_days
 where user_id=p_user_id and cycle_number=p_cycle_number and is_makeup;
 if v_used>=v_granted then return jsonb_build_object('status','no_makeup_credit'); end if;
 if exists(select 1 from pg_catalog.generate_series(1,p_cycle_day-1) d
 where not exists(select 1 from public.farm_v2_signin_days s
 where s.user_id=p_user_id and s.cycle_number=p_cycle_number and s.cycle_day=d))
 then return jsonb_build_object('status','earlier_day_missing'); end if;
 if not exists(select 1 from public.farm_v2_player_state where user_id=p_user_id)
 then return jsonb_build_object('status','player_not_found'); end if;
 insert into public.farm_v2_consumable_balances(user_id,item_id,quantity)
 values(p_user_id,v_item,0) on conflict do nothing;
 update public.farm_v2_consumable_balances set quantity=quantity+v_qty,updated_at=now()
 where user_id=p_user_id and item_id=v_item and quantity<=2147483647-v_qty;
 if not found then return jsonb_build_object('status','inventory_overflow'); end if;
 insert into public.farm_v2_consumable_ledger(user_id,item_id,quantity,source_type,source_key)
 values(p_user_id,v_item,v_qty,'signin_makeup',p_cycle_number::text||':'||p_cycle_day)
 returning id into v_receipt;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup,reward_transaction_id)
 values(p_user_id,p_cycle_number,p_cycle_day,true,v_receipt);
 return jsonb_build_object('status','claimed','isMakeup',true,'cycleDay',p_cycle_day,
 'item',v_item,'quantity',v_qty,'transactionId',v_receipt,
 'makeupCreditsRemaining',v_granted-v_used-1);
end; $$;
revoke all on function public.farm_v2_signin_makeup_consumable_day(text,integer,integer)
 from public,anon,authenticated;

-- Replace dispatcher in the same migration so all eleven item days are reachable.
create or replace function public.farm_v2_signin_makeup_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
begin
 if p_cycle_day in (1,4,7,12,17,22,27) then
  return public.farm_v2_signin_makeup_coin_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (2,6,11,16,21,24,29) then
  return public.farm_v2_signin_makeup_material_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (10,25) then
  return public.farm_v2_signin_makeup_crystal_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (15,20,30) then
  return public.farm_v2_signin_makeup_pot_day(p_user_id,p_cycle_number,p_cycle_day);
 elsif p_cycle_day in (3,5,8,9,13,14,18,19,23,26,28) then
  return public.farm_v2_signin_makeup_consumable_day(p_user_id,p_cycle_number,p_cycle_day);
 else return jsonb_build_object('status','unsupported_reward','cycleDay',p_cycle_day);
 end if;
end; $$;
revoke all on function public.farm_v2_signin_makeup_day(text,integer,integer)
 from public,anon,authenticated;
