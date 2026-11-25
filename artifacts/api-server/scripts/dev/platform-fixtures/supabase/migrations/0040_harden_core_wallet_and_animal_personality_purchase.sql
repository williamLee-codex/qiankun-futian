BEGIN;

REVOKE ALL ON FUNCTION public.core_wallet_get_or_create(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.core_wallet_apply_transaction(uuid, integer, text, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.core_wallet_find_transaction(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.core_wallet_list_transactions(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.core_wallet_get_or_create(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.core_wallet_apply_transaction(uuid, integer, text, text, text, text, text, text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.core_wallet_find_transaction(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.core_wallet_list_transactions(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.animal_personality_purchase_unlock(
  p_owner_id uuid,
  p_attempt_id uuid,
  p_version text,
  p_v4_report jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform, core
AS $$
DECLARE
  v_version text := upper(btrim(COALESCE(p_version, '')));
  v_product_key text;
  v_price integer;
  v_product_id uuid;
  v_entitlement_id uuid;
  v_existing_entitlement platform.entitlements;
  v_attempt public.quiz_attempts;
  v_result public.animal_personality_results;
  v_wallet_result jsonb;
  v_wallet_status text;
  v_wallet_transaction_id uuid;
  v_unlocked_at timestamptz := now();
  v_v3_product_id uuid;
BEGIN
  IF p_owner_id IS NULL OR p_attempt_id IS NULL OR v_version NOT IN ('V3', 'V4') THEN
    RETURN jsonb_build_object('result_status', 'invalid_request');
  END IF;

  v_product_key := CASE v_version
    WHEN 'V3' THEN 'animal_personality_v3'
    WHEN 'V4' THEN 'animal_personality_v4'
  END;
  v_price := CASE v_version WHEN 'V3' THEN 5 WHEN 'V4' THEN 10 END;

  SELECT qa.*
    INTO v_attempt
  FROM public.quiz_attempts qa
  JOIN public.quiz_definitions qd ON qd.id = qa.quiz_id
  WHERE qa.id = p_attempt_id
    AND qa.owner_id = p_owner_id
    AND qa.status = 'completed'
    AND qd.slug = 'animal-personality'
  FOR UPDATE OF qa;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status', 'invalid_attempt');
  END IF;

  SELECT *
    INTO v_result
  FROM public.animal_personality_results apr
  WHERE apr.attempt_id = p_attempt_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status', 'prerequisite_missing');
  END IF;

  SELECT p.id
    INTO v_product_id
  FROM platform.products p
  WHERE p.product_key = v_product_key
    AND p.status = 'active';

  IF v_product_id IS NULL THEN
    RETURN jsonb_build_object('result_status', 'product_unavailable');
  END IF;

  SELECT e.*
    INTO v_existing_entitlement
  FROM platform.entitlements e
  WHERE e.user_id = p_owner_id
    AND e.product_id = v_product_id
    AND e.entitlement_type = 'scoped_lifetime'
    AND e.scope_type = 'quiz_attempt'
    AND e.scope_id = p_attempt_id
    AND e.status IN ('active', 'trialing', 'suspended')
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'result_status', 'duplicate',
      'version', v_version,
      'price_crystal', v_price,
      'entitlement_id', v_existing_entitlement.id,
      'attempt_id', p_attempt_id
    );
  END IF;

  IF v_version = 'V3' THEN
    IF v_result.v2_profile_id IS NULL THEN
      RETURN jsonb_build_object('result_status', 'prerequisite_missing');
    END IF;
  ELSE
    IF v_result.v3_dominant_trait_id IS NULL OR v_result.v3_dimension_scores IS NULL THEN
      RETURN jsonb_build_object('result_status', 'prerequisite_missing');
    END IF;

    SELECT p.id
      INTO v_v3_product_id
    FROM platform.products p
    WHERE p.product_key = 'animal_personality_v3'
      AND p.status = 'active';

    IF v_v3_product_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM platform.entitlements e
      WHERE e.user_id = p_owner_id
        AND e.product_id = v_v3_product_id
        AND e.entitlement_type = 'scoped_lifetime'
        AND e.scope_type = 'quiz_attempt'
        AND e.scope_id = p_attempt_id
        AND e.status IN ('active', 'trialing', 'suspended')
    ) THEN
      RETURN jsonb_build_object('result_status', 'prerequisite_missing');
    END IF;

    IF p_v4_report IS NULL
      OR NULLIF(btrim(p_v4_report->>'report_version'), '') IS NULL
      OR NULLIF(btrim(p_v4_report->>'display_title'), '') IS NULL
      OR jsonb_typeof(p_v4_report->'selected_module_ids') IS DISTINCT FROM 'array'
      OR jsonb_typeof(p_v4_report->'sections') IS DISTINCT FROM 'array'
      OR NULLIF(btrim(p_v4_report->>'share_summary'), '') IS NULL
      OR NULLIF(btrim(p_v4_report->>'content_hash'), '') IS NULL THEN
      RETURN jsonb_build_object('result_status', 'v4_report_required');
    END IF;
  END IF;

  v_wallet_result := public.core_wallet_apply_transaction(
    p_owner_id,
    v_price,
    'crystal',
    'debit',
    format('animal-personality:%s:%s:%s', lower(v_version), p_owner_id, p_attempt_id),
    CASE v_version
      WHEN 'V3' THEN '動物人格 V3 性格傾向解鎖'
      ELSE '動物人格 V4 全解析解鎖'
    END,
    p_attempt_id::text,
    format('animal_personality_%s_unlock', lower(v_version)),
    NULL
  );

  v_wallet_status := v_wallet_result->>'result_status';

  IF v_wallet_status = 'insufficient_funds' THEN
    RETURN jsonb_build_object(
      'result_status', 'insufficient_funds',
      'version', v_version,
      'price_crystal', v_price,
      'attempt_id', p_attempt_id
    );
  END IF;

  IF v_wallet_status NOT IN ('created', 'duplicate') THEN
    RAISE EXCEPTION 'Unexpected core wallet result: %', COALESCE(v_wallet_status, '<null>');
  END IF;

  v_wallet_transaction_id := NULLIF(v_wallet_result->'transaction'->>'id', '')::uuid;
  IF v_wallet_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Core wallet transaction id missing';
  END IF;

  INSERT INTO platform.entitlements(
    user_id,
    product_id,
    entitlement_type,
    status,
    granted_at,
    scope_type,
    scope_id
  ) VALUES (
    p_owner_id,
    v_product_id,
    'scoped_lifetime',
    'active',
    v_unlocked_at,
    'quiz_attempt',
    p_attempt_id
  )
  RETURNING id INTO v_entitlement_id;

  INSERT INTO platform.entitlement_events(
    entitlement_id,
    event_type,
    source,
    reference_id
  ) VALUES (
    v_entitlement_id,
    'granted',
    'purchase',
    v_wallet_transaction_id
  );

  IF v_version = 'V4' THEN
    INSERT INTO public.animal_personality_v4_reports(
      attempt_id,
      entitlement_id,
      wallet_transaction_id,
      report_version,
      scoring_version,
      display_title,
      v2_profile_id,
      dominant_trait_id,
      secondary_trait_id,
      dimension_scores,
      stability_label,
      pressure_shift,
      selected_module_ids,
      sections,
      share_summary,
      content_hash,
      price_paid_crystal,
      unlocked_at,
      generated_at
    ) VALUES (
      p_attempt_id,
      v_entitlement_id,
      v_wallet_transaction_id,
      p_v4_report->>'report_version',
      COALESCE(v_result.v3_scoring_version, 'V3_SCORING_v1.0'),
      p_v4_report->>'display_title',
      v_result.v2_profile_id,
      v_result.v3_dominant_trait_id,
      v_result.v3_secondary_trait_id,
      v_result.v3_dimension_scores,
      COALESCE(v_result.v3_stability_label, '情境差異明顯'),
      p_v4_report->'pressure_shift',
      p_v4_report->'selected_module_ids',
      p_v4_report->'sections',
      p_v4_report->>'share_summary',
      p_v4_report->>'content_hash',
      v_price,
      v_unlocked_at,
      v_unlocked_at
    );
  END IF;

  RETURN jsonb_build_object(
    'result_status', 'created',
    'version', v_version,
    'price_crystal', v_price,
    'entitlement_id', v_entitlement_id,
    'wallet_transaction_id', v_wallet_transaction_id,
    'attempt_id', p_attempt_id,
    'unlocked_at', v_unlocked_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.animal_personality_purchase_unlock(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.animal_personality_purchase_unlock(uuid, uuid, text, jsonb) TO service_role;

COMMIT;
