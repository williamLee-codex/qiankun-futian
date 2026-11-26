BEGIN;

ALTER TABLE public.animal_personality_results
  ADD COLUMN IF NOT EXISTS v1_response_quality_flag text,
  ADD COLUMN IF NOT EXISTS v1_profile_structure text,
  ADD COLUMN IF NOT EXISTS v1_chameleon_pattern text,
  ADD COLUMN IF NOT EXISTS v1_strength_tier text,
  ADD COLUMN IF NOT EXISTS v1_metrics jsonb,
  ADD COLUMN IF NOT EXISTS v1_axis_a jsonb,
  ADD COLUMN IF NOT EXISTS v1_axis_b jsonb,
  ADD COLUMN IF NOT EXISTS v2_resolved_display_name text,
  ADD COLUMN IF NOT EXISTS display_title text;

ALTER TABLE public.animal_personality_v4_reports
  ALTER COLUMN v2_profile_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'animal_personality_results_v1_quality_check') THEN
    ALTER TABLE public.animal_personality_results
      ADD CONSTRAINT animal_personality_results_v1_quality_check
      CHECK (v1_response_quality_flag IS NULL OR v1_response_quality_flag IN ('SUFFICIENT','LOW_CONFIDENCE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'animal_personality_results_v1_structure_check') THEN
    ALTER TABLE public.animal_personality_results
      ADD CONSTRAINT animal_personality_results_v1_structure_check
      CHECK (v1_profile_structure IS NULL OR v1_profile_structure IN ('BALANCED','SINGLE_CORE','DUAL_CORE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'animal_personality_results_v1_chameleon_pattern_check') THEN
    ALTER TABLE public.animal_personality_results
      ADD CONSTRAINT animal_personality_results_v1_chameleon_pattern_check
      CHECK (v1_chameleon_pattern IS NULL OR v1_chameleon_pattern IN ('BALANCED_GENERALIST','CONTEXT_SWITCH'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'animal_personality_results_v1_strength_check') THEN
    ALTER TABLE public.animal_personality_results
      ADD CONSTRAINT animal_personality_results_v1_strength_check
      CHECK (v1_strength_tier IS NULL OR v1_strength_tier IN ('STANDARD','STRONG','EXTREME'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'animal_personality_results_v1_metrics_object_check') THEN
    ALTER TABLE public.animal_personality_results
      ADD CONSTRAINT animal_personality_results_v1_metrics_object_check
      CHECK (v1_metrics IS NULL OR jsonb_typeof(v1_metrics) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'animal_personality_results_v1_axis_a_object_check') THEN
    ALTER TABLE public.animal_personality_results
      ADD CONSTRAINT animal_personality_results_v1_axis_a_object_check
      CHECK (v1_axis_a IS NULL OR jsonb_typeof(v1_axis_a) = 'object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'animal_personality_results_v1_axis_b_object_check') THEN
    ALTER TABLE public.animal_personality_results
      ADD CONSTRAINT animal_personality_results_v1_axis_b_object_check
      CHECK (v1_axis_b IS NULL OR jsonb_typeof(v1_axis_b) = 'object');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.animal_personality_complete_attempt(
  p_owner_id uuid,
  p_attempt_id uuid,
  p_attempt_payload jsonb,
  p_result_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform, core
AS $$
DECLARE
  v_attempt public.quiz_attempts;
BEGIN
  SELECT qa.* INTO v_attempt
  FROM public.quiz_attempts qa
  JOIN public.quiz_definitions qd ON qd.id = qa.quiz_id
  WHERE qa.id = p_attempt_id
    AND qa.status = 'started'
    AND qd.slug = 'animal-personality'
    AND qa.owner_id IS NOT DISTINCT FROM p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status','invalid_attempt');
  END IF;

  INSERT INTO public.animal_personality_results(
    attempt_id, assessment_version,
    v1_result_version, v1_primary_type, v1_core_scores, v1_chameleon_flag,
    v1_response_quality_flag, v1_profile_structure, v1_chameleon_pattern, v1_strength_tier,
    v1_metrics, v1_axis_a, v1_axis_b,
    v2_version, v2_profile_id, v2_display_name, v2_resolved_display_name,
    v2_primary_animal, v2_secondary_animal, v2_profile_kind,
    display_title
  ) VALUES (
    p_attempt_id,
    coalesce(p_result_payload->>'assessment_version','V1.0'),
    p_result_payload->>'v1_result_version',
    p_result_payload#>>'{v1,primary_type}',
    p_result_payload#>'{v1,core_scores}',
    coalesce((p_result_payload#>>'{v1,is_chameleon}')::boolean,false),
    p_result_payload#>>'{v1,response_quality_flag}',
    p_result_payload#>>'{v1,profile_structure}',
    p_result_payload#>>'{v1,chameleon_pattern}',
    p_result_payload#>>'{v1,strength_tier}',
    p_result_payload#>'{v1,metrics}',
    p_result_payload#>'{v1,axis_a}',
    p_result_payload#>'{v1,axis_b}',
    p_result_payload->>'v2_version',
    p_result_payload#>>'{v2,profile_id}',
    p_result_payload#>>'{v2,display_name}',
    coalesce(p_result_payload#>>'{v2,resolved_display_name}', p_result_payload#>>'{v2,display_name}'),
    p_result_payload#>>'{v2,primary_animal}',
    p_result_payload#>>'{v2,secondary_animal}',
    p_result_payload#>>'{v2,profile_kind}',
    p_result_payload->>'display_title'
  )
  ON CONFLICT (attempt_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status','duplicate');
  END IF;

  UPDATE public.quiz_attempts
  SET status = 'completed',
      private_response = p_attempt_payload->'private_response',
      primary_result_id = p_result_payload#>>'{v1,primary_type}',
      secondary_result_id = p_result_payload#>>'{v2,profile_id}',
      completed_at = now()
  WHERE id = p_attempt_id
    AND status = 'started';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ANIMAL_PERSONALITY_ATTEMPT_STATE_CHANGED';
  END IF;

  RETURN jsonb_build_object(
    'result_status','completed',
    'attempt_id',p_attempt_id,
    'v1_primary_type',p_result_payload#>>'{v1,primary_type}',
    'v2_profile_id',p_result_payload#>>'{v2,profile_id}',
    'display_title',p_result_payload->>'display_title'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.animal_personality_complete_attempt(uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.animal_personality_complete_attempt(uuid,uuid,jsonb,jsonb) TO service_role;

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
  v_core_user_id uuid;
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

  SELECT qa.* INTO v_attempt
  FROM public.quiz_attempts qa
  JOIN public.quiz_definitions qd ON qd.id = qa.quiz_id
  WHERE qa.id = p_attempt_id
    AND qa.owner_id = p_owner_id
    AND qa.status = 'completed'
    AND qd.slug = 'animal-personality'
  FOR UPDATE OF qa;

  IF NOT FOUND THEN RETURN jsonb_build_object('result_status', 'invalid_attempt'); END IF;

  SELECT * INTO v_result
  FROM public.animal_personality_results apr
  WHERE apr.attempt_id = p_attempt_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('result_status', 'prerequisite_missing'); END IF;

  SELECT cu.id INTO v_core_user_id
  FROM core.users cu
  WHERE cu.auth_user_id = p_owner_id AND cu.status = 'active'
  LIMIT 1;

  SELECT p.id INTO v_product_id
  FROM platform.products p
  WHERE p.product_key = v_product_key AND p.status = 'active';

  IF v_product_id IS NULL THEN RETURN jsonb_build_object('result_status', 'product_unavailable'); END IF;

  IF v_core_user_id IS NOT NULL THEN
    SELECT e.* INTO v_existing_entitlement
    FROM platform.entitlements e
    WHERE e.user_id = v_core_user_id
      AND e.product_id = v_product_id
      AND e.entitlement_type = 'scoped_lifetime'
      AND e.scope_type = 'quiz_attempt'
      AND e.scope_id = p_attempt_id
      AND e.status IN ('active', 'trialing', 'suspended')
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object('result_status','duplicate','version',v_version,'price_crystal',v_price,'entitlement_id',v_existing_entitlement.id,'attempt_id',p_attempt_id);
    END IF;
  END IF;

  IF v_version = 'V3' THEN
    IF v_result.v1_primary_type IS NULL
      OR v_result.v1_profile_structure IS NULL
      OR (v_result.v1_primary_type <> 'Chameleon' AND v_result.v2_profile_id IS NULL) THEN
      RETURN jsonb_build_object('result_status', 'prerequisite_missing');
    END IF;
  ELSE
    IF v_result.v3_dominant_trait_id IS NULL OR v_result.v3_dimension_scores IS NULL THEN
      RETURN jsonb_build_object('result_status', 'prerequisite_missing');
    END IF;

    SELECT p.id INTO v_v3_product_id
    FROM platform.products p
    WHERE p.product_key = 'animal_personality_v3' AND p.status = 'active';

    IF v_core_user_id IS NULL OR v_v3_product_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM platform.entitlements e
      WHERE e.user_id = v_core_user_id
        AND e.product_id = v_v3_product_id
        AND e.entitlement_type = 'scoped_lifetime'
        AND e.scope_type = 'quiz_attempt'
        AND e.scope_id = p_attempt_id
        AND e.status IN ('active', 'trialing', 'suspended')
    ) THEN RETURN jsonb_build_object('result_status', 'prerequisite_missing'); END IF;

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
    p_owner_id, v_price, 'crystal', 'debit',
    format('animal-personality:%s:%s:%s', lower(v_version), p_owner_id, p_attempt_id),
    CASE v_version WHEN 'V3' THEN '動物人格 V3 性格傾向解鎖' ELSE '動物人格 V4 全解析解鎖' END,
    p_attempt_id::text, format('animal_personality_%s_unlock', lower(v_version)), NULL
  );

  v_wallet_status := v_wallet_result->>'result_status';
  IF v_wallet_status = 'insufficient_funds' THEN
    RETURN jsonb_build_object('result_status','insufficient_funds','version',v_version,'price_crystal',v_price,'attempt_id',p_attempt_id);
  END IF;
  IF v_wallet_status NOT IN ('created', 'duplicate') THEN
    RAISE EXCEPTION 'Unexpected core wallet result: %', COALESCE(v_wallet_status, '<null>');
  END IF;

  v_wallet_transaction_id := NULLIF(v_wallet_result->'transaction'->>'id', '')::uuid;
  IF v_wallet_transaction_id IS NULL THEN RAISE EXCEPTION 'Core wallet transaction id missing'; END IF;

  IF v_core_user_id IS NULL THEN
    INSERT INTO core.users(auth_user_id, status)
    VALUES (p_owner_id, 'active')
    ON CONFLICT (auth_user_id) DO UPDATE SET auth_user_id = EXCLUDED.auth_user_id
    RETURNING id INTO v_core_user_id;
  END IF;

  INSERT INTO platform.entitlements(user_id,product_id,entitlement_type,status,granted_at,scope_type,scope_id)
  VALUES (v_core_user_id,v_product_id,'scoped_lifetime','active',v_unlocked_at,'quiz_attempt',p_attempt_id)
  RETURNING id INTO v_entitlement_id;

  INSERT INTO platform.entitlement_events(entitlement_id,event_type,source,reference_id)
  VALUES (v_entitlement_id,'granted','purchase',v_wallet_transaction_id);

  IF v_version = 'V4' THEN
    INSERT INTO public.animal_personality_v4_reports(
      attempt_id,entitlement_id,wallet_transaction_id,report_version,scoring_version,display_title,
      v2_profile_id,dominant_trait_id,secondary_trait_id,dimension_scores,stability_label,pressure_shift,
      selected_module_ids,sections,share_summary,content_hash,price_paid_crystal,unlocked_at,generated_at
    ) VALUES (
      p_attempt_id,v_entitlement_id,v_wallet_transaction_id,p_v4_report->>'report_version',
      COALESCE(v_result.v3_scoring_version,'V3_SCORING_v1.0'),p_v4_report->>'display_title',v_result.v2_profile_id,
      v_result.v3_dominant_trait_id,v_result.v3_secondary_trait_id,v_result.v3_dimension_scores,
      COALESCE(v_result.v3_stability_label,'情境差異明顯'),p_v4_report->'pressure_shift',
      p_v4_report->'selected_module_ids',p_v4_report->'sections',p_v4_report->>'share_summary',
      p_v4_report->>'content_hash',v_price,v_unlocked_at,v_unlocked_at
    );
  END IF;

  RETURN jsonb_build_object('result_status','created','version',v_version,'price_crystal',v_price,'entitlement_id',v_entitlement_id,'wallet_transaction_id',v_wallet_transaction_id,'attempt_id',p_attempt_id,'unlocked_at',v_unlocked_at);
END;
$$;

REVOKE ALL ON FUNCTION public.animal_personality_purchase_unlock(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.animal_personality_purchase_unlock(uuid, uuid, text, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.animal_personality_get_result_context(
  p_owner_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform, core
AS $$
DECLARE
  v_attempt public.quiz_attempts;
  v_result public.animal_personality_results;
  v_core_user_id uuid;
  v_v3_product_id uuid;
  v_v4_product_id uuid;
  v_v3_entitlement platform.entitlements;
  v_v4_entitlement platform.entitlements;
  v_report public.animal_personality_v4_reports;
BEGIN
  IF p_owner_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('result_status', 'invalid_request');
  END IF;

  SELECT qa.* INTO v_attempt
  FROM public.quiz_attempts qa
  JOIN public.quiz_definitions qd ON qd.id = qa.quiz_id
  WHERE qa.id = p_attempt_id
    AND qa.owner_id = p_owner_id
    AND qa.status = 'completed'
    AND qd.slug = 'animal-personality';

  IF NOT FOUND THEN RETURN jsonb_build_object('result_status', 'invalid_attempt'); END IF;

  SELECT * INTO v_result
  FROM public.animal_personality_results apr
  WHERE apr.attempt_id = p_attempt_id;

  IF NOT FOUND THEN RETURN jsonb_build_object('result_status', 'result_missing'); END IF;

  SELECT cu.id INTO v_core_user_id
  FROM core.users cu
  WHERE cu.auth_user_id = p_owner_id AND cu.status = 'active'
  LIMIT 1;

  SELECT p.id INTO v_v3_product_id FROM platform.products p
  WHERE p.product_key = 'animal_personality_v3' AND p.status = 'active';
  SELECT p.id INTO v_v4_product_id FROM platform.products p
  WHERE p.product_key = 'animal_personality_v4' AND p.status = 'active';

  IF v_core_user_id IS NOT NULL AND v_v3_product_id IS NOT NULL THEN
    SELECT e.* INTO v_v3_entitlement
    FROM platform.entitlements e
    WHERE e.user_id = v_core_user_id AND e.product_id = v_v3_product_id
      AND e.entitlement_type = 'scoped_lifetime' AND e.scope_type = 'quiz_attempt'
      AND e.scope_id = p_attempt_id AND e.status IN ('active', 'trialing', 'suspended')
    LIMIT 1;
  END IF;

  IF v_core_user_id IS NOT NULL AND v_v4_product_id IS NOT NULL THEN
    SELECT e.* INTO v_v4_entitlement
    FROM platform.entitlements e
    WHERE e.user_id = v_core_user_id AND e.product_id = v_v4_product_id
      AND e.entitlement_type = 'scoped_lifetime' AND e.scope_type = 'quiz_attempt'
      AND e.scope_id = p_attempt_id AND e.status IN ('active', 'trialing', 'suspended')
    LIMIT 1;
  END IF;

  SELECT * INTO v_report FROM public.animal_personality_v4_reports r
  WHERE r.attempt_id = p_attempt_id LIMIT 1;

  RETURN jsonb_build_object(
    'result_status', 'ok',
    'attempt_id', p_attempt_id,
    'assessment_version', v_result.assessment_version,
    'display_title', v_result.display_title,
    'v1', jsonb_build_object(
      'result_version', v_result.v1_result_version,
      'primary_type', v_result.v1_primary_type,
      'core_scores', v_result.v1_core_scores,
      'response_quality_flag', v_result.v1_response_quality_flag,
      'is_chameleon', v_result.v1_chameleon_flag,
      'chameleon_pattern', v_result.v1_chameleon_pattern,
      'profile_structure', v_result.v1_profile_structure,
      'strength_tier', v_result.v1_strength_tier,
      'metrics', v_result.v1_metrics,
      'axis_a', v_result.v1_axis_a,
      'axis_b', v_result.v1_axis_b
    ),
    'v2', jsonb_build_object(
      'version', v_result.v2_version,
      'profile_id', v_result.v2_profile_id,
      'display_name', v_result.v2_display_name,
      'resolved_display_name', coalesce(v_result.v2_resolved_display_name, v_result.v2_display_name),
      'primary_animal', v_result.v2_primary_animal,
      'secondary_animal', v_result.v2_secondary_animal,
      'profile_kind', v_result.v2_profile_kind
    ),
    'v3', jsonb_build_object(
      'unlocked', v_v3_entitlement.id IS NOT NULL,
      'entitlement_id', v_v3_entitlement.id,
      'scoring_version', v_result.v3_scoring_version,
      'dominant_trait_id', CASE WHEN v_v3_entitlement.id IS NOT NULL THEN v_result.v3_dominant_trait_id ELSE NULL END,
      'secondary_trait_id', CASE WHEN v_v3_entitlement.id IS NOT NULL THEN v_result.v3_secondary_trait_id ELSE NULL END,
      'dimension_scores', CASE WHEN v_v3_entitlement.id IS NOT NULL THEN v_result.v3_dimension_scores ELSE NULL END,
      'stability_label', CASE WHEN v_v3_entitlement.id IS NOT NULL THEN v_result.v3_stability_label ELSE NULL END
    ),
    'v4', jsonb_build_object(
      'unlocked', v_v4_entitlement.id IS NOT NULL AND v_report.id IS NOT NULL,
      'entitlement_id', v_v4_entitlement.id,
      'report', CASE WHEN v_v4_entitlement.id IS NOT NULL AND v_report.id IS NOT NULL THEN jsonb_build_object(
        'report_id', v_report.id,
        'report_version', v_report.report_version,
        'display_title', v_report.display_title,
        'dominant_trait_id', v_report.dominant_trait_id,
        'secondary_trait_id', v_report.secondary_trait_id,
        'dimension_scores', v_report.dimension_scores,
        'stability_label', v_report.stability_label,
        'pressure_shift', v_report.pressure_shift,
        'selected_module_ids', v_report.selected_module_ids,
        'sections', v_report.sections,
        'share_summary', v_report.share_summary,
        'content_hash', v_report.content_hash,
        'price_paid_crystal', v_report.price_paid_crystal,
        'unlocked_at', v_report.unlocked_at,
        'generated_at', v_report.generated_at
      ) ELSE NULL END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.animal_personality_get_result_context(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.animal_personality_get_result_context(uuid, uuid) TO service_role;

COMMIT;
