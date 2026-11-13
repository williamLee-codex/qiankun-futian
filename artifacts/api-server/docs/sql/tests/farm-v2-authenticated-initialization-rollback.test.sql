-- Repeatable isolated integration test. No permanent player mutations.
begin;
do $$
declare u text; a jsonb; b jsonb; n integer;
begin
 select p.user_id into u from public.farm_v2_player_state p
 where not exists(
   select 1 from public.farm_v2_daily_activity_days d
   where d.user_id=p.user_id
     and d.activity_day=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date
 ) order by p.user_id limit 1;
 if u is null then raise exception 'NO_ELIGIBLE_TEST_PLAYER'; end if;
 a:=public.farm_v2_initialize_daily_activity_for_verified_user(u);
 b:=public.farm_v2_initialize_daily_activity_for_verified_user(u);
 if a->>'status'<>'ready' or a->'assignedTaskIds'<>b->'assignedTaskIds' then
  raise exception 'INIT_NOT_IDEMPOTENT';
 end if;
 select count(*) into n from public.farm_v2_daily_activity_days
 where user_id=u and activity_day=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 if n<>1 then raise exception 'DUPLICATE_DAY %',n; end if;
 if (public.farm_v2_daily_activity_summary(u)->>'initialized')::boolean is distinct from true then
  raise exception 'SUMMARY_NOT_INITIALIZED';
 end if;
end $$;
rollback;
