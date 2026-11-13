BEGIN;
-- Synthetic account and rewards must be rolled back by the acceptance harness.
DO $test$
DECLARE u uuid:=gen_random_uuid(); template text; r jsonb; before_count integer;
BEGIN
 SELECT p.user_id INTO template FROM public.farm_v2_player_state p
 WHERE public.farm_v2_resolve_verified_wallet_owner(p.user_id) IS NOT NULL LIMIT 1;
 ASSERT template IS NOT NULL,'verified template required';
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO public.farm_v2_player_state(user_id,access_state,warehouse_state,mission_state,pet_state,farmer_state)
 SELECT u::text,access_state,warehouse_state,mission_state,pet_state,farmer_state FROM public.farm_v2_player_state WHERE user_id=template;
 ASSERT public.farm_v2_resolve_verified_wallet_owner(u::text) IS NULL,'missing wallet must fail closed';
 PERFORM public.core_wallet_get_or_create(u);
 UPDATE public.core_wallets SET status='suspended' WHERE owner_id=u;
 ASSERT public.farm_v2_resolve_verified_wallet_owner(u::text) IS NULL,'suspended wallet forbidden';
 UPDATE public.core_wallets SET status='active' WHERE owner_id=u;
 UPDATE auth.users SET banned_until=now()+interval '1 day' WHERE id=u;
 ASSERT public.farm_v2_resolve_verified_wallet_owner(u::text) IS NULL,'banned identity forbidden';
 UPDATE auth.users SET banned_until=NULL WHERE id=u;
 ASSERT public.farm_v2_resolve_verified_wallet_owner(u::text)=u,'canonical active owner';
 SELECT count(*) INTO before_count FROM public.core_wallet_ledger WHERE owner_id=u;
 EXECUTE 'SET LOCAL ROLE farm_v2_runtime';
 r:=farm_v2_rewards.signin(u::text,'status',NULL);
 ASSERT r->>'status'='ready' AND r->>'cycleDay'='1','runtime status initializes day one';
 r:=farm_v2_rewards.signin(u::text,'claim',NULL);
 ASSERT r->>'status'='claimed' AND r->>'coins'='10','runtime gets server-computed day one reward';
 r:=farm_v2_rewards.signin(u::text,'claim',NULL);
 ASSERT r->>'status'='already_signed','runtime duplicate prevented';
 BEGIN
  PERFORM public.farm_v2_signin_claim_day(u::text,1,1);
  RAISE EXCEPTION 'runtime bypass allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.core_wallet_apply_transaction(u,100,'coin','credit','bypass','bypass','bypass','bypass',NULL);
  RAISE EXCEPTION 'raw wallet bypass allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 EXECUTE 'RESET ROLE';
 ASSERT (SELECT count(*) FROM public.core_wallet_ledger WHERE owner_id=u)=before_count+1,'one reward ledger entry only';
 ASSERT (SELECT coin_balance FROM public.core_wallets WHERE owner_id=u)=10,'exact reward balance';
END $test$;

ROLLBACK;
