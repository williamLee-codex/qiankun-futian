BEGIN;

DO $$
BEGIN
  IF to_regclass('public.quiz_definitions') IS NULL
    OR to_regclass('public.quiz_attempts') IS NULL
    OR to_regclass('public.quiz_definition_revisions') IS NULL
    OR to_regclass('public.animal_personality_results') IS NULL
    OR to_regclass('public.animal_personality_v4_reports') IS NULL
  THEN
    RAISE EXCEPTION 'ANIMAL_VERSIONING_HARDENING_PREREQUISITE_MISSING';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.quiz_definition_revisions
    WHERE action IS NULL OR reason IS NULL
  ) THEN
    RAISE EXCEPTION 'ANIMAL_VERSIONING_HARDENING_REVISION_AUDIT_INCOMPATIBLE';
  END IF;
END;
$$;

ALTER TABLE public.quiz_definition_revisions
  ALTER COLUMN action SET NOT NULL,
  ALTER COLUMN reason SET NOT NULL;

CREATE OR REPLACE FUNCTION public.activate_animal_quiz_definition_revision(
  p_quiz_id uuid,
  p_definition_snapshot jsonb,
  p_assessment_version text,
  p_question_version text,
  p_content_version text,
  p_scoring_version text,
  p_source_hash text,
  p_actor_id uuid,
  p_action text,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quiz public.quiz_definitions;
  v_previous_revision_id uuid;
  v_revision_id uuid;
BEGIN
  IF p_quiz_id IS NULL
    OR jsonb_typeof(p_definition_snapshot) IS DISTINCT FROM 'object'
    OR nullif(btrim(p_assessment_version),'') IS NULL
    OR nullif(btrim(p_question_version),'') IS NULL
    OR nullif(btrim(p_content_version),'') IS NULL
    OR nullif(btrim(p_scoring_version),'') IS NULL
    OR p_source_hash !~ '^sha256:[0-9a-f]{64}$'
    OR p_actor_id IS NULL
    OR nullif(btrim(p_action),'') IS NULL
    OR nullif(btrim(p_reason),'') IS NULL
    OR p_definition_snapshot->>'assessment_version' IS DISTINCT FROM p_assessment_version
    OR p_definition_snapshot->>'question_version' IS DISTINCT FROM p_question_version
    OR p_definition_snapshot->>'content_version' IS DISTINCT FROM p_content_version
    OR p_definition_snapshot->>'scoring_version' IS DISTINCT FROM p_scoring_version
    OR p_definition_snapshot->>'source_hash' IS DISTINCT FROM p_source_hash
  THEN
    RAISE EXCEPTION 'ANIMAL_DEFINITION_ACTIVATION_FAILED';
  END IF;

  SELECT * INTO v_quiz
  FROM public.quiz_definitions
  WHERE id=p_quiz_id AND slug='animal-personality'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ANIMAL_DEFINITION_ACTIVATION_FAILED';
  END IF;

  SELECT id INTO v_revision_id
  FROM public.quiz_definition_revisions
  WHERE quiz_id=p_quiz_id AND source_hash=p_source_hash
  LIMIT 1;
  IF v_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'ANIMAL_DEFINITION_ACTIVATION_FAILED';
  END IF;

  SELECT id INTO v_previous_revision_id
  FROM public.quiz_definition_revisions
  WHERE quiz_id=p_quiz_id AND deactivated_at IS NULL
  LIMIT 1;

  UPDATE public.quiz_definition_revisions
  SET deactivated_at=now()
  WHERE quiz_id=p_quiz_id AND deactivated_at IS NULL;

  INSERT INTO public.quiz_definition_revisions(
    quiz_id,previous_revision_id,definition_snapshot,
    assessment_version,question_version,content_version,scoring_version,source_hash,
    activated_at,actor_id,action,reason
  ) VALUES (
    p_quiz_id,v_previous_revision_id,p_definition_snapshot,
    p_assessment_version,p_question_version,p_content_version,p_scoring_version,p_source_hash,
    now(),p_actor_id,p_action,p_reason
  ) RETURNING id INTO v_revision_id;

  UPDATE public.quiz_definitions
  SET definition=p_definition_snapshot,
      active_revision_id=v_revision_id,
      updated_at=now()
  WHERE id=p_quiz_id;

  RETURN v_revision_id;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM='ANIMAL_DEFINITION_ACTIVATION_FAILED' THEN RAISE; END IF;
  RAISE EXCEPTION 'ANIMAL_DEFINITION_ACTIVATION_FAILED';
END;
$$;

REVOKE ALL ON FUNCTION public.activate_animal_quiz_definition_revision(uuid,jsonb,text,text,text,text,text,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_animal_quiz_definition_revision(uuid,jsonb,text,text,text,text,text,uuid,text,text)
  TO service_role;

ALTER TABLE public.animal_personality_v4_reports
  ADD COLUMN IF NOT EXISTS tension_axes jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='animal_personality_v4_reports_tension_axes_check'
  ) THEN
    ALTER TABLE public.animal_personality_v4_reports
      ADD CONSTRAINT animal_personality_v4_reports_tension_axes_check
      CHECK (
        tension_axes IS NULL
        OR jsonb_typeof(tension_axes) IN ('object','array')
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.animal_personality_result_snapshot_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.attempt_id IS DISTINCT FROM NEW.attempt_id
    OR OLD.assessment_version IS DISTINCT FROM NEW.assessment_version
    OR OLD.v1_result_version IS DISTINCT FROM NEW.v1_result_version
    OR OLD.v1_primary_type IS DISTINCT FROM NEW.v1_primary_type
    OR OLD.v1_core_scores IS DISTINCT FROM NEW.v1_core_scores
    OR OLD.v1_chameleon_flag IS DISTINCT FROM NEW.v1_chameleon_flag
    OR OLD.v1_response_quality_flag IS DISTINCT FROM NEW.v1_response_quality_flag
    OR OLD.v1_profile_structure IS DISTINCT FROM NEW.v1_profile_structure
    OR OLD.v1_chameleon_pattern IS DISTINCT FROM NEW.v1_chameleon_pattern
    OR OLD.v1_strength_tier IS DISTINCT FROM NEW.v1_strength_tier
    OR OLD.v1_metrics IS DISTINCT FROM NEW.v1_metrics
    OR OLD.v1_axis_a IS DISTINCT FROM NEW.v1_axis_a
    OR OLD.v1_axis_b IS DISTINCT FROM NEW.v1_axis_b
    OR OLD.v2_version IS DISTINCT FROM NEW.v2_version
    OR OLD.v2_profile_id IS DISTINCT FROM NEW.v2_profile_id
    OR OLD.v2_display_name IS DISTINCT FROM NEW.v2_display_name
    OR OLD.v2_resolved_display_name IS DISTINCT FROM NEW.v2_resolved_display_name
    OR OLD.v2_primary_animal IS DISTINCT FROM NEW.v2_primary_animal
    OR OLD.v2_secondary_animal IS DISTINCT FROM NEW.v2_secondary_animal
    OR OLD.v2_profile_kind IS DISTINCT FROM NEW.v2_profile_kind
    OR OLD.display_title IS DISTINCT FROM NEW.display_title
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'ANIMAL_PERSONALITY_CANONICAL_RESULT_IMMUTABLE';
  END IF;

  IF (OLD.v3_scoring_version IS NOT NULL AND OLD.v3_scoring_version IS DISTINCT FROM NEW.v3_scoring_version)
    OR (OLD.v3_dominant_trait_id IS NOT NULL AND OLD.v3_dominant_trait_id IS DISTINCT FROM NEW.v3_dominant_trait_id)
    OR (OLD.v3_secondary_trait_id IS NOT NULL AND OLD.v3_secondary_trait_id IS DISTINCT FROM NEW.v3_secondary_trait_id)
    OR (OLD.v3_dimension_scores IS NOT NULL AND OLD.v3_dimension_scores IS DISTINCT FROM NEW.v3_dimension_scores)
    OR (OLD.v3_stability_label IS NOT NULL AND OLD.v3_stability_label IS DISTINCT FROM NEW.v3_stability_label)
  THEN
    RAISE EXCEPTION 'ANIMAL_PERSONALITY_CANONICAL_RESULT_IMMUTABLE';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS animal_personality_result_snapshot_guard_trg
  ON public.animal_personality_results;
CREATE TRIGGER animal_personality_result_snapshot_guard_trg
BEFORE UPDATE ON public.animal_personality_results
FOR EACH ROW EXECUTE FUNCTION public.animal_personality_result_snapshot_guard();

CREATE OR REPLACE FUNCTION public.animal_personality_v4_report_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'ANIMAL_PERSONALITY_V4_REPORT_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS animal_personality_v4_report_immutable_trg
  ON public.animal_personality_v4_reports;
CREATE TRIGGER animal_personality_v4_report_immutable_trg
BEFORE UPDATE OR DELETE ON public.animal_personality_v4_reports
FOR EACH ROW EXECUTE FUNCTION public.animal_personality_v4_report_immutable();

REVOKE ALL ON FUNCTION public.animal_personality_v4_report_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.animal_personality_v4_report_immutable() TO service_role;

REVOKE UPDATE, DELETE ON TABLE public.animal_personality_results FROM service_role;
REVOKE UPDATE, DELETE ON TABLE public.animal_personality_v4_reports FROM service_role;

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
  v_version text := upper(btrim(coalesce(p_version,'')));
  v_product_key text;
  v_price integer;
  v_product_id uuid;
  v_core_user_id uuid;
  v_entitlement_id uuid;
  v_existing platform.entitlements;
  v_attempt public.quiz_attempts;
  v_result public.animal_personality_results;
  v_wallet jsonb;
  v_wallet_status text;
  v_wallet_transaction_id uuid;
  v_v3_product_id uuid;
  v_unlocked_at timestamptz := now();
BEGIN
  IF p_owner_id IS NULL OR p_attempt_id IS NULL OR v_version NOT IN ('V3','V4') THEN
    RETURN jsonb_build_object('result_status','invalid_request');
  END IF;

  v_product_key := CASE v_version WHEN 'V3' THEN 'animal_personality_v3' ELSE 'animal_personality_v4' END;
  v_price := CASE v_version WHEN 'V3' THEN 5 ELSE 10 END;

  SELECT qa.* INTO v_attempt
  FROM public.quiz_attempts qa
  JOIN public.quiz_definitions qd ON qd.id=qa.quiz_id
  WHERE qa.id=p_attempt_id
    AND qa.owner_id=p_owner_id
    AND qa.status='completed'
    AND qd.slug='animal-personality'
  FOR UPDATE OF qa;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status','invalid_attempt');
  END IF;

  SELECT * INTO v_result
  FROM public.animal_personality_results
  WHERE attempt_id=p_attempt_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status','prerequisite_missing');
  END IF;

  SELECT id INTO v_core_user_id
  FROM core.users
  WHERE auth_user_id=p_owner_id AND status='active'
  LIMIT 1;

  SELECT id INTO v_product_id
  FROM platform.products
  WHERE product_key=v_product_key AND status='active';
  IF v_product_id IS NULL THEN
    RETURN jsonb_build_object('result_status','product_unavailable');
  END IF;

  IF v_core_user_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM platform.entitlements
    WHERE user_id=v_core_user_id
      AND product_id=v_product_id
      AND entitlement_type='scoped_lifetime'
      AND scope_type='quiz_attempt'
      AND scope_id=p_attempt_id
      AND status IN ('active','trialing','suspended')
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'result_status','duplicate',
        'version',v_version,
        'price_crystal',v_price,
        'entitlement_id',v_existing.id,
        'attempt_id',p_attempt_id
      );
    END IF;
  END IF;

  IF v_version='V3' THEN
    IF v_result.v1_primary_type IS NULL
      OR v_result.v1_profile_structure IS NULL
      OR (v_result.v1_primary_type <> 'Chameleon' AND v_result.v2_profile_id IS NULL)
    THEN
      RETURN jsonb_build_object('result_status','prerequisite_missing');
    END IF;
  ELSE
    IF v_result.v3_dominant_trait_id IS NULL OR v_result.v3_dimension_scores IS NULL THEN
      RETURN jsonb_build_object('result_status','prerequisite_missing');
    END IF;

    SELECT id INTO v_v3_product_id
    FROM platform.products
    WHERE product_key='animal_personality_v3' AND status='active';

    IF v_core_user_id IS NULL
      OR v_v3_product_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM platform.entitlements
        WHERE user_id=v_core_user_id
          AND product_id=v_v3_product_id
          AND entitlement_type='scoped_lifetime'
          AND scope_type='quiz_attempt'
          AND scope_id=p_attempt_id
          AND status IN ('active','trialing','suspended')
      )
    THEN
      RETURN jsonb_build_object('result_status','prerequisite_missing');
    END IF;

    IF p_v4_report IS NULL
      OR nullif(btrim(p_v4_report->>'report_version'),'') IS NULL
      OR nullif(btrim(p_v4_report->>'display_title'),'') IS NULL
      OR p_v4_report->'tension_axes' IS NULL
      OR jsonb_typeof(p_v4_report->'tension_axes') NOT IN ('object','array')
      OR jsonb_typeof(p_v4_report->'selected_module_ids') IS DISTINCT FROM 'array'
      OR jsonb_typeof(p_v4_report->'sections') IS DISTINCT FROM 'array'
      OR nullif(btrim(p_v4_report->>'share_summary'),'') IS NULL
      OR nullif(btrim(p_v4_report->>'content_hash'),'') IS NULL
    THEN
      RETURN jsonb_build_object('result_status','v4_report_required');
    END IF;
  END IF;

  v_wallet := public.core_wallet_apply_transaction(
    p_owner_id,
    v_price,
    'crystal',
    'debit',
    format('animal-personality:%s:%s:%s',lower(v_version),p_owner_id,p_attempt_id),
    CASE v_version WHEN 'V3' THEN '動物人格 V3 性格傾向解鎖' ELSE '動物人格 V4 全解析解鎖' END,
    p_attempt_id::text,
    format('animal_personality_%s_unlock',lower(v_version)),
    NULL
  );

  v_wallet_status := v_wallet->>'result_status';
  IF v_wallet_status='insufficient_funds' THEN
    RETURN jsonb_build_object('result_status','insufficient_funds','version',v_version,'price_crystal',v_price,'attempt_id',p_attempt_id);
  END IF;
  IF v_wallet_status NOT IN ('created','duplicate') THEN
    RAISE EXCEPTION 'Unexpected core wallet result: %',coalesce(v_wallet_status,'<null>');
  END IF;

  v_wallet_transaction_id := nullif(v_wallet->'transaction'->>'id','')::uuid;
  IF v_wallet_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Core wallet transaction id missing';
  END IF;

  IF v_core_user_id IS NULL THEN
    INSERT INTO core.users(auth_user_id,status)
    VALUES (p_owner_id,'active')
    ON CONFLICT (auth_user_id)
    DO UPDATE SET auth_user_id=excluded.auth_user_id
    RETURNING id INTO v_core_user_id;
  END IF;

  INSERT INTO platform.entitlements(
    user_id,product_id,entitlement_type,status,granted_at,scope_type,scope_id
  ) VALUES (
    v_core_user_id,v_product_id,'scoped_lifetime','active',v_unlocked_at,'quiz_attempt',p_attempt_id
  ) RETURNING id INTO v_entitlement_id;

  INSERT INTO platform.entitlement_events(entitlement_id,event_type,source,reference_id)
  VALUES (v_entitlement_id,'granted','purchase',v_wallet_transaction_id);

  IF v_version='V4' THEN
    INSERT INTO public.animal_personality_v4_reports(
      attempt_id,entitlement_id,wallet_transaction_id,report_version,scoring_version,display_title,
      v2_profile_id,dominant_trait_id,secondary_trait_id,dimension_scores,stability_label,pressure_shift,
      tension_axes,selected_module_ids,sections,share_summary,content_hash,price_paid_crystal,unlocked_at,generated_at
    ) VALUES (
      p_attempt_id,v_entitlement_id,v_wallet_transaction_id,p_v4_report->>'report_version',
      coalesce(v_result.v3_scoring_version,'V3_SCORING_v1.0'),p_v4_report->>'display_title',v_result.v2_profile_id,
      v_result.v3_dominant_trait_id,v_result.v3_secondary_trait_id,v_result.v3_dimension_scores,
      coalesce(v_result.v3_stability_label,'情境差異明顯'),p_v4_report->'pressure_shift',
      p_v4_report->'tension_axes',p_v4_report->'selected_module_ids',p_v4_report->'sections',
      p_v4_report->>'share_summary',p_v4_report->>'content_hash',v_price,v_unlocked_at,v_unlocked_at
    );
  END IF;

  RETURN jsonb_build_object(
    'result_status','created',
    'version',v_version,
    'price_crystal',v_price,
    'entitlement_id',v_entitlement_id,
    'wallet_transaction_id',v_wallet_transaction_id,
    'attempt_id',p_attempt_id,
    'unlocked_at',v_unlocked_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.animal_personality_purchase_unlock(uuid, uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.animal_personality_purchase_unlock(uuid, uuid, text, jsonb)
  TO service_role;

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
    RETURN jsonb_build_object('result_status','invalid_request');
  END IF;

  SELECT qa.* INTO v_attempt
  FROM public.quiz_attempts qa
  JOIN public.quiz_definitions qd ON qd.id=qa.quiz_id
  WHERE qa.id=p_attempt_id
    AND qa.owner_id=p_owner_id
    AND qa.status='completed'
    AND qd.slug='animal-personality';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status','invalid_attempt');
  END IF;

  SELECT * INTO v_result
  FROM public.animal_personality_results
  WHERE attempt_id=p_attempt_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status','result_missing');
  END IF;

  SELECT id INTO v_core_user_id
  FROM core.users
  WHERE auth_user_id=p_owner_id AND status='active'
  LIMIT 1;

  SELECT id INTO v_v3_product_id
  FROM platform.products
  WHERE product_key='animal_personality_v3' AND status='active';
  SELECT id INTO v_v4_product_id
  FROM platform.products
  WHERE product_key='animal_personality_v4' AND status='active';

  IF v_core_user_id IS NOT NULL AND v_v3_product_id IS NOT NULL THEN
    SELECT * INTO v_v3_entitlement
    FROM platform.entitlements
    WHERE user_id=v_core_user_id
      AND product_id=v_v3_product_id
      AND entitlement_type='scoped_lifetime'
      AND scope_type='quiz_attempt'
      AND scope_id=p_attempt_id
      AND status IN ('active','trialing','suspended')
    LIMIT 1;
  END IF;

  IF v_core_user_id IS NOT NULL AND v_v4_product_id IS NOT NULL THEN
    SELECT * INTO v_v4_entitlement
    FROM platform.entitlements
    WHERE user_id=v_core_user_id
      AND product_id=v_v4_product_id
      AND entitlement_type='scoped_lifetime'
      AND scope_type='quiz_attempt'
      AND scope_id=p_attempt_id
      AND status IN ('active','trialing','suspended')
    LIMIT 1;
  END IF;

  SELECT * INTO v_report
  FROM public.animal_personality_v4_reports
  WHERE attempt_id=p_attempt_id
  LIMIT 1;

  RETURN jsonb_build_object(
    'result_status','ok',
    'attempt_id',p_attempt_id,
    'assessment_version',v_result.assessment_version,
    'display_title',v_result.display_title,
    'v1',jsonb_build_object(
      'result_version',v_result.v1_result_version,
      'primary_type',v_result.v1_primary_type,
      'core_scores',v_result.v1_core_scores,
      'response_quality_flag',v_result.v1_response_quality_flag,
      'is_chameleon',v_result.v1_chameleon_flag,
      'chameleon_pattern',v_result.v1_chameleon_pattern,
      'profile_structure',v_result.v1_profile_structure,
      'strength_tier',v_result.v1_strength_tier,
      'metrics',v_result.v1_metrics,
      'axis_a',v_result.v1_axis_a,
      'axis_b',v_result.v1_axis_b
    ),
    'v2',jsonb_build_object(
      'version',v_result.v2_version,
      'profile_id',v_result.v2_profile_id,
      'display_name',v_result.v2_display_name,
      'resolved_display_name',coalesce(v_result.v2_resolved_display_name,v_result.v2_display_name),
      'primary_animal',v_result.v2_primary_animal,
      'secondary_animal',v_result.v2_secondary_animal,
      'profile_kind',v_result.v2_profile_kind
    ),
    'v3',jsonb_build_object(
      'unlocked',v_v3_entitlement.id IS NOT NULL,
      'entitlement_id',v_v3_entitlement.id,
      'scoring_version',v_result.v3_scoring_version,
      'dominant_trait_id',CASE WHEN v_v3_entitlement.id IS NOT NULL THEN v_result.v3_dominant_trait_id ELSE NULL END,
      'secondary_trait_id',CASE WHEN v_v3_entitlement.id IS NOT NULL THEN v_result.v3_secondary_trait_id ELSE NULL END,
      'dimension_scores',CASE WHEN v_v3_entitlement.id IS NOT NULL THEN v_result.v3_dimension_scores ELSE NULL END,
      'stability_label',CASE WHEN v_v3_entitlement.id IS NOT NULL THEN v_result.v3_stability_label ELSE NULL END
    ),
    'v4',jsonb_build_object(
      'unlocked',v_v4_entitlement.id IS NOT NULL AND v_report.id IS NOT NULL,
      'entitlement_id',v_v4_entitlement.id,
      'report',CASE
        WHEN v_v4_entitlement.id IS NOT NULL AND v_report.id IS NOT NULL THEN jsonb_build_object(
          'report_id',v_report.id,
          'report_version',v_report.report_version,
          'display_title',v_report.display_title,
          'dominant_trait_id',v_report.dominant_trait_id,
          'secondary_trait_id',v_report.secondary_trait_id,
          'dimension_scores',v_report.dimension_scores,
          'stability_label',v_report.stability_label,
          'pressure_shift',v_report.pressure_shift,
          'tension_axes',v_report.tension_axes,
          'selected_module_ids',v_report.selected_module_ids,
          'sections',v_report.sections,
          'share_summary',v_report.share_summary,
          'content_hash',v_report.content_hash,
          'price_paid_crystal',v_report.price_paid_crystal,
          'unlocked_at',v_report.unlocked_at,
          'generated_at',v_report.generated_at
        )
        ELSE NULL
      END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.animal_personality_get_result_context(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.animal_personality_get_result_context(uuid, uuid)
  TO service_role;

COMMIT;
