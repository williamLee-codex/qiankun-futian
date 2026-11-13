-- Trusted server RPC: initializes daily tasks on first authenticated read.
-- Uses only persisted farm state; never accepts browser eligibility.
create or replace function public.farm_v2_initialize_daily_activity_for_verified_user(p_user_id text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare s record; eligibility jsonb; tasks text[];
begin
 if p_user_id is null or btrim(p_user_id)='' then
  raise exception 'INVALID_FARM_USER';
 end if;
 select pet_state,access_state into s from public.farm_v2_player_state where user_id=p_user_id;
 if not found then return jsonb_build_object('status','player_not_found'); end if;
 eligibility:=jsonb_build_object(
  'pets',coalesce(jsonb_array_length(case when jsonb_typeof(s.pet_state->'owned')='array' then s.pet_state->'owned' else '[]'::jsonb end),0)>0,
  'friends',false,'synthesis',false,'pots',false,
  'availablePlantSpecies',coalesce(jsonb_array_length(case when jsonb_typeof(s.access_state->'accessActive')='array' then s.access_state->'accessActive' else '[]'::jsonb end),0),
  'availableHarvestSpecies',0);
 tasks:=public.farm_v2_assign_random_daily_tasks(p_user_id,eligibility);
 return jsonb_build_object('status','ready','assignedTaskIds',tasks);
end;
$$;
revoke all on function public.farm_v2_initialize_daily_activity_for_verified_user(text) from public,anon,authenticated;