-- Makeup for material-reward days only. Counts toward perfect attendance.
-- Credits are earned on days 3,6,...30; makeup must target a past day.
create or replace function public.farm_v2_signin_makeup_material_day(
 p_user_id text,p_cycle_number integer,p_cycle_day integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_cycle public.farm_v2_signin_cycles%rowtype;
 v_today date:=(now() at time zone 'Asia/Taipei')::date;
 v_current integer;
 v_granted integer;
 v_used integer;
 v_material text;
 v_qty integer;
 v_state jsonb;
 v_materials jsonb;
 v_old integer;
begin
 v_material:=case when p_cycle_day in (6,16,24) then '九霄玉髓'
  when p_cycle_day in (2,11,21,29) then '蘊靈砂' else null end;
 v_qty:=case p_cycle_day when 2 then 1 when 6 then 1 when 11 then 2
  when 16 then 2 when 21 then 3 when 24 then 3 when 29 then 5 end;
 if v_material is null then return jsonb_build_object('status','unsupported_reward'); end if;
 select * into v_cycle from public.farm_v2_signin_cycles
  where user_id=p_user_id and cycle_number=p_cycle_number for update;
 if not found then return jsonb_build_object('status','cycle_not_found'); end if;
 v_current:=v_today-v_cycle.cycle_start_day+1;
 if v_current not between 1 and 30 then return jsonb_build_object('status','cycle_inactive'); end if;
 if p_cycle_day>=v_current then return jsonb_build_object('status','not_past_day'); end if;
 if exists(select 1 from public.farm_v2_signin_days where user_id=p_user_id
  and cycle_number=p_cycle_number and cycle_day=p_cycle_day) then
  return jsonb_build_object('status','already_signed'); end if;
 select count(*) into v_granted from public.farm_v2_signin_makeup_grants
  where user_id=p_user_id and cycle_number=p_cycle_number and grant_day<=v_current;
 select count(*) into v_used from public.farm_v2_signin_days
  where user_id=p_user_id and cycle_number=p_cycle_number and is_makeup;
 if v_used>=v_granted then return jsonb_build_object('status','no_makeup_credit'); end if;
 -- Prevent skipping an earlier missed date; signed earlier dates need not be made up.
 if exists(select 1 from pg_catalog.generate_series(1,p_cycle_day-1) as d
  where not exists(select 1 from public.farm_v2_signin_days s
   where s.user_id=p_user_id and s.cycle_number=p_cycle_number and s.cycle_day=d)) then
  return jsonb_build_object('status','earlier_day_missing'); end if;
 select warehouse_state into v_state from public.farm_v2_player_state where user_id=p_user_id for update;
 if not found then return jsonb_build_object('status','player_not_found'); end if;
 v_materials:=v_state#>'{workshop,materials}';
 if jsonb_typeof(v_materials)<>'object' or
  (v_materials ? v_material and jsonb_typeof(v_materials->v_material)<>'number') then
  return jsonb_build_object('status','invalid_inventory'); end if;
 v_old:=coalesce((v_materials->>v_material)::integer,0);
 if v_old<0 or v_old>2147483647-v_qty then return jsonb_build_object('status','invalid_inventory'); end if;
 update public.farm_v2_player_state
 set warehouse_state=jsonb_set(v_state,array['workshop','materials',v_material],to_jsonb(v_old+v_qty),true),
 updated_at=now() where user_id=p_user_id;
 insert into public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
 values(p_user_id,p_cycle_number,p_cycle_day,true);
 return jsonb_build_object('status','claimed','isMakeup',true,'cycleDay',p_cycle_day,
  'item',v_material,'quantity',v_qty,'makeupCreditsRemaining',v_granted-v_used-1);
end; $$;
revoke all on function public.farm_v2_signin_makeup_material_day(text,integer,integer) from public,anon,authenticated;
