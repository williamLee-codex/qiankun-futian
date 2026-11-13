-- Trusted server-side summary of six assigned tasks; no client points accepted.
-- Must be called by authenticated backend with canonical farm user ID.
create or replace function public.farm_v2_daily_activity_summary(p_user_id text)
returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare d date; ids text[]; t text; kind text; target_n integer; metric text; achieved integer; done_ids text[]:=array[]::text[]; pts integer; claimed integer[]; available integer[];
begin
 d:=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 select assigned_task_ids into ids from public.farm_v2_daily_activity_days
 where user_id=p_user_id and activity_day=d;
 if ids is null then return jsonb_build_object('initialized',false,'activityDay',d); end if;
 foreach t in array ids loop
  kind:=case when t like 'plant%' then 'plant' when t like 'harvest%' then 'harvest'
   when t like 'buy_seeds%' then 'buy_seeds' else
   case t when 'synthesize_pot' then 'synthesize_pot' when 'place_pot' then 'place_pot'
    when 'open_warehouse' then 'open_warehouse' when 'feed_pet' then 'feed_pet'
    when 'view_pet' then 'view_pet' when 'friend_interaction' then 'friend_interaction'
    when 'visit_friend' then 'visit_friend' end end;
  metric:=case when t like '%distinct_2' then 'distinct'
    when t in ('plant_5','plant_10','harvest_5','harvest_10','buy_seeds_5','buy_seeds_10') then 'quantity'
    else 'count' end;
  target_n:=case when t like '%_10' then 10 when t like '%_5' then 5 when metric='distinct' then 2 else 1 end;
  select case metric when 'distinct' then count(distinct species_id)::integer
    when 'quantity' then coalesce(sum(quantity),0)::integer
    else count(*)::integer end into achieved
  from public.farm_v2_daily_activity_events
  where user_id=p_user_id and activity_day=d and event_type=kind;
  if achieved>=target_n then done_ids:=array_append(done_ids,t); end if;
 end loop;
 pts:=cardinality(done_ids)*20;
 select coalesce(array_agg(milestone),array[]::integer[]) into claimed
 from public.farm_v2_daily_activity_claims where user_id=p_user_id and activity_day=d;
 select coalesce(array_agg(m),array[]::integer[]) into available
 from unnest(array[30,60,100]) m where m<=pts and not(m=any(claimed));
 return jsonb_build_object('initialized',true,'activityDay',d,'assignedTaskIds',ids,
  'completedTaskIds',done_ids,'points',pts,'claimedMilestones',claimed,'claimableMilestones',available);
end;
$$;
revoke all on function public.farm_v2_daily_activity_summary(text) from public,anon,authenticated;
