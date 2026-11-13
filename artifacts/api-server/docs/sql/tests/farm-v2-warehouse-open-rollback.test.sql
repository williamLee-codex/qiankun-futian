-- Verify warehouse click counts once and gives exactly 20 points.
-- All test state rolls back.
begin;
do $$
declare u text; d date; a jsonb; b jsonb; n int; points int;
begin
 select p.user_id into u from public.farm_v2_player_state p order by p.user_id limit 1;
 if u is null then raise exception 'NO_FARM_PLAYER'; end if;
 d:=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 insert into public.farm_v2_daily_activity_days(user_id,activity_day,assigned_task_ids,eligibility_snapshot)
 values(u,d,array['plant_once','plant_5','harvest_5','buy_seeds_once','buy_seeds_5','open_warehouse'],'{}'::jsonb)
 on conflict(user_id,activity_day) do nothing;
 if not exists(select 1 from public.farm_v2_daily_activity_days where user_id=u and activity_day=d and 'open_warehouse'=any(assigned_task_ids))
 then raise exception 'WAREHOUSE_NOT_ASSIGNED'; end if;
 a:=public.farm_v2_record_warehouse_open(u);
 b:=public.farm_v2_record_warehouse_open(u);
 if a->>'status'<>'recorded' or b->>'status'<>'already_recorded'
 then raise exception 'WAREHOUSE_STATUS % %',a,b; end if;
 select count(*) into n from public.farm_v2_daily_activity_events
 where user_id=u and activity_day=d and event_type='open_warehouse';
 if n<>1 then raise exception 'WAREHOUSE_EVENT_COUNT %',n; end if;
 points:=(public.farm_v2_daily_activity_summary(u)->>'points')::int;
 if points<>20 then raise exception 'WAREHOUSE_POINTS %',points; end if;
end $$;
rollback;
