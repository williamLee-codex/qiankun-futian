-- Only enable tasks with implemented, verified event sources.
-- Pet actions have no trusted recorder; plot IDs are not plant species IDs.
create or replace function public.farm_v2_auto_initialize_activity_on_mutation()
returns trigger language plpgsql security invoker set search_path=''
as $$
declare v_day date; v_state record; v_eligibility jsonb;
begin
 if new.transaction_state<>'COMPLETED'
 or not (new.action ~ '^SOW:[1-6]$' or new.action ~ '^HARVEST:[1-6]$' or new.action like 'seed-purchase:%') then return new; end if;
 v_day:=((new.created_at at time zone 'Asia/Taipei')-interval '5 hours')::date;
 if v_day<>((now() at time zone 'Asia/Taipei')-interval '5 hours')::date then return new; end if;
 if exists(select 1 from public.farm_v2_daily_activity_days where user_id=new.user_id and activity_day=v_day) then return new; end if;
 select * into v_state from public.farm_v2_player_state where user_id=new.user_id;
 if not found then return new; end if;
 v_eligibility:=jsonb_build_object(
 'pets',false,
 'friends',false,'synthesis',false,'pots',false,
 'availablePlantSpecies',0,
 'availableHarvestSpecies',0);
 perform public.farm_v2_assign_random_daily_tasks(new.user_id,v_eligibility);
 return new;
end;
$$;
revoke all on function public.farm_v2_auto_initialize_activity_on_mutation() from public,anon,authenticated;
drop trigger if exists farm_v2_auto_daily_activity on public.farm_v2_mutation;
create trigger farm_v2_auto_daily_activity before insert or update of transaction_state
on public.farm_v2_mutation for each row execute function public.farm_v2_auto_initialize_activity_on_mutation();