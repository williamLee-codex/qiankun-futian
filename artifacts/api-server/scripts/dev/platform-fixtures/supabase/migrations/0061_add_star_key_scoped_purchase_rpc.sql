BEGIN;

CREATE OR REPLACE FUNCTION public.star_key_purchase_scoped_unlock(
  p_owner_id uuid,
  p_subject_profile_id uuid,
  p_product_key text,
  p_scope_type text,
  p_scope_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform
AS $$
DECLARE
  v_product_key text := btrim(COALESCE(p_product_key, ''));
  v_scope_type text := btrim(COALESCE(p_scope_type, ''));
  v_scope_key text := btrim(COALESCE(p_scope_key, ''));
  v_canonical_subject_profile_id uuid := p_subject_profile_id;
  v_canonical_scope_key text := v_scope_key;
  v_price integer;
  v_existing platform.scoped_product_entitlements;
  v_wallet_result jsonb;
  v_wallet_status text;
  v_wallet_transaction_id uuid;
  v_entitlement_id uuid;
BEGIN
  IF p_owner_id IS NULL OR p_subject_profile_id IS NULL OR v_scope_key = '' THEN
    RETURN jsonb_build_object('result_status', 'invalid_request');
  END IF;

  IF v_product_key = 'annualDestinyFull' THEN
    v_price := 20;
    IF v_scope_type <> 'calendar_year' OR v_scope_key !~ '^[0-9]{4}$' THEN
      RETURN jsonb_build_object('result_status', 'invalid_scope');
    END IF;
  ELSIF v_product_key = 'relationshipSynastryDeep' THEN
    v_price := 24;
    IF v_scope_type <> 'subject_pair'
      OR v_scope_key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      OR v_scope_key = p_subject_profile_id::text THEN
      RETURN jsonb_build_object('result_status', 'invalid_scope');
    END IF;

    IF p_subject_profile_id::text <= v_scope_key THEN
      v_canonical_subject_profile_id := p_subject_profile_id;
      v_canonical_scope_key := v_scope_key;
    ELSE
      v_canonical_subject_profile_id := v_scope_key::uuid;
      v_canonical_scope_key := p_subject_profile_id::text;
    END IF;
  ELSE
    RETURN jsonb_build_object('result_status', 'invalid_product');
  END IF;

  -- Serialize all scoped purchases for one owner on the same wallet row.
  -- This closes the race between the pre-check and the wallet idempotency lookup:
  -- concurrent requests for the same canonical scope cannot both reach debit.
  PERFORM public.core_wallet_get_or_create(p_owner_id);
  PERFORM 1
  FROM public.core_wallets cw
  WHERE cw.owner_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Core wallet row missing for owner %', p_owner_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.subject_profiles sp
    WHERE sp.id = p_subject_profile_id
      AND sp.user_id = p_owner_id
      AND sp.is_archived = false
  ) THEN
    RETURN jsonb_build_object('result_status', 'subject_profile_not_found');
  END IF;

  IF v_scope_type = 'subject_pair' AND NOT EXISTS (
    SELECT 1 FROM public.subject_profiles sp
    WHERE sp.id = v_scope_key::uuid
      AND sp.user_id = p_owner_id
      AND sp.is_archived = false
  ) THEN
    RETURN jsonb_build_object('result_status', 'pair_profile_not_found');
  END IF;

  SELECT * INTO v_existing
  FROM platform.scoped_product_entitlements e
  WHERE e.owner_id = p_owner_id
    AND e.app_id = 'star-key'
    AND e.product_key = v_product_key
    AND e.subject_profile_id = v_canonical_subject_profile_id
    AND e.scope_type = v_scope_type
    AND e.scope_key = v_canonical_scope_key
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'result_status', 'duplicate',
      'entitlement_id', v_existing.id,
      'price_crystal', v_existing.cost_crystal
    );
  END IF;

  v_wallet_result := public.core_wallet_apply_transaction(
    p_owner_id,
    v_price,
    'crystal',
    'debit',
    format(
      'star-key:%s:%s:%s:%s:%s',
      v_product_key,
      p_owner_id,
      v_canonical_subject_profile_id,
      v_scope_type,
      v_canonical_scope_key
    ),
    CASE v_product_key
      WHEN 'annualDestinyFull' THEN '星穹密鑰・當年度全年大運完整分析'
      ELSE '星穹密鑰・雙人星座深度合盤'
    END,
    v_canonical_subject_profile_id::text,
    'star_key_scoped_unlock',
    NULL
  );

  v_wallet_status := v_wallet_result->>'result_status';

  IF v_wallet_status = 'insufficient_funds' THEN
    RETURN jsonb_build_object('result_status', 'insufficient_funds', 'price_crystal', v_price);
  END IF;

  IF v_wallet_status NOT IN ('created', 'duplicate') THEN
    RAISE EXCEPTION 'Unexpected core wallet result: %', COALESCE(v_wallet_status, '<null>');
  END IF;

  v_wallet_transaction_id := NULLIF(v_wallet_result->'transaction'->>'id', '')::uuid;
  IF v_wallet_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Core wallet transaction id missing';
  END IF;

  INSERT INTO platform.scoped_product_entitlements(
    owner_id, app_id, product_key, subject_profile_id, scope_type, scope_key,
    cost_crystal, wallet_transaction_id
  ) VALUES (
    p_owner_id, 'star-key', v_product_key, v_canonical_subject_profile_id, v_scope_type, v_canonical_scope_key,
    v_price, v_wallet_transaction_id
  )
  ON CONFLICT (owner_id, app_id, product_key, subject_profile_id, scope_type, scope_key)
  DO NOTHING
  RETURNING id INTO v_entitlement_id;

  IF v_entitlement_id IS NULL THEN
    SELECT id INTO v_entitlement_id
    FROM platform.scoped_product_entitlements e
    WHERE e.owner_id = p_owner_id
      AND e.app_id = 'star-key'
      AND e.product_key = v_product_key
      AND e.subject_profile_id = v_canonical_subject_profile_id
      AND e.scope_type = v_scope_type
      AND e.scope_key = v_canonical_scope_key;
  END IF;

  RETURN jsonb_build_object(
    'result_status', CASE WHEN v_wallet_status = 'duplicate' THEN 'duplicate' ELSE 'created' END,
    'entitlement_id', v_entitlement_id,
    'wallet_transaction_id', v_wallet_transaction_id,
    'price_crystal', v_price,
    'scope_type', v_scope_type,
    'subject_profile_id', v_canonical_subject_profile_id,
    'scope_key', v_canonical_scope_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.star_key_purchase_scoped_unlock(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.star_key_purchase_scoped_unlock(uuid, uuid, text, text, text)
  TO service_role;

COMMIT;
