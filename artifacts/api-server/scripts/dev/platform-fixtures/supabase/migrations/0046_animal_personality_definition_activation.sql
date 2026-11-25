BEGIN;

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
    OR nullif(btrim(p_assessment_version), '') IS NULL
    OR nullif(btrim(p_question_version), '') IS NULL
    OR nullif(btrim(p_content_version), '') IS NULL
    OR nullif(btrim(p_scoring_version), '') IS NULL
    OR p_source_hash !~ '^sha256:[0-9a-f]{64}$'
    OR nullif(btrim(p_action), '') IS NULL
    OR nullif(btrim(p_reason), '') IS NULL
  THEN
    RAISE EXCEPTION 'ANIMAL_DEFINITION_ACTIVATION_FAILED';
  END IF;

  SELECT * INTO v_quiz
  FROM public.quiz_definitions
  WHERE id = p_quiz_id
    AND slug = 'animal-personality'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ANIMAL_DEFINITION_ACTIVATION_FAILED';
  END IF;

  SELECT id INTO v_revision_id
  FROM public.quiz_definition_revisions
  WHERE quiz_id = p_quiz_id
    AND source_hash = p_source_hash
  LIMIT 1;

  IF v_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'ANIMAL_DEFINITION_ACTIVATION_FAILED';
  END IF;

  SELECT id INTO v_previous_revision_id
  FROM public.quiz_definition_revisions
  WHERE quiz_id = p_quiz_id
    AND deactivated_at IS NULL
  LIMIT 1;

  UPDATE public.quiz_definition_revisions
  SET deactivated_at = now()
  WHERE quiz_id = p_quiz_id
    AND deactivated_at IS NULL;

  INSERT INTO public.quiz_definition_revisions(
    quiz_id,
    previous_revision_id,
    definition_snapshot,
    assessment_version,
    question_version,
    content_version,
    scoring_version,
    source_hash,
    activated_at,
    actor_id,
    action,
    reason
  ) VALUES (
    p_quiz_id,
    v_previous_revision_id,
    p_definition_snapshot,
    p_assessment_version,
    p_question_version,
    p_content_version,
    p_scoring_version,
    p_source_hash,
    now(),
    p_actor_id,
    p_action,
    p_reason
  ) RETURNING id INTO v_revision_id;

  UPDATE public.quiz_definitions
  SET definition = p_definition_snapshot,
      active_revision_id = v_revision_id,
      updated_at = now()
  WHERE id = p_quiz_id;

  RETURN v_revision_id;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'ANIMAL_DEFINITION_ACTIVATION_FAILED' THEN
    RAISE;
  END IF;
  RAISE EXCEPTION 'ANIMAL_DEFINITION_ACTIVATION_FAILED';
END;
$$;

REVOKE ALL ON FUNCTION public.activate_animal_quiz_definition_revision(uuid,jsonb,text,text,text,text,text,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_animal_quiz_definition_revision(uuid,jsonb,text,text,text,text,text,uuid,text,text)
  TO service_role;

COMMIT;
