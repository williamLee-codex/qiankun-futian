BEGIN;

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
    'v1', jsonb_build_object(
      'result_version', v_result.v1_result_version,
      'primary_type', v_result.v1_primary_type,
      'core_scores', v_result.v1_core_scores,
      'is_chameleon', v_result.v1_chameleon_flag
    ),
    'v2', jsonb_build_object(
      'version', v_result.v2_version,
      'profile_id', v_result.v2_profile_id,
      'display_name', v_result.v2_display_name,
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
