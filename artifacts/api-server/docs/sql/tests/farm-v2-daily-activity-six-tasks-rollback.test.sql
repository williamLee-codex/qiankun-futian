-- Run as privileged migration operator. Entire test and all synthetic fixtures roll back.
BEGIN;
DO $test$
DECLARE u uuid:=gen_random_uuid(); f uuid:=gen_random_uuid(); uid text; initial jsonb; again jsonb; summary jsonb; assignment jsonb;
 n integer; task record; coins_before integer; coin_count integer; w_before jsonb; pots_before integer; sand_before integer; test_day date; bad jsonb; error_seen boolean;
BEGIN
 uid:=u::text;
 ASSERT public.farm_v2_activity_day_key('2026-11-14T20:59:59.999Z'::timestamptz)='2026-11-14'::date,'Taiwan04:59 stays yesterday';
 ASSERT public.farm_v2_activity_day_key('2026-11-14T21:00:00Z'::timestamptz)='2026-11-15'::date,'Taiwan05:00 starts new day';
 ASSERT public.farm_v2_activity_day_key('2026-11-15T00:00:00Z'::timestamptz)='2026-11-15'::date,'Taiwan08:00 same activity day';
 ASSERT has_function_privilege('farm_v2_runtime','farm_v2_rewards.activity(text,text,integer)','EXECUTE');
 ASSERT has_function_privilege('farm_v2_runtime','farm_v2_rewards.activity_visit(text,text)','EXECUTE');
 ASSERT NOT has_function_privilege('anon','farm_v2_rewards.activity(text,text,integer)','EXECUTE');
 ASSERT NOT has_function_privilege('authenticated','farm_v2_rewards.activity(text,text,integer)','EXECUTE');
 ASSERT NOT has_function_privilege('anon','farm_v2_rewards.activity_visit(text,text)','EXECUTE');
 ASSERT NOT has_function_privilege('farm_v2_runtime','public.farm_v2_record_activity_event(text,text,text,integer,integer)','EXECUTE');
 ASSERT NOT has_function_privilege('farm_v2_runtime','public.farm_v2_activity_ensure_day(text)','EXECUTE');
 ASSERT NOT has_function_privilege('farm_v2_runtime','public.farm_v2_activity_credit_coins(uuid,text,date)','EXECUTE');
 ASSERT NOT has_function_privilege('farm_v2_runtime','public.farm_v2_activity_completed_mutation()','EXECUTE');
 ASSERT NOT has_function_privilege('farm_v2_runtime','public.core_wallet_apply_transaction(uuid,integer,text,text,text,text,text,text,uuid)','EXECUTE');
 FOR task IN SELECT unnest(ARRAY['farm_v2_activity_day','farm_v2_activity_event','farm_v2_activity_claim']) name LOOP
  ASSERT NOT has_table_privilege('anon','public.'||task.name,'SELECT,INSERT,UPDATE,DELETE');
  ASSERT NOT has_table_privilege('authenticated','public.'||task.name,'INSERT,UPDATE,DELETE');
  ASSERT NOT has_table_privilege('farm_v2_runtime','public.'||task.name,'INSERT,UPDATE,DELETE');
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||task.name)::regclass);
 END LOOP;
 BEGIN PERFORM farm_v2_rewards.activity('not-a-uuid',NULL,NULL); RAISE EXCEPTION 'null action accepted';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='UNKNOWN_ACTIVITY_ACTION','null action must be explicitly rejected'; END;
 ASSERT farm_v2_rewards.activity('not-a-uuid')->>'status'='unverified_identity';
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_day WHERE user_id='not-a-uuid');
 INSERT INTO auth.users(id) VALUES(u),(f);
 -- Known-empty first-field baseline, no optional pet/pot/material/friend eligibility.
 INSERT INTO public.farm_v2_player_state(user_id,access_state,warehouse_state,mission_state,pet_state,farmer_state)
 SELECT uid,access_state,
 '{"seeds":{"1":100,"2":0,"3":0,"4":0,"5":0,"6":0},"crops":{"1":0,"2":0,"3":0,"4":0,"5":0,"6":0}}'::jsonb,
 mission_state,'{"owned":[],"activePetId":null,"activeUntil":null}'::jsonb,farmer_state
 FROM public.farm_v2_player_state WHERE public.farm_v2_resolve_verified_wallet_owner(user_id) IS NOT NULL LIMIT 1;
 ASSERT FOUND,'requires one existing verified Farm player to copy opaque unrelated defaults';
 PERFORM public.core_wallet_get_or_create(u);
 INSERT INTO public.farm_v2_land(user_id,land_id,lifecycle,access_active) VALUES(uid,1,'EMPTY',true);
 test_day:=public.farm_v2_activity_day_key();
 initial:=farm_v2_rewards.activity(uid);
 ASSERT initial->>'status'='ready'; ASSERT initial->>'points'='0'; ASSERT initial->>'maximum'='120';
 ASSERT jsonb_array_length(initial->'tasks')=6;
 SELECT tasks INTO assignment FROM public.farm_v2_activity_day WHERE user_id=uid AND day=test_day;
 ASSERT (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(assignment)x)=6;
 ASSERT (SELECT count(*) FROM jsonb_array_elements(assignment)x WHERE x->>'group'='click')=1;
 ASSERT (SELECT count(*) FROM jsonb_array_elements(assignment)x WHERE x->>'group'='plant_qty')=1;
 ASSERT (SELECT count(*) FROM jsonb_array_elements(assignment)x WHERE x->>'group'='harvest_qty')=1;
 ASSERT (SELECT count(*) FROM jsonb_array_elements(assignment)x WHERE x->>'group'='buy_qty')=1;
 ASSERT (SELECT count(*) FROM jsonb_array_elements(assignment)x WHERE x->>'id'='plant_once')=1;
 ASSERT (SELECT count(*) FROM jsonb_array_elements(assignment)x WHERE x->>'id'='buy_seeds_once')=1;
 again:=farm_v2_rewards.activity(uid); ASSERT initial=again,'stable repeated status';
 DELETE FROM public.farm_v2_activity_day WHERE user_id=uid AND day=test_day;
 PERFORM public.farm_v2_activity_ensure_day(uid);
 ASSERT (SELECT tasks=assignment FROM public.farm_v2_activity_day WHERE user_id=uid AND day=test_day),'deterministic regenerated assignment';
 ASSERT farm_v2_rewards.activity(uid,'claim',30)->>'status'='locked';
 ASSERT farm_v2_rewards.activity(uid,'inspect_pet')->>'status'='locked';
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_event WHERE user_id=uid AND event_type='inspect_pet');
 -- A reserved or failed journal never counts. Completion and response are required.
 INSERT INTO public.farm_v2_mutation(user_id,request_id,action,transaction_state) VALUES(uid,'plant-1','SOW:1','PENDING');
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_event WHERE user_id=uid);
 UPDATE public.farm_v2_mutation SET transaction_state='WALLET_PENDING' WHERE user_id=uid AND request_id='plant-1';
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_event WHERE user_id=uid);
 BEGIN
  UPDATE public.farm_v2_mutation SET transaction_state='COMPLETED',response='{"land":{"landId":1,"plantedQuantity":20}}' WHERE user_id=uid AND request_id='plant-1';
  RAISE EXCEPTION 'simulate_failed_journal_transaction';
 EXCEPTION WHEN raise_exception THEN NULL; END;
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_event WHERE user_id=uid),'rollback must also remove trigger event';
 UPDATE public.farm_v2_mutation SET transaction_state='COMPLETED',response='{"land":{"landId":1,"plantedQuantity":20}}' WHERE user_id=uid AND request_id='plant-1';
 ASSERT (SELECT quantity=20 AND species=1 FROM public.farm_v2_activity_event WHERE user_id=uid AND event_type='plant');
 UPDATE public.farm_v2_mutation SET response=response||'{"replayed":true}'::jsonb WHERE user_id=uid AND request_id='plant-1';
 PERFORM public.farm_v2_record_activity_event(uid,'plant-1','plant',999,2);
 ASSERT (SELECT count(*)=1 AND sum(quantity)=20 FROM public.farm_v2_activity_event WHERE user_id=uid AND event_type='plant'),'journal replay/event duplicate immutable';
 ASSERT farm_v2_rewards.activity(uid)->>'points'='40';
 ASSERT farm_v2_rewards.activity(uid,'claim',60)->>'status'='locked';
 SELECT coin_balance INTO coins_before FROM public.core_wallets WHERE owner_id=u;
 ASSERT coins_before IS NOT NULL;
 -- Fail receipt insertion after central credit: both balance and ledger must roll back.
 EXECUTE format('ALTER TABLE public.farm_v2_activity_claim ADD CONSTRAINT activity_test_coin_rollback CHECK (NOT (user_id=%L AND milestone=30))',uid);
 BEGIN
  PERFORM farm_v2_rewards.activity(uid,'claim',30);
  RAISE EXCEPTION 'expected coin receipt constraint failure';
 EXCEPTION WHEN check_violation THEN NULL; END;
 ASSERT (SELECT coin_balance=coins_before FROM public.core_wallets WHERE owner_id=u),'failed receipt reverts central coin balance';
 ASSERT NOT EXISTS(SELECT 1 FROM public.core_wallet_ledger WHERE owner_id=u AND reason='farm_v2_activity' AND idempotency_key='farm-v2:activity:'||uid||':'||test_day::text||':30'),'failed receipt reverts central ledger';
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_claim WHERE user_id=uid AND milestone=30),'failed coin claim leaves no receipt';
 ALTER TABLE public.farm_v2_activity_claim DROP CONSTRAINT activity_test_coin_rollback;
 ASSERT farm_v2_rewards.activity(uid,'claim',30)->>'status'='claimed';
 ASSERT farm_v2_rewards.activity(uid,'claim',30)->>'status'='already_claimed';
 ASSERT (SELECT count(*)=1 FROM public.farm_v2_activity_claim WHERE user_id=uid AND milestone=30);
 ASSERT (SELECT coin_balance=coins_before+10 FROM public.core_wallets WHERE owner_id=u),'claim plus retry credits central coin exactly10';
 ASSERT (SELECT count(*)=1 AND sum(amount)=10 AND bool_and(currency='coin' AND direction='credit' AND reference_type='farm_v2_activity') FROM public.core_wallet_ledger WHERE owner_id=u AND reason='farm_v2_activity' AND idempotency_key='farm-v2:activity:'||uid||':'||test_day::text||':30'),'exactly one matching central activity ledger despite retry';
 -- Harvest credit deliberately inflated; count canonical20 planted plants only.
 INSERT INTO public.farm_v2_mutation(user_id,request_id,action,transaction_state,response)
 VALUES(uid,'harvest-1','HARVEST:1','COMPLETED','{"land":{"landId":1,"plantedQuantity":0},"creditedQuantity":400}');
 ASSERT (SELECT quantity=20 FROM public.farm_v2_activity_event WHERE user_id=uid AND event_type='harvest');
 ASSERT farm_v2_rewards.activity(uid)->>'points'='60';
 ASSERT farm_v2_rewards.activity(uid,'claim',60)->>'status'='claimed';
 ASSERT farm_v2_rewards.activity(uid,'claim',60)->>'status'='already_claimed';
 ASSERT (SELECT count(*)=1 FROM public.farm_v2_activity_claim WHERE user_id=uid AND milestone=60);
 ASSERT (SELECT jsonb_array_length(warehouse_state#>'{workshop,pots}')=1 FROM public.farm_v2_player_state WHERE user_id=uid);
 ASSERT (SELECT (reward->>'species')::integer BETWEEN 1 AND 6 AND reward->>'grade'='黃' AND reward->>'displayed'='false' AND (reward->>'id')::uuid IS NOT NULL FROM public.farm_v2_activity_claim WHERE user_id=uid AND milestone=60);
 INSERT INTO public.farm_v2_mutation(user_id,request_id,action,transaction_state,response)
 VALUES(uid,'buy-1','seed-purchase:1:1','COMPLETED','{"landId":1,"seedsAdded":20}');
 ASSERT farm_v2_rewards.activity(uid)->>'points'='100';
 ASSERT farm_v2_rewards.activity(uid,'claim',100)->>'status'='claimed';
 ASSERT farm_v2_rewards.activity(uid,'claim',100)->>'status'='already_claimed';
 ASSERT (SELECT (warehouse_state#>>'{workshop,materials,蘊靈砂}')::integer=1 FROM public.farm_v2_player_state WHERE user_id=uid);
 PERFORM farm_v2_rewards.activity(uid,'inspect_warehouse');
 PERFORM farm_v2_rewards.activity(uid,'inspect_warehouse');
 ASSERT (SELECT count(*)=1 FROM public.farm_v2_activity_event WHERE user_id=uid AND event_type='inspect_warehouse');
 summary:=farm_v2_rewards.activity(uid); ASSERT summary->>'points'='120';
 ASSERT (SELECT bool_and((x->>'complete')::boolean) FROM jsonb_array_elements(summary->'tasks')x);
 ASSERT (SELECT bool_and((x->>'claimed')::boolean AND NOT (x->>'eligible')::boolean) FROM jsonb_array_elements(summary->'milestones')x);
 ASSERT (SELECT tasks=assignment FROM public.farm_v2_activity_day WHERE user_id=uid AND day=test_day),'reward eligibility must never reshuffle day';
 INSERT INTO public.farm_v2_mutation(user_id,request_id,action,transaction_state,response,created_at)
 VALUES(uid,'historic','SOW:1','COMPLETED','{"land":{"plantedQuantity":20}}',statement_timestamp()-interval '2 days');
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_event WHERE user_id=uid AND transaction_id='historic'),'no past journal backfill';
 INSERT INTO public.farm_v2_mutation(user_id,request_id,action,transaction_state,response)
 VALUES(uid,'friend-failure','FRIEND:BORROW:00000000-0000-0000-0000-000000000000:2','COMPLETED','{"successful":false}');
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_event WHERE user_id=uid AND transaction_id='friend-failure');
 ASSERT farm_v2_rewards.activity_visit(uid,f::text)->>'status'='locked','strangers cannot get visit event';
 -- Species use distinct event rows, not arbitrary quantity or altered replay metadata.
 PERFORM public.farm_v2_record_activity_event(uid,'species-2','plant',1,2);
 ASSERT (SELECT count(DISTINCT species)=2 FROM public.farm_v2_activity_event WHERE user_id=uid AND event_type='plant');
 ASSERT farm_v2_rewards.activity(uid)->>'points'='120','points cannot overflow';
 -- Optional unlocked features remain eligible only when owned/available at assignment time.
 INSERT INTO public.farm_v2_player_state(user_id,access_state,warehouse_state,mission_state,pet_state,farmer_state)
 SELECT f::text,access_state,
 warehouse_state||'{"workshop":{"pots":[{"id":"00000000-0000-4000-8000-000000000001","species":1,"grade":"黃","displayed":false,"acquiredAt":0}],"petFood":1,"materials":{"蘊靈砂":0,"九霄玉髓":0}},"crops":{"1":0}}'::jsonb,
 mission_state,'{"owned":["尋星犬"]}'::jsonb,farmer_state FROM public.farm_v2_player_state WHERE user_id=uid;
 PERFORM public.core_wallet_get_or_create(f);
 INSERT INTO public.farm_v2_land(user_id,land_id,lifecycle,access_active) VALUES(f::text,1,'EMPTY',true),(f::text,2,'EMPTY',true);
 PERFORM farm_v2_rewards.activity(f::text);
 ASSERT (SELECT jsonb_array_length(tasks)=6 FROM public.farm_v2_activity_day WHERE user_id=f::text);
 ASSERT (SELECT count(*)<=1 FROM public.farm_v2_activity_day d CROSS JOIN LATERAL jsonb_array_elements(d.tasks)x WHERE d.user_id=f::text AND x->>'group'='click');
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_day d CROSS JOIN LATERAL jsonb_array_elements(d.tasks)x WHERE d.user_id=f::text AND x->>'id' IN('synthesize_once','visit_friend_once','interact_friend_once'));
 PERFORM farm_v2_rewards.activity(f::text,'inspect_pet'); PERFORM farm_v2_rewards.activity(f::text,'inspect_pet');
 ASSERT (SELECT count(*)=1 FROM public.farm_v2_activity_event WHERE user_id=f::text AND event_type='inspect_pet');
 PERFORM public.farm_v2_record_activity_event(f::text,'plant-a','plant',100,1);
 PERFORM public.farm_v2_record_activity_event(f::text,'plant-b','plant',100,2);
 PERFORM public.farm_v2_record_activity_event(f::text,'harvest-a','harvest',100,1);
 PERFORM public.farm_v2_record_activity_event(f::text,'harvest-b','harvest',100,2);
 PERFORM public.farm_v2_record_activity_event(f::text,'buy-a','buy_seeds',100,1);
 PERFORM public.farm_v2_record_activity_event(f::text,'display-a','display_pot',1);
 PERFORM public.farm_v2_record_activity_event(f::text,'feed-a','feed_pet',1);
 PERFORM farm_v2_rewards.activity(f::text,'inspect_warehouse');
 ASSERT farm_v2_rewards.activity(f::text)->>'points'='120','two-species/optional selected tasks count correctly';
 SELECT warehouse_state INTO w_before FROM public.farm_v2_player_state WHERE user_id=f::text;
 -- Force failure after inventory reward mutation. Exception subtransaction must revert it.
 EXECUTE format('ALTER TABLE public.farm_v2_activity_claim ADD CONSTRAINT activity_test_force_rollback CHECK (user_id<>%L)',f::text);
 BEGIN
  PERFORM farm_v2_rewards.activity(f::text,'claim',60);
  RAISE EXCEPTION 'expected injected constraint failure';
 EXCEPTION WHEN check_violation THEN NULL; END;
 ASSERT (SELECT warehouse_state=w_before FROM public.farm_v2_player_state WHERE user_id=f::text),'failed claim reverts inventory';
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_claim WHERE user_id=f::text),'failed claim creates no receipt';
 ALTER TABLE public.farm_v2_activity_claim DROP CONSTRAINT activity_test_force_rollback;
 -- An unresolved exact assetPlan reservation protects both inventory milestones.
 INSERT INTO public.farm_v2_mutation(user_id,request_id,action,transaction_state,wallet_transaction)
 VALUES(f::text,'reserved-workshop','WORKSHOP:{"kind":"synthesize"}','PENDING','{"assetPlan":{"before":{}}}');
 ASSERT farm_v2_rewards.activity(f::text,'claim',60)->>'status'='recovery_required';
 ASSERT farm_v2_rewards.activity(f::text,'claim',100)->>'status'='recovery_required';
 ASSERT (SELECT warehouse_state=w_before FROM public.farm_v2_player_state WHERE user_id=f::text),'reservation leaves warehouse unchanged';
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_claim WHERE user_id=f::text),'reservation leaves receipts unchanged';
 ASSERT farm_v2_rewards.activity(f::text)->>'status'='ready','reservation must preserve status';
 ASSERT farm_v2_rewards.activity(f::text,'inspect_pet')->>'status'='ready','reservation must preserve inspection';
 UPDATE public.farm_v2_mutation SET transaction_state='COMPENSATED' WHERE user_id=f::text AND request_id='reserved-workshop';
 ASSERT farm_v2_rewards.activity(f::text,'claim',60)->>'status'='claimed','retry after rolled back claim succeeds';
 SELECT warehouse_state INTO w_before FROM public.farm_v2_player_state WHERE user_id=f::text;
 FOR bad IN SELECT x FROM jsonb_array_elements('[null,[],42,{"workshop":null},{"workshop":[]},{"workshop":{"pots":{},"materials":{"蘊靈砂":0}}},{"workshop":{"pots":[],"materials":null}},{"workshop":{"pots":[],"materials":{"蘊靈砂":-1}}},{"workshop":{"pots":[],"materials":{"蘊靈砂":0.5}}},{"workshop":{"pots":[],"materials":{"蘊靈砂":"1"}}},{"workshop":{"pots":[],"materials":{"蘊靈砂":2147483647}}}]'::jsonb) x LOOP
  UPDATE public.farm_v2_player_state SET warehouse_state=bad WHERE user_id=f::text;
  error_seen:=false;
  BEGIN PERFORM farm_v2_rewards.activity(f::text,'claim',100);
  EXCEPTION WHEN raise_exception THEN error_seen:=true; END;
  ASSERT error_seen,'corrupt inventory must fail closed';
  ASSERT (SELECT warehouse_state=bad FROM public.farm_v2_player_state WHERE user_id=f::text),'corrupt inventory must not be reset/replaced';
  ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_claim WHERE user_id=f::text AND milestone=100),'invalid inventory must not create receipt';
 END LOOP;
 UPDATE public.farm_v2_player_state SET warehouse_state=w_before WHERE user_id=f::text;
 ASSERT farm_v2_rewards.activity(f::text,'claim',100)->>'status'='claimed';
 -- Clamp bigint aggregate before converting back to bounded task integer progress.
 PERFORM public.farm_v2_record_activity_event(uid,'overflow-a','plant',2147483647,1);
 PERFORM public.farm_v2_record_activity_event(uid,'overflow-b','plant',2147483647,1);
 ASSERT farm_v2_rewards.activity(uid)->>'points'='120';
 INSERT INTO public.farm_v2_mutation(user_id,request_id,action,transaction_state,response)
 VALUES(uid,'bad-sow','SOW:1','COMPLETED','{"land":{"plantedQuantity":"not-a-number"}}'),
 (uid,'bad-seed','seed-purchase:1:1','COMPLETED','{"seedsAdded":null}'),
 (uid,'bad-command','WORKSHOP:{not-json','COMPLETED','{}'),
 (uid,'future-action','UNKNOWN:future-action','COMPLETED','{}');
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_activity_event WHERE user_id=uid AND transaction_id IN('bad-sow','bad-seed','bad-command','future-action')),'unknown/malformed historical action shapes must not block journal completion or create activity';
 RAISE NOTICE 'daily activity rollback assertions passed for synthetic user %',uid;
END $test$;
ROLLBACK;
