-- A warehouse opening cannot award an unassigned daily task.
-- Synthetic user and assignment are rolled back.
begin;
do $$
declare u text:='warehouse-negative-rollback-20261113'; d date; a jsonb; n integer;
begin
 d:=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 insert into public.farm_v2_daily_activity_days(user_id,activity_day,assigned_task_ids,eligibility_snapshot)
 values(u,d,array['plant_once','plant_5','harvest_5','buy_seeds_once','buy_seeds_5','feed_pet'],'{"pets":true}'::jsonb);
 a:=public.farm_v2_record_warehouse_open(u);
 if a->>'status'<>'not_assigned' then raise exception 'UNEXPECTED_STATUS %',a; end if;
 select count(*) into n from public.farm_v2_daily_activity_events where user_id=u;
 if n<>0 then raise exception 'UNASSIGNED_EVENT_CREATED'; end if;
end $$;
rollback;
