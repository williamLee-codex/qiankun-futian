-- Durable, idempotent activity-event ingestion. Trusted API/server role only.
-- A repeated operation ID never increments a counter twice.
begin;
create table if not exists public.farm_v2_daily_activity_events (
 user_id text not null,
 activity_day date not null,
 operation_id text not null,
 event_type text not null check(event_type in ('sow','harvest','seed_purchase','signin','cave_visit')),
 quantity integer not null check(quantity between 1 and 100000),
 created_at timestamptz not null default now(),
 primary key(user_id,activity_day,operation_id)
);
create index if not exists farm_v2_daily_activity_events_day_idx
 on public.farm_v2_daily_activity_events(user_id,activity_day,event_type);
alter table public.farm_v2_daily_activity_events enable row level security;
revoke all on public.farm_v2_daily_activity_events from public,anon,authenticated;
create or replace function public.farm_v2_daily_activity_record_event(
 p_user_id text,p_operation_id text,p_event_type text,p_quantity integer
) returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare
 v_day date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 v_existing public.farm_v2_daily_activity_events%rowtype;
 v_inserted integer;
begin
 if p_user_id is null or length(p_user_id)=0 or
    p_operation_id is null or length(p_operation_id) not between 1 and 120 or
    p_event_type not in ('sow','harvest','seed_purchase','signin','cave_visit') or
    p_quantity is null or p_quantity not between 1 and 100000 then
    return jsonb_build_object('status','invalid_event');
 end if;
 insert into public.farm_v2_daily_activity_events(user_id,activity_day,operation_id,event_type,quantity)
 values(p_user_id,v_day,p_operation_id,p_event_type,p_quantity)
 on conflict do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted=1 then
   return jsonb_build_object('status','recorded','activityDay',v_day,'event',p_event_type,'quantity',p_quantity);
 end if;
 select * into v_existing from public.farm_v2_daily_activity_events
 where user_id=p_user_id and activity_day=v_day and operation_id=p_operation_id;
 if v_existing.event_type=p_event_type and v_existing.quantity=p_quantity then
   return jsonb_build_object('status','duplicate','activityDay',v_day);
 end if;
 return jsonb_build_object('status','operation_conflict','activityDay',v_day);
end; $$;
revoke all on function public.farm_v2_daily_activity_record_event(text,text,text,integer) from public,anon,authenticated;
commit;
