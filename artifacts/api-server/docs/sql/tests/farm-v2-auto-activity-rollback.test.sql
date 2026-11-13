-- Isolated Supabase only. All writes are rolled back.
-- Uses a real player-state row but never changes their permanent activity.
begin;
do $$
declare u text; d date; tasks text[]; n integer; e integer;
begin
 select user_id into u from public.farm_v2_player_state order by user_id limit 1;
 if u is null then raise exception 'NO_FARM_PLAYER_STATE'; end if;
 d:=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 if exists(select 1 from public.farm_v2_daily_activity_days where user_id=u and activity_day=d) then
  raise exception 'TEST_REQUIRES_UNINITIALIZED_PLAYER';
 end if;
 insert into public.farm_v2_mutation(request_id,user_id,action,transaction_state,response)
 values('__auto_activity_test_sow__',u,'SOW:1','COMPLETED',
 '{"land":{"landId":1,"lifecycle":"GROWING","plantedQuantity":20}}');
 select assigned_task_ids into tasks from public.farm_v2_daily_activity_days where user_id=u and activity_day=d;
 if cardinality(tasks)<>6 or not public.farm_v2_valid_daily_task_assignment(tasks) then
  raise exception 'AUTO_ASSIGNMENT_INVALID';
 end if;
 select count(*) into e from public.farm_v2_daily_activity_events
 where user_id=u and transaction_id='__auto_activity_test_sow__';
 if e<>1 then raise exception 'SOW_NOT_CAPTURED %',e; end if;
 insert into public.farm_v2_mutation(request_id,user_id,action,transaction_state,response)
 values('__auto_activity_test_sow_2__',u,'SOW:2','COMPLETED',
 '{"land":{"landId":2,"lifecycle":"GROWING","plantedQuantity":15}}');
 select count(*) into n from public.farm_v2_daily_activity_days where user_id=u and activity_day=d;
 if n<>1 then raise exception 'DUPLICATE_ASSIGNMENT %',n; end if;
 if (select assigned_task_ids from public.farm_v2_daily_activity_days where user_id=u and activity_day=d)<>tasks then
  raise exception 'TASK_ASSIGNMENT_CHANGED';
 end if;
end $$;
rollback;
