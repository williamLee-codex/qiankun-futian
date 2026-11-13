-- Atomic reward issuance, replay protection, and rollback for both item milestones.
begin;
do $$
declare u text; d date; a jsonb; b jsonb; c jsonb; e jsonb;
 before_state jsonb; after_state jsonb; n int; pot jsonb;
begin
 select user_id into u from public.farm_v2_player_state
 where jsonb_typeof(warehouse_state->'workshop'->'pots')='array'
 and jsonb_typeof(warehouse_state->'workshop'->'materials'->'蘊靈砂')='number'
 order by user_id limit 1;
 if u is null then raise exception 'NO_VALID_PLAYER'; end if;
 d:=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 insert into public.farm_v2_daily_activity_days(user_id,activity_day,assigned_task_ids,eligibility_snapshot)
 values(u,d,array['plant_once','plant_5','harvest_5','buy_seeds_once','buy_seeds_5','open_warehouse'],'{}'::jsonb)
 on conflict(user_id,activity_day) do nothing;
 select warehouse_state into before_state from public.farm_v2_player_state where user_id=u;
 insert into public.farm_v2_daily_activity_events(user_id,activity_day,transaction_id,event_type,quantity,occurred_at)
 values(u,d,'daily-item-positive-plant','plant',10,now()),
 (u,d,'daily-item-positive-harvest','harvest',10,now()),
 (u,d,'daily-item-positive-buy','buy_seeds',10,now()),
 (u,d,'daily-item-positive-warehouse','open_warehouse',1,now());
 a:=public.farm_v2_claim_daily_item_reward(u,60);
 b:=public.farm_v2_claim_daily_item_reward(u,60);
 c:=public.farm_v2_claim_daily_item_reward(u,100);
 e:=public.farm_v2_claim_daily_item_reward(u,100);
 if a->>'status'<>'claimed' or b->>'status'<>'already_claimed'
 or c->>'status'<>'claimed' or e->>'status'<>'already_claimed'
 then raise exception 'BAD_CLAIM_RESULTS % % % %',a,b,c,e; end if;
 select warehouse_state into after_state from public.farm_v2_player_state where user_id=u;
 if jsonb_array_length(after_state->'workshop'->'pots')<>jsonb_array_length(before_state->'workshop'->'pots')+1
 or (after_state->'workshop'->'materials'->>'蘊靈砂')::integer<>(before_state->'workshop'->'materials'->>'蘊靈砂')::integer+1
 then raise exception 'BAD_INVENTORY_DELTA'; end if;
 pot:=after_state->'workshop'->'pots'->-1;
 if pot->>'grade'<>'黃' or pot->>'id'<>a->>'rewardId'
 or (pot->>'species')::integer not between 1 and 6
 then raise exception 'BAD_POT_REWARD %',pot; end if;
 select count(*) into n from public.farm_v2_daily_activity_claims
 where user_id=u and activity_day=d and milestone in (60,100);
 if n<>2 then raise exception 'BAD_CLAIM_COUNT %',n; end if;
end $$;
rollback;
