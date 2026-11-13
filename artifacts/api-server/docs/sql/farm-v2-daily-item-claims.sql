-- Trusted server-only daily rewards. Pot ownership is workshop.pots, never crops warehouse.
-- Lock the daily assignment row before checking points and updating inventory.
create or replace function public.farm_v2_claim_daily_item_reward(p_user_id text,p_milestone integer)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare d date; assigned record; v_state jsonb; v_workshop jsonb; v_pots jsonb;
 v_materials jsonb; v_points integer; v_reward uuid; v_species integer;
begin
 if p_milestone not in (60,100) then return jsonb_build_object('status','invalid_milestone'); end if;
 d:=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 select * into assigned from public.farm_v2_daily_activity_days
 where user_id=p_user_id and activity_day=d for update;
 if not found then return jsonb_build_object('status','not_initialized'); end if;
 if exists(select 1 from public.farm_v2_daily_activity_claims
  where user_id=p_user_id and activity_day=d and milestone=p_milestone)
 then return jsonb_build_object('status','already_claimed'); end if;
 v_points:=coalesce((public.farm_v2_daily_activity_summary(p_user_id)->>'points')::integer,0);
 if v_points<p_milestone then return jsonb_build_object('status','insufficient_points'); end if;
 select warehouse_state into v_state from public.farm_v2_player_state where user_id=p_user_id for update;
 if not found then return jsonb_build_object('status','player_not_found'); end if;
 if jsonb_typeof(v_state)<>'object' or jsonb_typeof(v_state->'workshop')<>'object'
 then raise exception 'INVALID_WORKSHOP_STATE'; end if;
 v_workshop:=v_state->'workshop';
 v_reward:=gen_random_uuid();
 if p_milestone=60 then
  v_pots:=v_workshop->'pots';
  if jsonb_typeof(v_pots)<>'array' then raise exception 'INVALID_POT_INVENTORY'; end if;
  v_species:=1+floor(random()*6)::integer;
  v_pots:=v_pots||jsonb_build_array(jsonb_build_object(
   'id',v_reward::text,'grade','黃','species',v_species,
   'displayed',false,'acquiredAt',floor(extract(epoch from now())*1000)::bigint));
  v_workshop:=jsonb_set(v_workshop,'{pots}',v_pots);
 else
  v_materials:=v_workshop->'materials';
  if jsonb_typeof(v_materials)<>'object'
   or jsonb_typeof(v_materials->'蘊靈砂')<>'number'
   or (v_materials->>'蘊靈砂')::integer<0 then raise exception 'INVALID_MATERIAL_INVENTORY'; end if;
  v_materials:=jsonb_set(v_materials,'{蘊靈砂}',to_jsonb((v_materials->>'蘊靈砂')::integer+1));
  v_workshop:=jsonb_set(v_workshop,'{materials}',v_materials);
 end if;
 update public.farm_v2_player_state
 set warehouse_state=jsonb_set(v_state,'{workshop}',v_workshop),updated_at=now()
 where user_id=p_user_id;
 insert into public.farm_v2_daily_activity_claims(user_id,activity_day,milestone,reward_transaction_id)
 values(p_user_id,d,p_milestone,v_reward);
 return jsonb_build_object('status','claimed','milestone',p_milestone,
  'rewardId',v_reward,'species',case when p_milestone=60 then v_species else null end);
end;
$$;
revoke all on function public.farm_v2_claim_daily_item_reward(text,integer) from public,anon,authenticated;
