-- Initialize a player's first 30-day attendance cycle once, and grant earned
-- makeup credits based on the current Taipei day. No prizes are issued here.
create or replace function public.farm_v2_signin_initialize(
  p_user_id text
) returns jsonb
language plpgsql volatile security invoker
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_cycle public.farm_v2_signin_cycles%rowtype;
  v_day integer;
  v_grants integer;
begin
  if p_user_id is null or length(p_user_id) < 1 or length(p_user_id) > 256 then
    return jsonb_build_object('status','invalid_user');
  end if;
  -- A verified farm player is required. Caller must additionally authenticate
  -- p_user_id using the platform's server-side session before invoking this RPC.
  perform 1 from public.farm_v2_player_state where user_id=p_user_id;
  if not found then return jsonb_build_object('status','player_not_found'); end if;

  -- Serializes concurrent initialization for the same farm player.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('farm_v2_signin:'||p_user_id,0));
  select * into v_cycle from public.farm_v2_signin_cycles
    where user_id=p_user_id order by cycle_number desc limit 1 for update;
  if not found then
    insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
    values(p_user_id,1,v_today) returning * into v_cycle;
  elsif v_today >= v_cycle.cycle_start_day + 30 then
    -- Never backfill, silently claim or overwrite a prior cycle.
    insert into public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
    values(p_user_id,v_cycle.cycle_number+1,v_today) returning * into v_cycle;
  end if;
  v_day := greatest(0,least(30,v_today-v_cycle.cycle_start_day+1));
  insert into public.farm_v2_signin_makeup_grants(user_id,cycle_number,grant_day)
    select p_user_id,v_cycle.cycle_number,d
      from pg_catalog.generate_series(3,30,3) as d
     where d <= v_day
    on conflict do nothing;
  select count(*)::integer into v_grants from public.farm_v2_signin_makeup_grants
    where user_id=p_user_id and cycle_number=v_cycle.cycle_number;
  return jsonb_build_object('status','ready','cycleNumber',v_cycle.cycle_number,
    'cycleDay',v_day,'makeupCreditsGranted',v_grants);
end;
$$;
revoke all on function public.farm_v2_signin_initialize(text) from public,anon,authenticated;
