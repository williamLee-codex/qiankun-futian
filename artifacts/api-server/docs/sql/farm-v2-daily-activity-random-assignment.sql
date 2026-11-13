-- Trusted backend only. Eligibility must come from authoritative server state.
-- Random six tasks, compatible with database canonical validator; persist once
-- per Taipei 05:00 day via farm_v2_initialize_daily_activity.
create or replace function public.farm_v2_assign_random_daily_tasks(
 p_user_id text, p_eligibility jsonb
) returns text[]
language plpgsql security invoker set search_path = ''
as $$
declare
 pool text[] := array['plant_once','buy_seeds_5','plant_5','plant_10','harvest_5','harvest_10','buy_seeds_once','buy_seeds_10','synthesize_pot','place_pot','open_warehouse','feed_pet','view_pet','friend_interaction','visit_friend','plant_distinct_2','harvest_distinct_2'];
 candidates text[]; picked text[]; attempt integer;
begin
 if p_user_id is null or length(trim(p_user_id))=0 then raise exception 'INVALID_USER_ID'; end if;
 if p_eligibility is null then raise exception 'MISSING_SERVER_ELIGIBILITY'; end if;
 select array_agg(t order by ord) into candidates
 from unnest(pool) with ordinality as x(t,ord)
 where (t not in ('feed_pet','view_pet') or coalesce((p_eligibility->>'pets')::boolean,false))
 and (t not in ('friend_interaction','visit_friend') or coalesce((p_eligibility->>'friends')::boolean,false))
 and (t<>'synthesize_pot' or coalesce((p_eligibility->>'synthesis')::boolean,false))
 and (t<>'place_pot' or coalesce((p_eligibility->>'pots')::boolean,false))
 and (t<>'plant_distinct_2' or coalesce((p_eligibility->>'availablePlantSpecies')::integer,0)>=2)
 and (t<>'harvest_distinct_2' or coalesce((p_eligibility->>'availableHarvestSpecies')::integer,0)>=2);
 if cardinality(candidates)<6 then raise exception 'INSUFFICIENT_ELIGIBLE_DAILY_TASKS'; end if;
 for attempt in 1..1000 loop
  select array_agg(t) into picked from (
   select t from unnest(candidates) as x(t) order by random() limit 6
  ) shuffled;
  if public.farm_v2_valid_daily_task_assignment(picked) then
   return public.farm_v2_initialize_daily_activity(p_user_id,picked,p_eligibility);
  end if;
 end loop;
 raise exception 'DAILY_TASK_RANDOM_SELECTION_FAILED';
end;
$$;
revoke all on function public.farm_v2_assign_random_daily_tasks(text,jsonb) from public,anon,authenticated;
