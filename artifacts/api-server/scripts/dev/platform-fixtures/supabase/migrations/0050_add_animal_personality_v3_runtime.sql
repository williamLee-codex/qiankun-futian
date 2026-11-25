BEGIN;

DO $$
BEGIN
  IF to_regclass('public.quiz_attempts') IS NULL
    OR to_regclass('public.quiz_definitions') IS NULL
    OR to_regclass('public.animal_personality_results') IS NULL
    OR to_regclass('platform.products') IS NULL
    OR to_regclass('platform.entitlements') IS NULL
    OR to_regclass('core.users') IS NULL
  THEN
    RAISE EXCEPTION 'ANIMAL_V3_RUNTIME_PREREQUISITE_MISSING';
  END IF;
END;
$$;

ALTER TABLE public.animal_personality_results
  ADD COLUMN IF NOT EXISTS v3_round_scores jsonb,
  ADD COLUMN IF NOT EXISTS v3_overall_raw jsonb,
  ADD COLUMN IF NOT EXISTS v3_source_hash text,
  ADD COLUMN IF NOT EXISTS v3_completed_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='animal_personality_results_v3_round_scores_object_check') THEN
    ALTER TABLE public.animal_personality_results
      ADD CONSTRAINT animal_personality_results_v3_round_scores_object_check
      CHECK (v3_round_scores IS NULL OR jsonb_typeof(v3_round_scores)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='animal_personality_results_v3_overall_raw_object_check') THEN
    ALTER TABLE public.animal_personality_results
      ADD CONSTRAINT animal_personality_results_v3_overall_raw_object_check
      CHECK (v3_overall_raw IS NULL OR jsonb_typeof(v3_overall_raw)='object');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='animal_personality_results_v3_source_hash_check') THEN
    ALTER TABLE public.animal_personality_results
      ADD CONSTRAINT animal_personality_results_v3_source_hash_check
      CHECK (v3_source_hash IS NULL OR v3_source_hash ~ '^sha256:[0-9a-f]{64}$');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.animal_personality_v3_sessions (
  attempt_id uuid PRIMARY KEY REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  entitlement_id uuid NOT NULL UNIQUE REFERENCES platform.entitlements(id) ON DELETE RESTRICT,
  scoring_version text NOT NULL,
  source_hash text NOT NULL CHECK (source_hash ~ '^sha256:[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.quiz_answers (
  attempt_id uuid NOT NULL REFERENCES public.animal_personality_v3_sessions(attempt_id) ON DELETE CASCADE,
  question_id text NOT NULL,
  selected_option_ids jsonb NOT NULL,
  scoring_version text NOT NULL,
  source_hash text NOT NULL CHECK (source_hash ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (attempt_id, question_id),
  CONSTRAINT quiz_answers_question_id_check CHECK (
    question_id ~ '^V3-Q(00[1-9]|01[0-9]|02[0-4])$'
  ),
  CONSTRAINT quiz_answers_selected_option_ids_check CHECK (
    jsonb_typeof(selected_option_ids)='array'
    AND jsonb_array_length(selected_option_ids) BETWEEN 1 AND 2
  )
);

ALTER TABLE public.animal_personality_v3_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_answers ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.animal_personality_v3_sessions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.quiz_answers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.animal_personality_v3_sessions TO service_role;
GRANT SELECT ON TABLE public.quiz_answers TO service_role;

CREATE OR REPLACE FUNCTION public.animal_personality_prepare_v3_session(
  p_owner_id uuid,
  p_attempt_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform, core
AS $$
DECLARE
  v_core_user_id uuid;
  v_product_id uuid;
  v_entitlement_id uuid;
  v_session public.animal_personality_v3_sessions;
BEGIN
  IF p_owner_id IS NULL OR p_attempt_id IS NULL THEN
    RETURN jsonb_build_object('result_status','invalid_request');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.quiz_attempts qa
    JOIN public.quiz_definitions qd ON qd.id=qa.quiz_id
    WHERE qa.id=p_attempt_id
      AND qa.owner_id=p_owner_id
      AND qa.status='completed'
      AND qd.slug='animal-personality'
  ) THEN
    RETURN jsonb_build_object('result_status','invalid_attempt');
  END IF;

  SELECT id INTO v_core_user_id
  FROM core.users
  WHERE auth_user_id=p_owner_id AND status='active'
  LIMIT 1;

  SELECT id INTO v_product_id
  FROM platform.products
  WHERE product_key='animal_personality_v3' AND status='active'
  LIMIT 1;

  IF v_core_user_id IS NULL OR v_product_id IS NULL THEN
    RETURN jsonb_build_object('result_status','locked');
  END IF;

  SELECT id INTO v_entitlement_id
  FROM platform.entitlements
  WHERE user_id=v_core_user_id
    AND product_id=v_product_id
    AND entitlement_type='scoped_lifetime'
    AND scope_type='quiz_attempt'
    AND scope_id=p_attempt_id
    AND status IN ('active','trialing','suspended')
  LIMIT 1;

  IF v_entitlement_id IS NULL THEN
    RETURN jsonb_build_object('result_status','locked');
  END IF;

  INSERT INTO public.animal_personality_v3_sessions(
    attempt_id,owner_id,entitlement_id,scoring_version,source_hash
  ) VALUES (
    p_attempt_id,p_owner_id,v_entitlement_id,'V3_SCORING_v1.0','sha256:d7747005add548bad81bbeee979ec757946723b90f9ddca721559668e31bcacb'
  )
  ON CONFLICT (attempt_id) DO NOTHING;

  SELECT * INTO v_session
  FROM public.animal_personality_v3_sessions
  WHERE attempt_id=p_attempt_id AND owner_id=p_owner_id;

  IF NOT FOUND
    OR v_session.scoring_version <> 'V3_SCORING_v1.0'
    OR v_session.source_hash <> 'sha256:d7747005add548bad81bbeee979ec757946723b90f9ddca721559668e31bcacb'
  THEN
    RETURN jsonb_build_object('result_status','version_mismatch');
  END IF;

  RETURN jsonb_build_object(
    'result_status','ready',
    'attempt_id',v_session.attempt_id,
    'status',v_session.status,
    'scoring_version',v_session.scoring_version,
    'source_hash',v_session.source_hash
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.animal_personality_save_v3_answer(
  p_owner_id uuid,
  p_attempt_id uuid,
  p_question_id text,
  p_selected_option_ids jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.animal_personality_v3_sessions;
BEGIN
  IF p_owner_id IS NULL
    OR p_attempt_id IS NULL
    OR nullif(btrim(p_question_id),'') IS NULL
    OR p_question_id !~ '^V3-Q(00[1-9]|01[0-9]|02[0-4])$'
    OR jsonb_typeof(p_selected_option_ids) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_selected_option_ids) NOT BETWEEN 1 AND 2
    OR (
      SELECT count(DISTINCT value)
      FROM jsonb_array_elements_text(p_selected_option_ids)
    ) <> jsonb_array_length(p_selected_option_ids)
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_selected_option_ids) selected(value)
      WHERE selected.value !~ ('^' || p_question_id || '-[A-E]$')
    )
  THEN
    RETURN jsonb_build_object('result_status','invalid_request');
  END IF;

  SELECT * INTO v_session
  FROM public.animal_personality_v3_sessions
  WHERE attempt_id=p_attempt_id AND owner_id=p_owner_id
  FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'started' THEN
    RETURN jsonb_build_object('result_status','locked');
  END IF;

  INSERT INTO public.quiz_answers(
    attempt_id,question_id,selected_option_ids,scoring_version,source_hash
  ) VALUES (
    p_attempt_id,p_question_id,p_selected_option_ids,v_session.scoring_version,v_session.source_hash
  )
  ON CONFLICT (attempt_id,question_id) DO UPDATE
    SET selected_option_ids=excluded.selected_option_ids,
        updated_at=now()
    WHERE public.quiz_answers.scoring_version=excluded.scoring_version
      AND public.quiz_answers.source_hash=excluded.source_hash;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status','version_mismatch');
  END IF;

  RETURN jsonb_build_object('result_status','saved','question_id',p_question_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.animal_personality_complete_v3(
  p_owner_id uuid,
  p_attempt_id uuid,
  p_result_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.animal_personality_v3_sessions;
  v_answer_count integer;
BEGIN
  IF p_owner_id IS NULL
    OR p_attempt_id IS NULL
    OR jsonb_typeof(p_result_payload) IS DISTINCT FROM 'object'
    OR p_result_payload->>'scoring_version' IS DISTINCT FROM 'V3_SCORING_v1.0'
    OR p_result_payload->>'source_hash' IS DISTINCT FROM 'sha256:d7747005add548bad81bbeee979ec757946723b90f9ddca721559668e31bcacb'
    OR nullif(btrim(p_result_payload->>'dominant_trait_id'),'') IS NULL
    OR jsonb_typeof(p_result_payload->'dimension_scores') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_result_payload->'round_scores') IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_result_payload->'overall_raw') IS DISTINCT FROM 'object'
    OR p_result_payload->>'stability_label' NOT IN ('HIGH','MEDIUM','CONTEXT_VARIATION')
  THEN
    RETURN jsonb_build_object('result_status','invalid_result');
  END IF;

  SELECT * INTO v_session
  FROM public.animal_personality_v3_sessions
  WHERE attempt_id=p_attempt_id AND owner_id=p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status','locked');
  END IF;

  IF v_session.status='completed' THEN
    RETURN jsonb_build_object('result_status','duplicate','attempt_id',p_attempt_id);
  END IF;

  SELECT count(*) INTO v_answer_count
  FROM public.quiz_answers
  WHERE attempt_id=p_attempt_id
    AND scoring_version=v_session.scoring_version
    AND source_hash=v_session.source_hash;

  IF v_answer_count <> 24 THEN
    RETURN jsonb_build_object('result_status','incomplete','answer_count',v_answer_count);
  END IF;

  UPDATE public.animal_personality_results
  SET v3_scoring_version='V3_SCORING_v1.0',
      v3_source_hash='sha256:d7747005add548bad81bbeee979ec757946723b90f9ddca721559668e31bcacb',
      v3_dominant_trait_id=p_result_payload->>'dominant_trait_id',
      v3_secondary_trait_id=nullif(btrim(p_result_payload->>'secondary_trait_id'),''),
      v3_dimension_scores=p_result_payload->'dimension_scores',
      v3_round_scores=p_result_payload->'round_scores',
      v3_overall_raw=p_result_payload->'overall_raw',
      v3_stability_label=p_result_payload->>'stability_label',
      v3_completed_at=now()
  WHERE attempt_id=p_attempt_id
    AND v3_scoring_version IS NULL
    AND v3_dominant_trait_id IS NULL
    AND v3_dimension_scores IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status','canonical_result_locked');
  END IF;

  UPDATE public.animal_personality_v3_sessions
  SET status='completed',completed_at=now()
  WHERE attempt_id=p_attempt_id AND status='started';

  RETURN jsonb_build_object(
    'result_status','completed',
    'attempt_id',p_attempt_id,
    'dominant_trait_id',p_result_payload->>'dominant_trait_id',
    'secondary_trait_id',p_result_payload->>'secondary_trait_id',
    'stability_label',p_result_payload->>'stability_label'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.animal_personality_v3_extended_snapshot_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (OLD.v3_round_scores IS NOT NULL AND OLD.v3_round_scores IS DISTINCT FROM NEW.v3_round_scores)
    OR (OLD.v3_overall_raw IS NOT NULL AND OLD.v3_overall_raw IS DISTINCT FROM NEW.v3_overall_raw)
    OR (OLD.v3_source_hash IS NOT NULL AND OLD.v3_source_hash IS DISTINCT FROM NEW.v3_source_hash)
    OR (OLD.v3_completed_at IS NOT NULL AND OLD.v3_completed_at IS DISTINCT FROM NEW.v3_completed_at)
  THEN
    RAISE EXCEPTION 'ANIMAL_PERSONALITY_V3_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS animal_personality_v3_extended_snapshot_guard_trg
  ON public.animal_personality_results;
CREATE TRIGGER animal_personality_v3_extended_snapshot_guard_trg
BEFORE UPDATE ON public.animal_personality_results
FOR EACH ROW EXECUTE FUNCTION public.animal_personality_v3_extended_snapshot_guard();

REVOKE ALL ON FUNCTION public.animal_personality_prepare_v3_session(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.animal_personality_save_v3_answer(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.animal_personality_complete_v3(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.animal_personality_prepare_v3_session(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.animal_personality_save_v3_answer(uuid,uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.animal_personality_complete_v3(uuid,uuid,jsonb) TO service_role;

COMMIT;
