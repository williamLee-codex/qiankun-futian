BEGIN;
CREATE OR REPLACE FUNCTION farm_v2_rewards.signin(p_user_id text,p_action text,p_cycle_day integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_current jsonb; v_result jsonb; v_cycle integer; v_pending integer;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('status','claim','makeup','perfect') THEN
  RETURN jsonb_build_object('status','unknown_action');
 END IF;
 IF p_action='makeup' AND (p_cycle_day IS NULL OR p_cycle_day NOT BETWEEN 1 AND 30) THEN
  RETURN jsonb_build_object('status','invalid_cycle_day');
 END IF;
 IF p_action<>'makeup' AND p_cycle_day IS NOT NULL THEN
  RETURN jsonb_build_object('status','invalid_cycle_day');
 END IF;
 IF public.farm_v2_resolve_verified_wallet_owner(p_user_id) IS NULL THEN
  RETURN jsonb_build_object('status','unverified_identity');
 END IF;
 -- All reward writers honor the same warehouse reservation as gameplay recovery.
 PERFORM 1 FROM public.farm_v2_player_state WHERE user_id=p_user_id FOR UPDATE;
 IF p_action<>'status' AND EXISTS(
   SELECT 1 FROM public.farm_v2_mutation WHERE user_id=p_user_id
   AND transaction_state IN ('PENDING','WALLET_PENDING','WALLET_APPLIED','COMPENSATING')
   AND wallet_transaction->'assetPlan' IS NOT NULL
 ) THEN RETURN jsonb_build_object('status','recovery_required'); END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('farm_v2_signin:'||p_user_id,0));
 v_current:=public.farm_v2_signin_initialize(p_user_id);
 IF v_current->>'status'<>'ready' THEN RETURN v_current; END IF;
 v_cycle:=(v_current->>'cycleNumber')::integer;
 IF p_action='status' THEN
  v_pending:=public.farm_v2_signin_pending_perfect_cycle(p_user_id);
  RETURN public.farm_v2_signin_status(p_user_id)||jsonb_build_object(
   'pendingPerfectCycle',v_pending,'perfectAttendanceReady',v_pending IS NOT NULL);
 ELSIF p_action='claim' THEN
  RETURN public.farm_v2_signin_claim_day(p_user_id,v_cycle,(v_current->>'cycleDay')::integer);
 ELSIF p_action='makeup' THEN
  RETURN public.farm_v2_signin_makeup_day(p_user_id,v_cycle,p_cycle_day);
 END IF;
 v_pending:=public.farm_v2_signin_pending_perfect_cycle(p_user_id);
 IF v_pending IS NULL THEN RETURN jsonb_build_object('status','incomplete'); END IF;
 RETURN public.farm_v2_signin_claim_perfect(p_user_id,v_pending);
END; $$;

COMMIT;

