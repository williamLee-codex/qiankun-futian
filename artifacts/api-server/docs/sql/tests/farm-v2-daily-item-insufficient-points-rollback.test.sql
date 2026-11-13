-- Both item reward milestones must reject a player without sufficient points.
-- No inventory mutation or claim row may occur; all synthetic state rolls back.
begin;
do $$
declare u text; d date; a jsonb; b jsonb; before_state jsonb; after_state jsonb; n int;
begin
 select user_id into u from public.farm_v2_player_state
 where jsonb_typeof(warehouse_state->'workshop'->'pots')='array'
 order by user_id limit 1;
 if u is null then raise exception 'NO_PLAYER'; end if;
 d:=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 insert into public.farm_v2_daily_activity_days(user_id,activity_day,assigned_task_ids,eligibility_snapshot)
 values(u,d,array['plant_once','plant_5','harvest_5','buy_seeds_once','buy_seeds_5','open_warehouse'],'{}'::jsonb)
 on conflict(user_id,activity_day) do nothing;
 select warehouse_state into before_state from public.farm_v2_player_state where user_id=u;
 a:=public.farm_v2_claim_daily_item_reward(u,60);
 b:=public.farm_v2_claim_daily_item_reward(u,100);
 if a->>'status'<>'insufficient_points' or b->>'status'<>'insufficient_points'
 then raise exception 'BAD_STATUS % %',a,b; end if;
 select warehouse_state into after_state from public.farm_v2_player_state where user_id=u;
 if after_state is distinct from before_state then raise exception 'UNAUTHORIZED_INVENTORY_CHANGE'; end if;
 select count(*) into n from public.farm_v2_daily_activity_claims
 where user_id=u and activity_day=d and milestone in (60,100);
 if n<>0 then raise exception 'UNAUTHORIZED_CLAIMS %',n; end if;
end $$;
rollback;
