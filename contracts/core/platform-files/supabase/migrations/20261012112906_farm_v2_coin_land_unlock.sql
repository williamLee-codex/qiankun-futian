-- Core-owned Farm V2 contract. Staged SQL, not an applied migration.
-- FINAL LAND-UNLOCK-001/003 and UNLOCK-ATOMIC-001.
-- The trusted server price mapping below implements Canonical Master RULES.LAND-UNLOCK-001.
BEGIN;
INSERT INTO platform.products(product_key,product_type,display_name,status) VALUES
 ('qiankun-futian:land:2','feature_unlock','幽熒沃土','active'),
 ('qiankun-futian:land:3','feature_unlock','朱砂烈土','active')
ON CONFLICT(product_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.farm_v2_purchase_coin_land(
 p_owner_id uuid, p_land_id smallint, p_request_id text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, platform, core AS $$
DECLARE
 v_user_id uuid;
 v_product_id uuid;
 v_entitlement platform.entitlements;
 v_entry public.core_wallet_ledger;
 v_wallet jsonb;
 v_wallet_status text;
 v_status text;
 v_cost integer;
 v_key text;
 v_ledger_key text;
 v_entitlement_id uuid;
 v_active_entitlement_id uuid;
 v_now timestamptz := now();
BEGIN
 IF p_owner_id IS NULL OR p_land_id IS NULL OR p_land_id NOT IN (2,3)
    OR p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$' THEN
  RETURN jsonb_build_object('result_status','invalid_request');
 END IF;
 SELECT id INTO v_user_id FROM core.users WHERE auth_user_id=p_owner_id AND status='active';
 IF v_user_id IS NULL THEN RETURN jsonb_build_object('result_status','identity_unavailable'); END IF;
 v_key := 'qiankun-futian:land:' || p_land_id::text;
 v_cost := CASE p_land_id WHEN 2 THEN 88 WHEN 3 THEN 888 END;
 v_ledger_key := 'farm-v2:coin-land-unlock:' || p_request_id;
 SELECT id INTO v_product_id FROM platform.products
 WHERE product_key=v_key AND product_type='feature_unlock' AND status='active';
 IF v_product_id IS NULL THEN RETURN jsonb_build_object('result_status','product_unavailable'); END IF;
 -- Serialize the owner's purchase against the real Core wallet row. The
 -- debit RPC locks the same row inside this transaction, not another database.
 PERFORM public.core_wallet_get_or_create(p_owner_id);
 PERFORM 1 FROM public.core_wallets WHERE owner_id=p_owner_id FOR UPDATE;
 SELECT * INTO v_entry FROM public.core_wallet_ledger
 WHERE owner_id=p_owner_id AND idempotency_key=v_ledger_key;
 IF FOUND AND (v_entry.reason <> 'farm_v2_land_unlock' OR v_entry.reference_type <> 'farm_v2_land_unlock'
   OR v_entry.reference_id <> v_key OR v_entry.amount <> v_cost OR v_entry.currency <> 'coin' OR v_entry.direction <> 'debit') THEN
  RETURN jsonb_build_object('result_status','duplicate_conflict');
 END IF;
 SELECT * INTO v_entitlement FROM platform.entitlements
 WHERE user_id=v_user_id AND product_id=v_product_id AND entitlement_type='lifetime'
 ORDER BY granted_at,id LIMIT 1;
 IF FOUND THEN
  SELECT id INTO v_active_entitlement_id FROM platform.entitlements
  WHERE user_id=v_user_id AND product_id=v_product_id AND entitlement_type='lifetime' AND status='active'
  ORDER BY granted_at,id LIMIT 1;
  RETURN jsonb_build_object('result_status',CASE WHEN v_active_entitlement_id IS NOT NULL THEN 'already_unlocked' ELSE 'entitlement_unavailable' END,'land_id',p_land_id,
    'unlocked_at',v_entitlement.granted_at,'entitlement_id',COALESCE(v_active_entitlement_id,v_entitlement.id),
    'cost',0,'wallet',public.core_wallet_get_or_create(p_owner_id));
 END IF;
 -- An existing debit without its permanent right is an integrity fault,
 -- never an excuse to charge again or to silently repair a partial state.
 IF v_entry.id IS NOT NULL THEN RAISE EXCEPTION 'CORE_FARM_V2_UNLOCK_INTEGRITY_ERROR'; END IF;
 IF p_land_id=3 AND NOT EXISTS (
  SELECT 1 FROM platform.entitlements e JOIN platform.products p ON p.id=e.product_id
  WHERE e.user_id=v_user_id AND p.product_key='qiankun-futian:land:2'
    AND e.entitlement_type='lifetime'
 ) THEN RETURN jsonb_build_object('result_status','land_2_required'); END IF;
 SELECT status INTO v_wallet_status FROM public.core_wallets WHERE owner_id=p_owner_id;
 IF v_wallet_status IS DISTINCT FROM 'active' THEN
  RETURN jsonb_build_object('result_status','wallet_unavailable');
 END IF;
 v_wallet := public.core_wallet_apply_transaction(p_owner_id,v_cost,'coin','debit',
  v_ledger_key,'farm_v2_land_unlock',v_key,'farm_v2_land_unlock',NULL);
 v_status := v_wallet->>'result_status';
 IF v_status='insufficient_funds' THEN RETURN jsonb_build_object('result_status',v_status); END IF;
 IF v_status NOT IN ('created','duplicate') OR v_status IS NULL THEN
  RAISE EXCEPTION 'CORE_FARM_V2_UNLOCK_WALLET_FAILED: %',v_status;
 END IF;
 INSERT INTO platform.entitlements(user_id,product_id,entitlement_type,status,granted_at)
 VALUES(v_user_id,v_product_id,'lifetime','active',v_now) RETURNING id INTO v_entitlement_id;
 INSERT INTO platform.entitlement_events(entitlement_id,event_type,source,reference_id)
 VALUES(v_entitlement_id,'granted','purchase',(v_wallet->'transaction'->>'id')::uuid);
 RETURN jsonb_build_object('result_status','created','land_id',p_land_id,
   'unlocked_at',v_now,'entitlement_id',v_entitlement_id,'cost',v_cost,
   'transaction',v_wallet->'transaction','wallet',v_wallet->'wallet');
END; $$;
REVOKE ALL ON FUNCTION public.farm_v2_purchase_coin_land(uuid,smallint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_purchase_coin_land(uuid,smallint,text) TO service_role;
GRANT USAGE ON SCHEMA core,platform TO service_role;
GRANT SELECT ON core.users,platform.products,public.core_wallet_ledger TO service_role;
GRANT SELECT,UPDATE ON public.core_wallets TO service_role;
GRANT SELECT,INSERT ON platform.entitlements TO service_role;
GRANT INSERT ON platform.entitlement_events TO service_role;

CREATE OR REPLACE FUNCTION public.farm_v2_coin_land_entitlements(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public, platform, core AS $$
DECLARE v_user_id uuid; v_lands jsonb;
BEGIN
 SELECT id INTO v_user_id FROM core.users WHERE auth_user_id=p_owner_id AND status='active';
 IF v_user_id IS NULL THEN RETURN jsonb_build_object('result_status','identity_unavailable'); END IF;
 SELECT jsonb_agg(jsonb_build_object(
   'landId',ids.land_id,
   'historicallyUnlocked',history.first_granted IS NOT NULL,
   'accessActive',COALESCE(history.active,false),
   'firstUnlockedAt',history.first_granted
 ) ORDER BY ids.land_id) INTO v_lands
 FROM (VALUES (2),(3)) ids(land_id)
 LEFT JOIN LATERAL (
   SELECT min(e.granted_at) AS first_granted, bool_or(e.status='active') AS active
   FROM platform.entitlements e JOIN platform.products p ON p.id=e.product_id
   WHERE e.user_id=v_user_id AND p.product_key='qiankun-futian:land:'||ids.land_id::text AND e.entitlement_type='lifetime'
 ) history ON true;
 RETURN jsonb_build_object('result_status','ok','lands',v_lands);
END; $$;
REVOKE ALL ON FUNCTION public.farm_v2_coin_land_entitlements(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_coin_land_entitlements(uuid) TO service_role;
COMMIT;
