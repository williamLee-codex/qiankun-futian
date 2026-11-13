-- Read-only deployment and privilege contract, with no player mutations.
DO $test$
BEGIN
 IF to_regprocedure('farm_v2_rewards.signin(text,text,integer)') IS NULL THEN RAISE EXCEPTION 'SIGNIN_DEPLOYMENT_CONTRACT_MISSING'; END IF;
 ASSERT has_function_privilege('farm_v2_runtime','farm_v2_rewards.signin(text,text,integer)','EXECUTE'),'runtime needs restricted entrypoint';
 ASSERT NOT has_function_privilege('anon','farm_v2_rewards.signin(text,text,integer)','EXECUTE'),'anonymous forbidden';
 ASSERT NOT has_function_privilege('authenticated','farm_v2_rewards.signin(text,text,integer)','EXECUTE'),'browser forbidden';
 ASSERT NOT has_function_privilege('farm_v2_runtime','public.core_wallet_apply_transaction(uuid,integer,text,text,text,text,text,text,uuid)','EXECUTE'),'raw wallet remains forbidden';
 ASSERT NOT has_function_privilege('farm_v2_runtime','public.farm_v2_signin_claim_day(text,integer,integer)','EXECUTE'),'runtime cannot bypass the capability';
 ASSERT farm_v2_rewards.signin('invalid','claim',NULL)->>'status'='unverified_identity','invalid identity';
 ASSERT farm_v2_rewards.signin('invalid','arbitrary',NULL)->>'status'='unknown_action','fixed actions only';
 ASSERT farm_v2_rewards.signin('invalid','makeup',0)->>'status'='invalid_cycle_day','invalid makeup day';
 ASSERT farm_v2_rewards.signin('invalid','claim',30)->>'status'='invalid_cycle_day','claim date is server-owned';
END $test$;
