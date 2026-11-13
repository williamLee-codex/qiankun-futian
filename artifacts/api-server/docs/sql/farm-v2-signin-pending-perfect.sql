-- Select an already-completed, unclaimed attendance cycle for perfect award.
-- Prevents losing the award when day 31 initializes the next cycle.
-- The trusted server uses this only for the perfect-award action.
create or replace function public.farm_v2_signin_pending_perfect_cycle(p_user_id text)
returns integer language sql stable security invoker set search_path='' as $$
 select c.cycle_number from public.farm_v2_signin_cycles c
 where c.user_id=p_user_id and c.perfect_reward_claimed_at is null
 and (select count(*) from public.farm_v2_signin_days d
      where d.user_id=c.user_id and d.cycle_number=c.cycle_number and d.is_makeup=false)=30
 and not exists (select 1 from public.farm_v2_signin_days m
 where m.user_id=c.user_id and m.cycle_number=c.cycle_number and m.is_makeup=true)
 order by c.cycle_number asc limit 1;
$$;
revoke all on function public.farm_v2_signin_pending_perfect_cycle(text)
 from public,anon,authenticated;
