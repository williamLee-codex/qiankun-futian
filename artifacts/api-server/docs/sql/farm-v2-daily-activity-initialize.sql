-- Internal service only. Caller must authenticate the player, derive eligibility
-- from authoritative feature state, and select six tasks with selectDailyTasks().
-- Never accept task IDs or eligibility supplied by a browser.
create or replace function public.farm_v2_initialize_daily_activity(
 p_user_id text, p_task_ids text[], p_eligibility jsonb default '{}'::jsonb
) returns text[]
language plpgsql security invoker set search_path = ''
as $$
declare d date; saved text[];
begin
 if p_user_id is null or length(trim(p_user_id))=0 then raise exception 'INVALID_USER_ID'; end if;
 if not public.farm_v2_valid_daily_task_assignment(p_task_ids) then raise exception 'INVALID_DAILY_TASK_ASSIGNMENT'; end if;
 d:=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 insert into public.farm_v2_daily_activity_days(user_id,activity_day,assigned_task_ids,eligibility_snapshot)
 values(p_user_id,d,p_task_ids,coalesce(p_eligibility,'{}'::jsonb))
 on conflict(user_id,activity_day) do nothing;
 select assigned_task_ids into saved from public.farm_v2_daily_activity_days
 where user_id=p_user_id and activity_day=d;
 return saved;
end;
$$;
revoke all on function public.farm_v2_initialize_daily_activity(text,text[],jsonb) from public,anon,authenticated;
