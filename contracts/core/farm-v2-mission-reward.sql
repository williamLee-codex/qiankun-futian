-- Core-owned Farm V2 mission reward contract. Staged SQL, not an applied migration.
-- The amount allowlist implements the canonical mission reward table.
BEGIN;
CREATE OR REPLACE FUNCTION public.farm_v2_claim_mission_reward(
  p_owner_id uuid,
  p_mission_id text,
  p_request_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, core AS $$
DECLARE
  v_user_id uuid;
  v_user_status text;
  v_wallet public.core_wallets;
  v_entry public.core_wallet_ledger;
  v_amount integer;
  v_idempotency_key text;
  v_result jsonb;
BEGIN
  IF p_owner_id IS NULL
    OR p_mission_id IS NULL
    OR p_mission_id NOT IN (
      'MISSION_D01','MISSION_D02','MISSION_D03','MISSION_D04',
      'MISSION_W01','MISSION_W02','MISSION_W03','MISSION_W04'
    )
    OR p_request_id IS NULL
    OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$' THEN
    RETURN jsonb_build_object('result_status','invalid_request');
  END IF;

  SELECT id, status INTO v_user_id, v_user_status
  FROM core.users
  WHERE auth_user_id = p_owner_id;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('result_status','identity_unavailable');
  END IF;

  v_amount := CASE p_mission_id
    WHEN 'MISSION_D01' THEN 2
    WHEN 'MISSION_D02' THEN 3
    WHEN 'MISSION_D03' THEN 3
    WHEN 'MISSION_D04' THEN 5
    WHEN 'MISSION_W01' THEN 10
    WHEN 'MISSION_W02' THEN 15
    WHEN 'MISSION_W03' THEN 15
    WHEN 'MISSION_W04' THEN 20
  END;
  v_idempotency_key := 'farm-v2:mission-claim:' || p_request_id;

  PERFORM public.core_wallet_get_or_create(p_owner_id);
  SELECT * INTO v_wallet
  FROM public.core_wallets
  WHERE owner_id = p_owner_id
  FOR UPDATE;

  SELECT * INTO v_entry
  FROM public.core_wallet_ledger
  WHERE owner_id = p_owner_id AND idempotency_key = v_idempotency_key;
  IF FOUND THEN
    IF v_entry.reason <> 'farm_v2_mission_reward'
      OR v_entry.reference_type <> 'farm_v2_mission_reward'
      OR v_entry.reference_id <> p_mission_id
      OR v_entry.amount <> v_amount
      OR v_entry.currency <> 'coin'
      OR v_entry.direction <> 'credit' THEN
      RETURN jsonb_build_object('result_status','duplicate_conflict');
    END IF;
    RETURN jsonb_build_object(
      'result_status','duplicate',
      'mission_id',p_mission_id,
      'amount',v_amount,
      'transaction',to_jsonb(v_entry),
      'wallet',public.core_wallet_get_or_create(p_owner_id)
    );
  END IF;

  -- A replay must return its prior receipt even if the identity was later
  -- suspended. Only a new credit requires an active identity.
  IF v_user_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('result_status','identity_unavailable');
  END IF;

  IF v_wallet.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('result_status','wallet_unavailable');
  END IF;

  v_result := public.core_wallet_apply_transaction(
    p_owner_id,
    v_amount,
    'coin',
    'credit',
    v_idempotency_key,
    'farm_v2_mission_reward',
    p_mission_id,
    'farm_v2_mission_reward',
    NULL
  );
  IF COALESCE(v_result->>'result_status','') NOT IN ('created','duplicate') THEN
    RAISE EXCEPTION 'CORE_FARM_V2_MISSION_REWARD_WALLET_FAILED: %', v_result->>'result_status';
  END IF;

  RETURN jsonb_build_object(
    'result_status','created',
    'mission_id',p_mission_id,
    'amount',v_amount,
    'transaction',v_result->'transaction',
    'wallet',v_result->'wallet'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.farm_v2_claim_mission_reward(uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_claim_mission_reward(uuid,text,text)
  TO service_role;
GRANT USAGE ON SCHEMA core TO service_role;
GRANT SELECT ON core.users, public.core_wallet_ledger TO service_role;
GRANT SELECT, UPDATE ON public.core_wallets TO service_role;
COMMIT;
