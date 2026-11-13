-- Isolated regression: sign-in and makeup must share Taiwan 05:00 day boundary.
-- This test performs no persistent writes.
begin;
do $test$
declare
  v_time timestamptz;
  v_day date;
  v_expected date;
  v_name text;
  v_names text[] := array[
    'farm_v2_signin_initialize','farm_v2_signin_status','farm_v2_signin_cycle_summary',
    'farm_v2_signin_claim_coin_day','farm_v2_signin_claim_crystal_day',
    'farm_v2_signin_claim_material_day','farm_v2_signin_claim_pot_day',
    'farm_v2_signin_claim_consumable_day','farm_v2_signin_makeup_coin_day',
    'farm_v2_signin_makeup_crystal_day','farm_v2_signin_makeup_material_day',
    'farm_v2_signin_makeup_pot_day','farm_v2_signin_makeup_consumable_day'];
  v_def text;
begin
  for v_time,v_expected in
    select * from (values
      ('2026-11-13 00:00:00+08'::timestamptz,'2026-11-12'::date),
      ('2026-11-13 04:59:59+08'::timestamptz,'2026-11-12'::date),
      ('2026-11-13 05:00:00+08'::timestamptz,'2026-11-13'::date),
      ('2026-11-13 23:59:59+08'::timestamptz,'2026-11-13'::date),
      ('2026-11-14 04:59:59+08'::timestamptz,'2026-11-13'::date),
      ('2026-11-14 05:00:00+08'::timestamptz,'2026-11-14'::date)
    ) t(at_time,expected_day)
  loop
    v_day:=((v_time at time zone 'Asia/Taipei')-interval '5 hours')::date;
    if v_day is distinct from v_expected then
      raise exception 'SIGNIN_0500_BOUNDARY_FAILED: %, expected %, got %',v_time,v_expected,v_day;
    end if;
  end loop;
  foreach v_name in array v_names loop
    select pg_catalog.pg_get_functiondef(p.oid) into v_def
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
     where n.nspname='public' and p.proname=v_name;
    if v_def is null or position('interval ''5 hours''' in v_def)=0 then
      raise exception 'SIGNIN_ROLLOVER_MISSING: %',v_name;
    end if;
  end loop;
end;
$test$;
rollback;
