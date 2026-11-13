-- Atomic attendance + workshop material reward for material-only sign-in days.
-- Other rewards deliberately fail closed until their wallet/item issuance is implemented.
create or replace function public.farm_v2_signin_claim_material_day(
 p_user_id text, p_cycle_number integer, p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date := ((now() at time zone 'Asia/Taipei') - interval '5 hours')::date;
 v_day integer;
 v_material text;
 v_quantity integer;
 v_state jsonb;
 v_workshop jsonb;
 v_materials jsonb;
 v_old integer;
begin
 if p_cycle_day not in (2,6,11,16,21,24,29) then
   return jsonb_build_object('status','unsupported_reward');
 end if;
 v_material:=case when p_cycle_day in (6,16,24) then '九霄玉髓' else '蘊靈砂' end;
 v_quantity:=case p_cycle_day when 2 then 1 when 6 then 1 when 11 then 2 when 16 then 2 when 21 then 3 when 24 then 3 when 29 then 5 end;
 select * into v_cycle from public.farm_v2_signin_cycles
 where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_day:=v_today-v_cycle.cycle_start_day+1;
 if v_day<>p_cycle_day or v_day not between 1 and 30 then
   return jsonb_build_object('status','not_today');
 end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
   return jsonb_build_object('status','already_signed');
 end if;
 select warehouse_state into v_state from public.farm_v2_player_state
 where user_id=p_user_id for update;
 if not found then return jsonb_build_object('status','player_not_found'); end if;
 v_workshop:=v_state->'workshop';
 v_materials:=v_workshop->'materials';
 if jsonb_typeof(v_materials)<>'object' then
   return jsonb_build_object('status','invalid_inventory');
 end if;
 if v_materials ? v_material and jsonb_typeof(v_materials->v_material)<>'number' then
   return jsonb_build_object('status','invalid_inventory');
 end if;
 v_old:=coalesce((v_materials->>v_material)::integer,0);
 if v_old<0 or v_old>2147483647-v_quantity then
   return jsonb_build_object('status','invalid_inventory');
 end if;
 update public.farm_v2_player_state
 set warehouse_state=jsonb_set(v_state,array['workshop','materials',v_material],to_jsonb(v_old+v_quantity),true),
 updated_at=now()
 where user_id=p_user_id;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
 values(p_user_id,p_cycle_number,p_cycle_day,false);
 return jsonb_build_object('status','claimed','cycleDay',p_cycle_day,'item',v_material,'quantity',v_quantity);
end; $$;
revoke all on function public.farm_v2_signin_claim_material_day(text,integer,integer) from public,anon,authenticated;
