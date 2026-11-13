-- Test existing daily-activity tables and scoring; no permanent changes.
begin;
do $test$
declare
 v_user text;
 v_day date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_ids text[]:=array['plant_once','plant_5','harvest_5','buy_seeds_once','open_warehouse','visit_friend'];
 v_saved text[];
 v_summary jsonb;
 v_type text;
 v_qty integer;
 v_idx integer:=0;
begin
 select user_id into v_user from public.farm_v2_player_state limit 1;
 if v_user is null then raise exception 'NO_ISOLATED_FARM_PLAYER'; end if;
 -- Remove today's fixture within transaction; rolled back at the end.
 delete from public.farm_v2_daily_activity_claims where user_id=v_user and activity_day=v_day;
 delete from public.farm_v2_daily_activity_events where user_id=v_user and activity_day=v_day;
 delete from public.farm_v2_daily_activity_days where user_id=v_user and activity_day=v_day;
 if not public.farm_v2_valid_daily_task_assignment(v_ids) then
   raise exception 'VALID_TASK_SET_REJECTED';
 end if;
 v_saved:=public.farm_v2_initialize_daily_activity(v_user,v_ids,'{}'::jsonb);
 if v_saved<>v_ids then raise exception 'TASK_ASSIGNMENT_CHANGED'; end if;
 v_summary:=public.farm_v2_daily_activity_summary(v_user);
 if (v_summary->>'points')::integer<>0 then raise exception 'NONZERO_INITIAL_POINTS: %',v_summary; end if;
 for v_type,v_qty in
   select * from (values ('plant',5),('harvest',5),('buy_seeds',1),('open_warehouse',1),('visit_friend',1)) x(t,q)
 loop
   v_idx:=v_idx+1;
   insert into public.farm_v2_daily_activity_events(user_id,activity_day,transaction_id,event_type,quantity)
   values(v_user,v_day,'activity-rollback-'||v_idx,v_type,v_qty);
 end loop;
 v_summary:=public.farm_v2_daily_activity_summary(v_user);
 if (v_summary->>'points')::integer<>120 then
   raise exception 'EXPECTED_120_POINTS: %',v_summary;
 end if;
 if v_summary->'claimableMilestones'<>'[30, 60, 100]'::jsonb then
   raise exception 'MILESTONE_MISMATCH: %',v_summary;
 end if;
end;
$test$;
rollback;
