-- Isolated 30-point coin award integration test.
-- Uses a mapped farm user; ALL inserted events, wallet credits and claims rollback.
begin;
do $$
declare u text; d date; a jsonb; b jsonb; before_coins integer; after_coins integer; n integer;
begin
 select p.user_id into u from public.farm_v2_player_state p
 join auth.users au on au.id::text=p.user_id
 join core.users cu on cu.auth_user_id=au.id
 order by p.user_id limit 1;
 if u is null then raise exception 'NO_MAPPED_FARM_PLAYER'; end if;
 d:=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 insert into public.farm_v2_daily_activity_days(user_id,activity_day,assigned_task_ids,eligibility_snapshot)
 values(u,d,array['plant_once','plant_5','harvest_5','buy_seeds_once','buy_seeds_5','open_warehouse'],'{}'::jsonb)
 on conflict(user_id,activity_day) do nothing;
 if not exists(
  select 1 from public.farm_v2_daily_activity_days
  where user_id=u and activity_day=d and 'plant_once'=any(assigned_task_ids) and 'plant_5'=any(assigned_task_ids)
 ) then raise exception 'TODAY_ASSIGNMENT_CONFLICT'; end if;
 insert into public.farm_v2_daily_activity_events(user_id,activity_day,transaction_id,event_type,quantity,species_id)
 values(u,d,'rollback-daily-coin-e2e-20261113','plant',10,'1')
 on conflict(user_id,transaction_id) do nothing;
 select coin_balance into before_coins from public.core_wallets where owner_id=u::uuid;
 a:=public.farm_v2_claim_daily_coin_reward(u);
 b:=public.farm_v2_claim_daily_coin_reward(u);
 select coin_balance into after_coins from public.core_wallets where owner_id=u::uuid;
 if a->>'status'<>'claimed' or b->>'status'<>'already_claimed'
 then raise exception 'CLAIM_STATUSES: % / %',a,b; end if;
 if after_coins<>before_coins+10 then
  raise exception 'BALANCE_MISMATCH % %',before_coins,after_coins;
 end if;
 select count(*) into n from public.farm_v2_daily_activity_claims
 where user_id=u and activity_day=d and milestone=30;
 if n<>1 then raise exception 'CLAIM_DUPLICATED'; end if;
end $$;
rollback;
