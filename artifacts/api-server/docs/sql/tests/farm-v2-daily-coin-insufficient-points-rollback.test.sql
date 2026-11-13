-- Insufficient daily points must not create a claim or credit the wallet.
-- Run in isolated Supabase; all changes rollback.
begin;
do $$
declare u text; d date; result jsonb; before_count int; after_count int; before_balance int; after_balance int;
begin
 select p.user_id into u from public.farm_v2_player_state p
 join auth.users a on a.id::text=p.user_id
 join core.users c on c.auth_user_id=a.id
 order by p.user_id limit 1;
 if u is null then raise exception 'NO_MAPPED_PLAYER'; end if;
 d:=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 insert into public.farm_v2_daily_activity_days(user_id,activity_day,assigned_task_ids,eligibility_snapshot)
 values(u,d,array['plant_once','plant_5','harvest_5','buy_seeds_once','buy_seeds_5','open_warehouse'],'{}'::jsonb)
 on conflict(user_id,activity_day) do nothing;
 select count(*) into before_count from public.farm_v2_daily_activity_claims
 where user_id=u and activity_day=d and milestone=30;
 select coin_balance into before_balance from public.core_wallets where owner_id=u::uuid;
 result:=public.farm_v2_claim_daily_coin_reward(u);
 if result->>'status'<>'insufficient_points' then raise exception 'UNEXPECTED_STATUS: %',result; end if;
 select count(*) into after_count from public.farm_v2_daily_activity_claims
 where user_id=u and activity_day=d and milestone=30;
 select coin_balance into after_balance from public.core_wallets where owner_id=u::uuid;
 if after_count<>before_count or after_balance<>before_balance then raise exception 'UNAUTHORIZED_REWARD_MUTATION'; end if;
end $$;
rollback;
