BEGIN;
DO $signin_guard_test$
DECLARE u uuid:=gen_random_uuid(); r jsonb;
BEGIN
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO public.farm_v2_player_state(user_id,access_state,warehouse_state,mission_state,pet_state,farmer_state)
 SELECT u::text,access_state,warehouse_state,mission_state,pet_state,farmer_state FROM public.farm_v2_player_state WHERE public.farm_v2_resolve_verified_wallet_owner(user_id) IS NOT NULL LIMIT 1;
 PERFORM public.core_wallet_get_or_create(u);
 INSERT INTO public.farm_v2_mutation(user_id,request_id,action,transaction_state,wallet_transaction)
 VALUES(u::text,'signin-reservation','WORKSHOP:{"kind":"synthesize"}','PENDING','{"assetPlan":{}}');
 r:=farm_v2_rewards.signin(u::text,'status',NULL);
 ASSERT r->>'status'='ready','read status must stay available';
 r:=farm_v2_rewards.signin(u::text,'claim',NULL);
 ASSERT r->>'status'='recovery_required','claim must preserve reserved inventory';
 ASSERT NOT EXISTS(SELECT 1 FROM public.farm_v2_signin_days WHERE user_id=u::text),'blocked claim must not sign';
 ASSERT (SELECT coin_balance FROM public.core_wallets WHERE owner_id=u)=0,'blocked claim must not credit';
 UPDATE public.farm_v2_mutation SET transaction_state='COMPENSATED' WHERE user_id=u::text AND request_id='signin-reservation';
 r:=farm_v2_rewards.signin(u::text,'claim',NULL);
 ASSERT r->>'status'='claimed','resolved reservation permits claim';
 ASSERT (SELECT coin_balance FROM public.core_wallets WHERE owner_id=u)=10,'resolved claim credits once';
END $signin_guard_test$;
ROLLBACK;
