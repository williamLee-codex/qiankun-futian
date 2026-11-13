-- Click-only warehouse task, trusted server invocation after an authenticated warehouse opening.
-- One event per farm user and Taipei 05:00 day; no browser-supplied identity or score.
create or replace function public.farm_v2_record_warehouse_open(p_user_id text)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare d date; tx text; inserted integer;
begin
 d:=((now() at time zone 'Asia/Taipei')-interval '5 hours')::date;
 if not exists(select 1 from public.farm_v2_daily_activity_days
  where user_id=p_user_id and activity_day=d and 'open_warehouse'=any(assigned_task_ids))
 then return jsonb_build_object('status','not_assigned'); end if;
 tx:='daily-warehouse-open:'||d::text;
 insert into public.farm_v2_daily_activity_events
 (user_id,activity_day,transaction_id,event_type,quantity,species_id,occurred_at)
 values(p_user_id,d,tx,'open_warehouse',1,null,now())
 on conflict(user_id,transaction_id) do nothing;
 get diagnostics inserted=row_count;
 return jsonb_build_object('status',case when inserted=1 then 'recorded' else 'already_recorded' end);
end;
$$;
revoke all on function public.farm_v2_record_warehouse_open(text) from public,anon,authenticated;