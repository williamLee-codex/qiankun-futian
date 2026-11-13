-- Trigger on committed farm mutations, only after verified daily event recorder is installed.
-- No backfill: existing completed transactions are not automatically re-counted.
create or replace function public.farm_v2_seed_purchase_activity_trigger()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
 if new.transaction_state = 'COMPLETED'
   and new.action ~ '^seed-purchase:[1-6]:[0-9]+$'
   and (tg_op = 'INSERT' or old.transaction_state is distinct from 'COMPLETED') then
   perform public.farm_v2_record_verified_seed_purchase(new.user_id,new.request_id);
 end if;
 return new;
end;
$$;
revoke all on function public.farm_v2_seed_purchase_activity_trigger() from public,anon,authenticated;
drop trigger if exists farm_v2_seed_purchase_activity_committed on public.farm_v2_mutation;
create trigger farm_v2_seed_purchase_activity_committed
after insert or update of transaction_state on public.farm_v2_mutation
for each row execute function public.farm_v2_seed_purchase_activity_trigger();
