BEGIN;
-- Tarot Miyu: stop selling the legacy question_5 and category_20 plans.
--
-- Applied with the switch to the new reading flow. Grants already issued stay
-- untouched and remain consumable, and a retry of a purchase request that was
-- already fulfilled still returns that grant, so no reader is left without the
-- quota they paid for.
CREATE OR REPLACE FUNCTION public.tarot_miyu_purchase_quota(
  p_owner_id uuid,
  p_purchase_request_id uuid,
  p_plan_code text,
  p_scope_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_price integer;
  v_uses integer;
  v_existing public.tarot_miyu_quota_grants%ROWTYPE;
  v_wallet jsonb;
  v_wallet_status text;
  v_wallet_transaction_id uuid;
  v_grant public.tarot_miyu_quota_grants%ROWTYPE;
  v_wallet_status_current text;
BEGIN
  IF p_owner_id IS NULL OR p_purchase_request_id IS NULL
    OR p_plan_code IS NULL OR p_scope_id IS NULL THEN
    RETURN jsonb_build_object('result_status', 'invalid_request');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tarot_miyu_purchase:' || p_owner_id::text || ':' || p_purchase_request_id::text, 0
  ));

  -- Retries resolve before plan validation: a request fulfilled under a plan
  -- that is no longer sold still returns the same grant, never an error.
  SELECT * INTO v_existing
  FROM public.tarot_miyu_quota_grants
  WHERE owner_id = p_owner_id AND purchase_request_id = p_purchase_request_id;

  IF FOUND THEN
    IF v_existing.plan_code <> p_plan_code OR v_existing.scope_id <> p_scope_id THEN
      RETURN jsonb_build_object('result_status', 'idempotency_conflict');
    END IF;
    RETURN jsonb_build_object(
      'result_status', 'duplicate', 'grant_id', v_existing.id,
      'wallet_transaction_id', v_existing.wallet_transaction_id,
      'granted_uses', v_existing.granted_uses,
      'remaining_uses', v_existing.granted_uses - v_existing.consumed_uses
    );
  END IF;

  IF p_plan_code = 'subcategory_5'
     AND EXISTS (SELECT 1 FROM public.tarot_miyu_subcategories WHERE id = p_scope_id) THEN
    v_price := 6; v_uses := 5;
  ELSIF p_plan_code = 'major_20'
     AND EXISTS (SELECT 1 FROM public.tarot_miyu_majors WHERE id = p_scope_id) THEN
    v_price := 18; v_uses := 20;
  ELSIF p_plan_code = 'all_40' AND p_scope_id = 'all' THEN
    v_price := 30; v_uses := 40;
  ELSE
    RETURN jsonb_build_object('result_status', 'invalid_plan_or_scope');
  END IF;

  PERFORM public.core_wallet_get_or_create(p_owner_id);
  SELECT status INTO v_wallet_status_current
  FROM public.core_wallets WHERE owner_id = p_owner_id FOR UPDATE;
  IF v_wallet_status_current IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('result_status', 'wallet_not_active');
  END IF;

  v_wallet := public.core_wallet_apply_transaction(
    p_owner_id, v_price, 'crystal', 'debit',
    'tarot-miyu-quota:' || p_owner_id::text || ':' || p_purchase_request_id::text,
    '塔羅秘語深度解析額度', p_purchase_request_id::text, 'tarot_miyu_quota_purchase', NULL
  );
  v_wallet_status := v_wallet->>'result_status';

  IF v_wallet_status = 'insufficient_funds' THEN
    RETURN jsonb_build_object('result_status', 'insufficient_funds');
  END IF;
  IF v_wallet_status <> 'created' THEN
    RAISE EXCEPTION 'TAROT_WALLET_GRANT_INCONSISTENT: %', v_wallet_status;
  END IF;

  v_wallet_transaction_id := NULLIF(v_wallet->'transaction'->>'id', '')::uuid;
  IF v_wallet_transaction_id IS NULL THEN
    RAISE EXCEPTION 'TAROT_WALLET_TRANSACTION_MISSING';
  END IF;

  INSERT INTO public.tarot_miyu_quota_grants (
    owner_id, purchase_request_id, plan_code, scope_id,
    granted_uses, price_crystal, wallet_transaction_id
  ) VALUES (
    p_owner_id, p_purchase_request_id, p_plan_code, p_scope_id,
    v_uses, v_price, v_wallet_transaction_id
  ) RETURNING * INTO v_grant;

  RETURN jsonb_build_object(
    'result_status', 'created', 'grant_id', v_grant.id,
    'wallet_transaction_id', v_wallet_transaction_id,
    'granted_uses', v_uses, 'remaining_uses', v_uses,
    'price_crystal', v_price
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tarot_miyu_purchase_quota(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tarot_miyu_purchase_quota(uuid, uuid, text, text)
  TO service_role;

COMMIT;
