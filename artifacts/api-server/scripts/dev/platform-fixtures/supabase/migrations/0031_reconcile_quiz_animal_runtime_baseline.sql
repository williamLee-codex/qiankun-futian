BEGIN;

DO $$
DECLARE
  v_missing text[] := ARRAY[]::text[];
BEGIN
  IF to_regclass('core.users') IS NULL THEN v_missing := array_append(v_missing, 'core.users'); END IF;
  IF to_regclass('platform.products') IS NULL THEN v_missing := array_append(v_missing, 'platform.products'); END IF;
  IF to_regclass('platform.entitlements') IS NULL THEN v_missing := array_append(v_missing, 'platform.entitlements'); END IF;
  IF to_regclass('platform.entitlement_events') IS NULL THEN v_missing := array_append(v_missing, 'platform.entitlement_events'); END IF;
  IF to_regclass('public.quiz_definitions') IS NULL THEN v_missing := array_append(v_missing, 'public.quiz_definitions'); END IF;
  IF to_regclass('public.quiz_attempts') IS NULL THEN v_missing := array_append(v_missing, 'public.quiz_attempts'); END IF;
  IF to_regclass('public.core_wallet_ledger') IS NULL THEN v_missing := array_append(v_missing, 'public.core_wallet_ledger'); END IF;
  IF to_regclass('public.profiles') IS NULL THEN v_missing := array_append(v_missing, 'public.profiles'); END IF;
  IF to_regclass('public.locations') IS NULL THEN v_missing := array_append(v_missing, 'public.locations'); END IF;
  IF to_regclass('public.ref_genders') IS NULL THEN v_missing := array_append(v_missing, 'public.ref_genders'); END IF;
  IF to_regclass('public.ref_relationships') IS NULL THEN v_missing := array_append(v_missing, 'public.ref_relationships'); END IF;
  IF to_regclass('public.subject_profiles') IS NULL THEN v_missing := array_append(v_missing, 'public.subject_profiles'); END IF;
  IF to_regprocedure('system.set_updated_at()') IS NULL THEN v_missing := array_append(v_missing, 'system.set_updated_at()'); END IF;
  IF to_regprocedure('public.core_wallet_apply_transaction(uuid,integer,text,text,text,text,text,text,uuid)') IS NULL THEN
    v_missing := array_append(v_missing, 'public.core_wallet_apply_transaction');
  END IF;

  IF cardinality(v_missing) > 0 THEN
    RAISE EXCEPTION 'QUIZ_ANIMAL_RECONCILIATION_PREREQUISITE_MISSING: %', array_to_string(v_missing, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='subject_profiles' AND column_name='id' AND data_type='uuid'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='subject_profiles' AND column_name='user_id' AND data_type='uuid'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname='public'
      AND tablename='subject_profiles'
      AND indexdef ~* 'CREATE UNIQUE INDEX.*\(id, user_id\)'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='subject_profiles' AND c.contype='p'
      AND pg_get_constraintdef(c.oid) ~* 'PRIMARY KEY \(id\)'
  ) THEN
    RAISE EXCEPTION 'QUIZ_ANIMAL_RECONCILIATION_SUBJECT_PROFILE_INCOMPATIBLE: subject_profiles requires uuid id/user_id, PRIMARY KEY(id), and UNIQUE(id,user_id)';
  END IF;
END;
$$;

ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS scoring_model text,
  ADD COLUMN IF NOT EXISTS secondary_result_id text,
  ADD COLUMN IF NOT EXISTS secondary_score integer,
  ADD COLUMN IF NOT EXISTS result_shares jsonb,
  ADD COLUMN IF NOT EXISTS gap_pp numeric,
  ADD COLUMN IF NOT EXISTS confidence_band text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quiz_attempts_scoring_model_check') THEN
    ALTER TABLE public.quiz_attempts ADD CONSTRAINT quiz_attempts_scoring_model_check
      CHECK (scoring_model IS NULL OR scoring_model='LEGACY_SC_V2_OPTION_VECTOR');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quiz_attempts_result_shares_check') THEN
    ALTER TABLE public.quiz_attempts ADD CONSTRAINT quiz_attempts_result_shares_check
      CHECK (result_shares IS NULL OR jsonb_typeof(result_shares)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quiz_attempts_gap_pp_check') THEN
    ALTER TABLE public.quiz_attempts ADD CONSTRAINT quiz_attempts_gap_pp_check
      CHECK (gap_pp IS NULL OR (gap_pp >= 0 AND gap_pp <= 100));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='quiz_attempts_confidence_band_check') THEN
    ALTER TABLE public.quiz_attempts ADD CONSTRAINT quiz_attempts_confidence_band_check
      CHECK (confidence_band IS NULL OR confidence_band IN ('BLENDED','MODERATE','CLEAR'));
  END IF;
END;
$$;

ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quiz_attempts_owner_insert ON public.quiz_attempts;
CREATE POLICY quiz_attempts_owner_insert ON public.quiz_attempts
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = owner_id);
DROP POLICY IF EXISTS quiz_attempts_owner_update ON public.quiz_attempts;
CREATE POLICY quiz_attempts_owner_update ON public.quiz_attempts
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);
REVOKE ALL ON TABLE public.quiz_attempts FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.quiz_attempts TO authenticated;

CREATE TABLE IF NOT EXISTS public.animal_personality_results (
  attempt_id uuid PRIMARY KEY REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  assessment_version text NOT NULL,
  v1_result_version text,
  v1_primary_type text,
  v1_core_scores jsonb,
  v1_chameleon_flag boolean,
  v2_version text,
  v2_profile_id text,
  v2_display_name text,
  v2_primary_animal text,
  v2_secondary_animal text,
  v2_profile_kind text,
  v3_scoring_version text,
  v3_dominant_trait_id text,
  v3_secondary_trait_id text,
  v3_dimension_scores jsonb,
  v3_stability_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  v1_response_quality_flag text,
  v1_profile_structure text,
  v1_chameleon_pattern text,
  v1_strength_tier text,
  v1_metrics jsonb,
  v1_axis_a jsonb,
  v1_axis_b jsonb,
  v2_resolved_display_name text,
  display_title text
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='animal_personality_results_v1_quality_check') THEN
    ALTER TABLE public.animal_personality_results ADD CONSTRAINT animal_personality_results_v1_quality_check CHECK (v1_response_quality_flag IS NULL OR v1_response_quality_flag IN ('SUFFICIENT','LOW_CONFIDENCE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='animal_personality_results_v1_structure_check') THEN
    ALTER TABLE public.animal_personality_results ADD CONSTRAINT animal_personality_results_v1_structure_check CHECK (v1_profile_structure IS NULL OR v1_profile_structure IN ('BALANCED','SINGLE_CORE','DUAL_CORE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='animal_personality_results_v1_chameleon_pattern_check') THEN
    ALTER TABLE public.animal_personality_results ADD CONSTRAINT animal_personality_results_v1_chameleon_pattern_check CHECK (v1_chameleon_pattern IS NULL OR v1_chameleon_pattern IN ('BALANCED_GENERALIST','CONTEXT_SWITCH'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='animal_personality_results_v1_strength_check') THEN
    ALTER TABLE public.animal_personality_results ADD CONSTRAINT animal_personality_results_v1_strength_check CHECK (v1_strength_tier IS NULL OR v1_strength_tier IN ('STANDARD','STRONG','EXTREME'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='animal_personality_results_v1_metrics_object_check') THEN
    ALTER TABLE public.animal_personality_results ADD CONSTRAINT animal_personality_results_v1_metrics_object_check CHECK (v1_metrics IS NULL OR jsonb_typeof(v1_metrics)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='animal_personality_results_v1_axis_a_object_check') THEN
    ALTER TABLE public.animal_personality_results ADD CONSTRAINT animal_personality_results_v1_axis_a_object_check CHECK (v1_axis_a IS NULL OR jsonb_typeof(v1_axis_a)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='animal_personality_results_v1_axis_b_object_check') THEN
    ALTER TABLE public.animal_personality_results ADD CONSTRAINT animal_personality_results_v1_axis_b_object_check CHECK (v1_axis_b IS NULL OR jsonb_typeof(v1_axis_b)='object');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.animal_personality_v4_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  entitlement_id uuid NOT NULL REFERENCES platform.entitlements(id) ON DELETE RESTRICT,
  wallet_transaction_id uuid NOT NULL REFERENCES public.core_wallet_ledger(id) ON DELETE RESTRICT,
  report_version text NOT NULL,
  scoring_version text NOT NULL,
  display_title text NOT NULL,
  v2_profile_id text,
  dominant_trait_id text NOT NULL,
  secondary_trait_id text,
  dimension_scores jsonb NOT NULL,
  stability_label text NOT NULL,
  pressure_shift jsonb,
  selected_module_ids jsonb NOT NULL,
  sections jsonb NOT NULL,
  share_summary text NOT NULL,
  content_hash text NOT NULL,
  price_paid_crystal integer NOT NULL CHECK (price_paid_crystal >= 0),
  unlocked_at timestamptz NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS animal_personality_v4_reports_entitlement_id_idx ON public.animal_personality_v4_reports(entitlement_id);
CREATE INDEX IF NOT EXISTS animal_personality_v4_reports_wallet_transaction_id_idx ON public.animal_personality_v4_reports(wallet_transaction_id);

ALTER TABLE platform.entitlements
  ADD COLUMN IF NOT EXISTS scope_type text,
  ADD COLUMN IF NOT EXISTS scope_id uuid;

ALTER TABLE platform.entitlements
  DROP CONSTRAINT IF EXISTS entitlements_entitlement_type_check;
ALTER TABLE platform.entitlements
  ADD CONSTRAINT entitlements_entitlement_type_check
  CHECK (entitlement_type IN ('lifetime','subscription','consumable','trial','gift','coupon','admin_grant','scoped_lifetime'));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='entitlements_scoped_lifetime_scope_check') THEN
    ALTER TABLE platform.entitlements ADD CONSTRAINT entitlements_scoped_lifetime_scope_check
      CHECK (entitlement_type <> 'scoped_lifetime' OR (scope_type='quiz_attempt' AND scope_id IS NOT NULL));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS entitlements_user_product_scope_active_key
  ON platform.entitlements(user_id, product_id, scope_type, scope_id)
  WHERE status IN ('active','trialing','suspended') AND entitlement_type='scoped_lifetime';

ALTER TABLE public.animal_personality_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.animal_personality_v4_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS animal_personality_results_owner_select ON public.animal_personality_results;
CREATE POLICY animal_personality_results_owner_select ON public.animal_personality_results
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quiz_attempts qa WHERE qa.id=attempt_id AND qa.owner_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS animal_personality_results_service_role_all ON public.animal_personality_results;
CREATE POLICY animal_personality_results_service_role_all ON public.animal_personality_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS animal_personality_v4_reports_owner_select ON public.animal_personality_v4_reports;
CREATE POLICY animal_personality_v4_reports_owner_select ON public.animal_personality_v4_reports
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quiz_attempts qa WHERE qa.id=attempt_id AND qa.owner_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS animal_personality_v4_reports_service_role_all ON public.animal_personality_v4_reports;
CREATE POLICY animal_personality_v4_reports_service_role_all ON public.animal_personality_v4_reports
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.animal_personality_results FROM anon;
REVOKE ALL ON TABLE public.animal_personality_v4_reports FROM anon;
GRANT SELECT ON TABLE public.animal_personality_results TO authenticated;
GRANT SELECT ON TABLE public.animal_personality_v4_reports TO authenticated;
GRANT ALL ON TABLE public.animal_personality_results TO service_role;
GRANT ALL ON TABLE public.animal_personality_v4_reports TO service_role;

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
  JOIN public.quiz_definitions qd ON qd.id=qa.quiz_id
  WHERE qa.id=p_attempt_id AND qa.status='started' AND qd.slug='animal-personality'
    AND qa.owner_id IS NOT DISTINCT FROM p_owner_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result_status','invalid_attempt'); END IF;

  INSERT INTO public.animal_personality_results(
    attempt_id,assessment_version,v1_result_version,v1_primary_type,v1_core_scores,v1_chameleon_flag,
    v1_response_quality_flag,v1_profile_structure,v1_chameleon_pattern,v1_strength_tier,v1_metrics,v1_axis_a,v1_axis_b,
    v2_version,v2_profile_id,v2_display_name,v2_resolved_display_name,v2_primary_animal,v2_secondary_animal,v2_profile_kind,display_title
  ) VALUES (
    p_attempt_id,coalesce(p_result_payload->>'assessment_version','V1.0'),p_result_payload->>'v1_result_version',
    p_result_payload#>>'{v1,primary_type}',p_result_payload#>'{v1,core_scores}',coalesce((p_result_payload#>>'{v1,is_chameleon}')::boolean,false),
    p_result_payload#>>'{v1,response_quality_flag}',p_result_payload#>>'{v1,profile_structure}',p_result_payload#>>'{v1,chameleon_pattern}',
    p_result_payload#>>'{v1,strength_tier}',p_result_payload#>'{v1,metrics}',p_result_payload#>'{v1,axis_a}',p_result_payload#>'{v1,axis_b}',
    p_result_payload->>'v2_version',p_result_payload#>>'{v2,profile_id}',p_result_payload#>>'{v2,display_name}',
    coalesce(p_result_payload#>>'{v2,resolved_display_name}',p_result_payload#>>'{v2,display_name}'),p_result_payload#>>'{v2,primary_animal}',
    p_result_payload#>>'{v2,secondary_animal}',p_result_payload#>>'{v2,profile_kind}',p_result_payload->>'display_title'
  ) ON CONFLICT (attempt_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;

  UPDATE public.quiz_attempts
  SET status='completed',private_response=p_attempt_payload->'private_response',primary_result_id=p_result_payload#>>'{v1,primary_type}',
      secondary_result_id=p_result_payload#>>'{v2,profile_id}',completed_at=now()
  WHERE id=p_attempt_id AND status='started';
  IF NOT FOUND THEN RAISE EXCEPTION 'ANIMAL_PERSONALITY_ATTEMPT_STATE_CHANGED'; END IF;
  RETURN jsonb_build_object('result_status','completed','attempt_id',p_attempt_id,'v1_primary_type',p_result_payload#>>'{v1,primary_type}',
    'v2_profile_id',p_result_payload#>>'{v2,profile_id}','display_title',p_result_payload->>'display_title');
END;
$$;

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
  IF p_owner_id IS NULL OR p_attempt_id IS NULL OR v_version NOT IN ('V3','V4') THEN RETURN jsonb_build_object('result_status','invalid_request'); END IF;

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
  IF NOT FOUND THEN RETURN jsonb_build_object('result_status','invalid_attempt'); END IF;

  SELECT * INTO v_result FROM public.animal_personality_results WHERE attempt_id=p_attempt_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('result_status','prerequisite_missing'); END IF;

  SELECT id INTO v_core_user_id FROM core.users WHERE auth_user_id=p_owner_id AND status='active' LIMIT 1;
  SELECT id INTO v_product_id FROM platform.products WHERE product_key=v_product_key AND status='active';
  IF v_product_id IS NULL THEN RETURN jsonb_build_object('result_status','product_unavailable'); END IF;

  IF v_core_user_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM platform.entitlements
    WHERE user_id=v_core_user_id AND product_id=v_product_id AND entitlement_type='scoped_lifetime'
      AND scope_type='quiz_attempt' AND scope_id=p_attempt_id AND status IN ('active','trialing','suspended') LIMIT 1;
    IF FOUND THEN RETURN jsonb_build_object('result_status','duplicate','version',v_version,'price_crystal',v_price,'entitlement_id',v_existing.id,'attempt_id',p_attempt_id); END IF;
  END IF;

  IF v_version='V3' THEN
    IF v_result.v1_primary_type IS NULL OR v_result.v1_profile_structure IS NULL OR (v_result.v1_primary_type <> 'Chameleon' AND v_result.v2_profile_id IS NULL) THEN RETURN jsonb_build_object('result_status','prerequisite_missing'); END IF;
  ELSE
    IF v_result.v3_dominant_trait_id IS NULL OR v_result.v3_dimension_scores IS NULL THEN RETURN jsonb_build_object('result_status','prerequisite_missing'); END IF;
    SELECT id INTO v_v3_product_id FROM platform.products WHERE product_key='animal_personality_v3' AND status='active';
    IF v_core_user_id IS NULL OR v_v3_product_id IS NULL OR NOT EXISTS (SELECT 1 FROM platform.entitlements WHERE user_id=v_core_user_id AND product_id=v_v3_product_id AND entitlement_type='scoped_lifetime' AND scope_type='quiz_attempt' AND scope_id=p_attempt_id AND status IN ('active','trialing','suspended')) THEN RETURN jsonb_build_object('result_status','prerequisite_missing'); END IF;
    IF p_v4_report IS NULL OR nullif(btrim(p_v4_report->>'report_version'),'') IS NULL OR nullif(btrim(p_v4_report->>'display_title'),'') IS NULL OR jsonb_typeof(p_v4_report->'selected_module_ids') IS DISTINCT FROM 'array' OR jsonb_typeof(p_v4_report->'sections') IS DISTINCT FROM 'array' OR nullif(btrim(p_v4_report->>'share_summary'),'') IS NULL OR nullif(btrim(p_v4_report->>'content_hash'),'') IS NULL THEN RETURN jsonb_build_object('result_status','v4_report_required'); END IF;
  END IF;

  v_wallet := public.core_wallet_apply_transaction(p_owner_id,v_price,'crystal','debit',format('animal-personality:%s:%s:%s',lower(v_version),p_owner_id,p_attempt_id),CASE v_version WHEN 'V3' THEN '動物人格 V3 性格傾向解鎖' ELSE '動物人格 V4 全解析解鎖' END,p_attempt_id::text,format('animal_personality_%s_unlock',lower(v_version)),NULL);
  v_wallet_status := v_wallet->>'result_status';
  IF v_wallet_status='insufficient_funds' THEN RETURN jsonb_build_object('result_status','insufficient_funds','version',v_version,'price_crystal',v_price,'attempt_id',p_attempt_id); END IF;
  IF v_wallet_status NOT IN ('created','duplicate') THEN RAISE EXCEPTION 'Unexpected core wallet result: %',coalesce(v_wallet_status,'<null>'); END IF;
  v_wallet_transaction_id := nullif(v_wallet->'transaction'->>'id','')::uuid;
  IF v_wallet_transaction_id IS NULL THEN RAISE EXCEPTION 'Core wallet transaction id missing'; END IF;

  IF v_core_user_id IS NULL THEN INSERT INTO core.users(auth_user_id,status) VALUES (p_owner_id,'active') ON CONFLICT (auth_user_id) DO UPDATE SET auth_user_id=excluded.auth_user_id RETURNING id INTO v_core_user_id; END IF;
  INSERT INTO platform.entitlements(user_id,product_id,entitlement_type,status,granted_at,scope_type,scope_id) VALUES (v_core_user_id,v_product_id,'scoped_lifetime','active',v_unlocked_at,'quiz_attempt',p_attempt_id) RETURNING id INTO v_entitlement_id;
  INSERT INTO platform.entitlement_events(entitlement_id,event_type,source,reference_id) VALUES (v_entitlement_id,'granted','purchase',v_wallet_transaction_id);

  IF v_version='V4' THEN
    INSERT INTO public.animal_personality_v4_reports(attempt_id,entitlement_id,wallet_transaction_id,report_version,scoring_version,display_title,v2_profile_id,dominant_trait_id,secondary_trait_id,dimension_scores,stability_label,pressure_shift,selected_module_ids,sections,share_summary,content_hash,price_paid_crystal,unlocked_at,generated_at)
    VALUES (p_attempt_id,v_entitlement_id,v_wallet_transaction_id,p_v4_report->>'report_version',coalesce(v_result.v3_scoring_version,'V3_SCORING_v1.0'),p_v4_report->>'display_title',v_result.v2_profile_id,v_result.v3_dominant_trait_id,v_result.v3_secondary_trait_id,v_result.v3_dimension_scores,coalesce(v_result.v3_stability_label,'情境差異明顯'),p_v4_report->'pressure_shift',p_v4_report->'selected_module_ids',p_v4_report->'sections',p_v4_report->>'share_summary',p_v4_report->>'content_hash',v_price,v_unlocked_at,v_unlocked_at);
  END IF;
  RETURN jsonb_build_object('result_status','created','version',v_version,'price_crystal',v_price,'entitlement_id',v_entitlement_id,'wallet_transaction_id',v_wallet_transaction_id,'attempt_id',p_attempt_id,'unlocked_at',v_unlocked_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.animal_personality_get_result_context(p_owner_id uuid,p_attempt_id uuid)
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
  IF p_owner_id IS NULL OR p_attempt_id IS NULL THEN RETURN jsonb_build_object('result_status','invalid_request'); END IF;

  SELECT qa.* INTO v_attempt
  FROM public.quiz_attempts qa
  JOIN public.quiz_definitions qd ON qd.id=qa.quiz_id
  WHERE qa.id=p_attempt_id
    AND qa.owner_id=p_owner_id
    AND qa.status='completed'
    AND qd.slug='animal-personality';
  IF NOT FOUND THEN RETURN jsonb_build_object('result_status','invalid_attempt'); END IF;

  SELECT * INTO v_result FROM public.animal_personality_results WHERE attempt_id=p_attempt_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('result_status','result_missing'); END IF;
  SELECT id INTO v_core_user_id FROM core.users WHERE auth_user_id=p_owner_id AND status='active' LIMIT 1;
  SELECT id INTO v_v3_product_id FROM platform.products WHERE product_key='animal_personality_v3' AND status='active';
  SELECT id INTO v_v4_product_id FROM platform.products WHERE product_key='animal_personality_v4' AND status='active';
  IF v_core_user_id IS NOT NULL AND v_v3_product_id IS NOT NULL THEN SELECT * INTO v_v3_entitlement FROM platform.entitlements WHERE user_id=v_core_user_id AND product_id=v_v3_product_id AND entitlement_type='scoped_lifetime' AND scope_type='quiz_attempt' AND scope_id=p_attempt_id AND status IN ('active','trialing','suspended') LIMIT 1; END IF;
  IF v_core_user_id IS NOT NULL AND v_v4_product_id IS NOT NULL THEN SELECT * INTO v_v4_entitlement FROM platform.entitlements WHERE user_id=v_core_user_id AND product_id=v_v4_product_id AND entitlement_type='scoped_lifetime' AND scope_type='quiz_attempt' AND scope_id=p_attempt_id AND status IN ('active','trialing','suspended') LIMIT 1; END IF;
  SELECT * INTO v_report FROM public.animal_personality_v4_reports WHERE attempt_id=p_attempt_id LIMIT 1;
  RETURN jsonb_build_object('result_status','ok','attempt_id',p_attempt_id,'assessment_version',v_result.assessment_version,'display_title',v_result.display_title,
    'v1',jsonb_build_object('result_version',v_result.v1_result_version,'primary_type',v_result.v1_primary_type,'core_scores',v_result.v1_core_scores,'response_quality_flag',v_result.v1_response_quality_flag,'is_chameleon',v_result.v1_chameleon_flag,'chameleon_pattern',v_result.v1_chameleon_pattern,'profile_structure',v_result.v1_profile_structure,'strength_tier',v_result.v1_strength_tier,'metrics',v_result.v1_metrics,'axis_a',v_result.v1_axis_a,'axis_b',v_result.v1_axis_b),
    'v2',jsonb_build_object('version',v_result.v2_version,'profile_id',v_result.v2_profile_id,'display_name',v_result.v2_display_name,'resolved_display_name',coalesce(v_result.v2_resolved_display_name,v_result.v2_display_name),'primary_animal',v_result.v2_primary_animal,'secondary_animal',v_result.v2_secondary_animal,'profile_kind',v_result.v2_profile_kind),
    'v3',jsonb_build_object('unlocked',v_v3_entitlement.id IS NOT NULL,'entitlement_id',v_v3_entitlement.id,'scoring_version',v_result.v3_scoring_version,'dominant_trait_id',CASE WHEN v_v3_entitlement.id IS NOT NULL THEN v_result.v3_dominant_trait_id ELSE NULL END,'secondary_trait_id',CASE WHEN v_v3_entitlement.id IS NOT NULL THEN v_result.v3_secondary_trait_id ELSE NULL END,'dimension_scores',CASE WHEN v_v3_entitlement.id IS NOT NULL THEN v_result.v3_dimension_scores ELSE NULL END,'stability_label',CASE WHEN v_v3_entitlement.id IS NOT NULL THEN v_result.v3_stability_label ELSE NULL END),
    'v4',jsonb_build_object('unlocked',v_v4_entitlement.id IS NOT NULL AND v_report.id IS NOT NULL,'entitlement_id',v_v4_entitlement.id,'report',CASE WHEN v_v4_entitlement.id IS NOT NULL AND v_report.id IS NOT NULL THEN jsonb_build_object(
      'report_id',v_report.id,
      'report_version',v_report.report_version,
      'display_title',v_report.display_title,
      'dominant_trait_id',v_report.dominant_trait_id,
      'secondary_trait_id',v_report.secondary_trait_id,
      'dimension_scores',v_report.dimension_scores,
      'stability_label',v_report.stability_label,
      'pressure_shift',v_report.pressure_shift,
      'selected_module_ids',v_report.selected_module_ids,
      'sections',v_report.sections,
      'share_summary',v_report.share_summary,
      'content_hash',v_report.content_hash,
      'price_paid_crystal',v_report.price_paid_crystal,
      'unlocked_at',v_report.unlocked_at,
      'generated_at',v_report.generated_at
    ) ELSE NULL END));
END;
$$;

REVOKE ALL ON FUNCTION public.animal_personality_complete_attempt(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.animal_personality_complete_attempt(uuid, uuid, jsonb, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.animal_personality_purchase_unlock(uuid, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.animal_personality_purchase_unlock(uuid, uuid, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.animal_personality_get_result_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.animal_personality_get_result_context(uuid, uuid) TO service_role;

COMMIT;
