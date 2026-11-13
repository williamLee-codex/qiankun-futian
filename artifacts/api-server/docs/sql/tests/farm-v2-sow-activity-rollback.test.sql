-- Run only in an isolated database. Entire test rolls back.
begin;
insert into public.farm_v2_daily_activity_days(user_id,activity_day,assigned_task_ids)
values('__sow_e2e__',((now() at time zone 'Asia/Taipei')-interval '5 hours')::date,
array['plant_once','plant_5','harvest_5','buy_seeds_once','buy_seeds_5','open_warehouse']);
insert into public.farm_v2_mutation(request_id,user_id,action,transaction_state,response)
values('__sow_e2e_tx__','__sow_e2e__','SOW:1','PENDING',null);
update public.farm_v2_mutation
set transaction_state='COMPLETED',response='{"land":{"landId":1,"lifecycle":"GROWING","plantedQuantity":20}}'::jsonb
where request_id='__sow_e2e_tx__';
update public.farm_v2_mutation set transaction_state='COMPLETED' where request_id='__sow_e2e_tx__';
do $$ declare n integer; p integer; begin
select count(*) into n from public.farm_v2_daily_activity_events where transaction_id='__sow_e2e_tx__';
if n<>1 then raise exception 'SOW_DUPLICATE %',n; end if;
p:=(public.farm_v2_daily_activity_summary('__sow_e2e__')->>'points')::integer;
if p<>40 then raise exception 'SOW_POINTS %',p; end if;
end $$;
rollback;
