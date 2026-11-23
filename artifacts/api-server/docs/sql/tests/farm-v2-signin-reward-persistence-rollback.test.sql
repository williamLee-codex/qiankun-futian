-- Regression: sign-in rewards must persist on a warehouse that has never had a
-- `workshop` key. createEmptyFarmWarehouse() only seeds `{seeds,crops}`, so the
-- reward writers must create `workshop`, `workshop.materials` and
-- `workshop.pots` themselves. jsonb_set silently no-ops on a missing parent and
-- NULL is not comparable with <>, so a missing parent previously dropped
-- material rewards and NULLed the warehouse on pot rewards.
BEGIN;
DO $test$
DECLARE
 u uuid:=gen_random_uuid();
 template text;
 v_today date:=(now() at time zone 'Asia/Taipei' - interval '5 hours')::date;
 r jsonb;
 w jsonb;
BEGIN
 SELECT p.user_id INTO template FROM public.farm_v2_player_state p
 WHERE public.farm_v2_resolve_verified_wallet_owner(p.user_id) IS NOT NULL LIMIT 1;
 ASSERT template IS NOT NULL,'verified template required';

 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO public.farm_v2_player_state(user_id,access_state,warehouse_state,mission_state,pet_state,farmer_state)
 VALUES(u::text,'{}','{"seeds":{},"crops":{}}'::jsonb,'{}','{}','{}');
 PERFORM public.core_wallet_get_or_create(u);
 ASSERT public.farm_v2_resolve_verified_wallet_owner(u::text)=u,'verified owner required';

 -- Day 2 (material): reward must land in a workshop that did not exist.
 INSERT INTO public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
 VALUES(u::text,970001,v_today-1);
 r:=public.farm_v2_signin_claim_day(u::text,970001,2);
 ASSERT r->>'status'='claimed','day 2 claimed, got '||coalesce(r::text,'NULL');
 SELECT warehouse_state INTO w FROM public.farm_v2_player_state WHERE user_id=u::text;
 ASSERT w IS NOT NULL,'warehouse must not become NULL';
 ASSERT (w#>>'{workshop,materials,蘊靈砂}')='1','day 2 material persisted, got '||coalesce(w::text,'NULL');
 r:=public.farm_v2_signin_claim_day(u::text,970001,2);
 ASSERT r->>'status'='already_signed','day 2 duplicate rejected';
 SELECT warehouse_state INTO w FROM public.farm_v2_player_state WHERE user_id=u::text;
 ASSERT (w#>>'{workshop,materials,蘊靈砂}')='1','day 2 duplicate did not double credit';

 -- Day 15 (pot): reward must land in workshop.pots without NULLing the row.
 INSERT INTO public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
 VALUES(u::text,970002,v_today-14);
 r:=public.farm_v2_signin_claim_day(u::text,970002,15);
 ASSERT r->>'status'='claimed','day 15 claimed, got '||coalesce(r::text,'NULL');
 SELECT warehouse_state INTO w FROM public.farm_v2_player_state WHERE user_id=u::text;
 ASSERT w IS NOT NULL,'pot claim must not NULL the warehouse';
 ASSERT jsonb_typeof(w#>'{workshop,pots}')='array','pot array created';
 ASSERT jsonb_array_length(w#>'{workshop,pots}')=1,'exactly one pot granted';
 ASSERT (w#>>'{workshop,materials,蘊靈砂}')='1','earlier material preserved';

 -- Perfect attendance on a warehouse with a pre-existing workshop keeps it intact.
 UPDATE public.farm_v2_player_state
 SET warehouse_state='{"seeds":{},"crops":{},"workshop":{"pots":[],"decor":[{"id":"keep"}],"materials":{"蘊靈砂":7}}}'::jsonb
 WHERE user_id=u::text;
 INSERT INTO public.farm_v2_signin_cycles(user_id,cycle_number,cycle_start_day)
 VALUES(u::text,970003,v_today-29);
 INSERT INTO public.farm_v2_signin_days(user_id,cycle_number,cycle_day,is_makeup)
 SELECT u::text,970003,d,false FROM generate_series(1,30) d;
 r:=public.farm_v2_signin_claim_perfect(u::text,970003);
 ASSERT r->>'status'='claimed','perfect claimed, got '||coalesce(r::text,'NULL');
 SELECT warehouse_state INTO w FROM public.farm_v2_player_state WHERE user_id=u::text;
 ASSERT (w#>>'{workshop,materials,蘊靈砂}')='9','perfect adds 2 to existing 7';
 ASSERT (w#>>'{workshop,materials,九霄玉髓}')='2','perfect grants jade';
 ASSERT (w#>'{workshop,decor}')::text='[{"id": "keep"}]','unrelated decor preserved';
END $test$;
ROLLBACK;
