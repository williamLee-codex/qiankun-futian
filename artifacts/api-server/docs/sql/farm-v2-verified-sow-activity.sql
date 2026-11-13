-- Verified sow events only. Harvest credits cannot be used as plant count:
-- newcomer sixfold multiplier inflates creditedQuantity.
create or replace function public.farm_v2_record_verified_sow(p_user_id text,p_request_id text)
returns boolean language plpgsql security invoker set search_path=''
as $$
declare m record; d date; q integer; s text; prior record;
begin
 select * into m from public.farm_v2_mutation
 where user_id=p_user_id and request_id=p_request_id and action ~ '^SOW:[1-6]$' and transaction_state='COMPLETED';
 if not found then return false; end if;
 q:=nullif(m.response->'land'->>'plantedQuantity','')::integer;
 s:=substring(m.action from 5);
 if q is null or q<=0 or q>1000 or (m.response->'land'->>'landId')::integer<>s::integer
 or m.response->'land'->>'lifecycle'<>'GROWING' then return false; end if;
 d:=((m.created_at at time zone 'Asia/Taipei')-interval '5 hours')::date;
 if not exists(select 1 from public.farm_v2_daily_activity_days where user_id=p_user_id and activity_day=d) then return false; end if;
 select * into prior from public.farm_v2_daily_activity_events where user_id=p_user_id and transaction_id=p_request_id;
 if found then
  if prior.activity_day<>d or prior.event_type<>'plant' or prior.quantity<>q or prior.species_id<>s then
   raise exception 'CONFLICTING_VERIFIED_SOW_REPLAY';
  end if;
  return false;
 end if;
 insert into public.farm_v2_daily_activity_events(user_id,activity_day,transaction_id,event_type,quantity,species_id,occurred_at)
 values(p_user_id,d,p_request_id,'plant',q,s,m.created_at);
 return true;
end;
$$;
revoke all on function public.farm_v2_record_verified_sow(text,text) from public,anon,authenticated;
create or replace function public.farm_v2_verified_sow_trigger()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
 if new.transaction_state='COMPLETED' and new.action ~ '^SOW:[1-6]$' then
  perform public.farm_v2_record_verified_sow(new.user_id,new.request_id);
 end if;
 return new;
end;
$$;
drop trigger if exists farm_v2_verified_sow_activity on public.farm_v2_mutation;
create trigger farm_v2_verified_sow_activity after insert or update of transaction_state
on public.farm_v2_mutation for each row execute function public.farm_v2_verified_sow_trigger();
revoke all on function public.farm_v2_verified_sow_trigger() from public,anon,authenticated;
