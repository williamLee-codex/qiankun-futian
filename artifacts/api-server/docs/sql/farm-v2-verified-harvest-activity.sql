-- Install on isolated database first. Requires farm_v2_mutation and daily activity tables.
-- The creditedQuantity field is inflated by newcomer sixfold harvest bonus.
create or replace function public.farm_v2_record_verified_harvest(p_user_id text,p_request_id text)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare h record; s record; v_land text; v_quantity integer; v_credited integer; v_day date; prior record;
begin
 select * into h from public.farm_v2_mutation
 where user_id=p_user_id and request_id=p_request_id and action ~ '^HARVEST:[1-6]$' and transaction_state='COMPLETED';
 if not found then return false; end if;
 v_land:=substring(h.action from 9);
 select * into s from public.farm_v2_mutation
 where user_id=p_user_id and action='SOW:'||v_land and transaction_state='COMPLETED' and created_at<h.created_at
 order by created_at desc,request_id desc limit 1;
 if not found then return false; end if;
 if exists(select 1 from public.farm_v2_mutation x
 where x.user_id=p_user_id and x.action=h.action and x.transaction_state='COMPLETED'
 and x.created_at>s.created_at and x.created_at<h.created_at) then return false; end if;
 v_quantity:=(s.response->'land'->>'plantedQuantity')::integer;
 v_credited:=(h.response->>'creditedQuantity')::integer;
 if v_quantity is null or v_quantity<=0 or v_quantity>1000
 or v_credited not in (v_quantity,v_quantity*6)
 or (s.response->'land'->>'landId')::integer<>v_land::integer
 or (h.response->'land'->>'landId')::integer<>v_land::integer
 or h.response->'land'->>'lifecycle'<>'EMPTY' then return false; end if;
 v_day:=((h.created_at at time zone 'Asia/Taipei')-interval '5 hours')::date;
 if not exists(select 1 from public.farm_v2_daily_activity_days where user_id=p_user_id and activity_day=v_day) then return false; end if;
 select * into prior from public.farm_v2_daily_activity_events where user_id=p_user_id and transaction_id=p_request_id;
 if found then
  if prior.activity_day<>v_day or prior.event_type<>'harvest' or prior.quantity<>v_quantity or prior.species_id<>v_land then
   raise exception 'CONFLICTING_VERIFIED_HARVEST_REPLAY';
  end if;
  return false;
 end if;
 insert into public.farm_v2_daily_activity_events(user_id,activity_day,transaction_id,event_type,quantity,species_id,occurred_at)
 values(p_user_id,v_day,p_request_id,'harvest',v_quantity,v_land,h.created_at);
 return true;
end;
$$;
revoke all on function public.farm_v2_record_verified_harvest(text,text) from public,anon,authenticated;
create or replace function public.farm_v2_verified_harvest_trigger()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if new.transaction_state='COMPLETED' and new.action ~ '^HARVEST:[1-6]$' then
  perform public.farm_v2_record_verified_harvest(new.user_id,new.request_id);
 end if;
 return new;
end;
$$;
drop trigger if exists farm_v2_verified_harvest_activity on public.farm_v2_mutation;
create trigger farm_v2_verified_harvest_activity after insert or update of transaction_state
on public.farm_v2_mutation for each row execute function public.farm_v2_verified_harvest_trigger();
revoke all on function public.farm_v2_verified_harvest_trigger() from public,anon,authenticated;
