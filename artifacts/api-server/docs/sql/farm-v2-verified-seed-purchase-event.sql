-- Internal-only, service-invoked after authoritative completed purchase.
-- No client execute grants. Existing assignment required; no automatic retroactive award.
create or replace function public.farm_v2_record_verified_seed_purchase(p_user_id text, p_request_id text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
 m record;
 d date;
 qty integer;
begin
 select user_id,request_id,action,response,created_at into m
 from public.farm_v2_mutation
 where user_id=p_user_id and request_id=p_request_id and transaction_state='COMPLETED'
   and action ~ '^seed-purchase:[1-6]:[0-9]+$'
 for share;
 if not found then return false; end if;
 if (m.response->>'seedsAdded') !~ '^[0-9]{1,9}$' then return false; end if;
 qty := (m.response->>'seedsAdded')::integer;
 if qty <= 0 then return false; end if;
 d := ((m.created_at at time zone 'Asia/Taipei') - interval '5 hours')::date;
 if not exists (select 1 from public.farm_v2_daily_activity_days where user_id=p_user_id and activity_day=d) then return false; end if;
 insert into public.farm_v2_daily_activity_events(user_id,activity_day,transaction_id,event_type,quantity,species_id,occurred_at)
 values(p_user_id,d,p_request_id,'buy_seeds',qty,split_part(m.action,':',3),m.created_at)
 on conflict (user_id,transaction_id) do nothing;
 return true;
end;
$$;
revoke all on function public.farm_v2_record_verified_seed_purchase(text,text) from public,anon,authenticated;
