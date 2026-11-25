BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public.quiz_definitions') IS NULL
    OR to_regclass('public.quiz_definition_revisions') IS NULL
    OR to_regprocedure('public.quiz_canonical_jsonb_text(jsonb)') IS NULL
  THEN
    RAISE EXCEPTION 'ANIMAL_V4_DEFINITION_ACTIVATION_PREREQUISITE_MISSING';
  END IF;
END;
$$;

ALTER TABLE public.quiz_definitions
  ADD COLUMN IF NOT EXISTS definition_kind text NOT NULL DEFAULT 'quiz';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quiz_definitions_definition_kind_check'
  ) THEN
    ALTER TABLE public.quiz_definitions
      ADD CONSTRAINT quiz_definitions_definition_kind_check
      CHECK (definition_kind IN ('quiz', 'report_definition'));
  END IF;
END;
$$;

DROP POLICY IF EXISTS quiz_definitions_public_select ON public.quiz_definitions;
CREATE POLICY quiz_definitions_public_select ON public.quiz_definitions FOR SELECT
  USING (
    definition_kind = 'quiz'
    AND status = 'published'
    AND published_at IS NOT NULL
    AND published_at <= now()
    AND disabled_at IS NULL
    AND archived_at IS NULL
  );

CREATE OR REPLACE FUNCTION public.activate_animal_v4_report_definition_revision(
  p_definition_snapshot jsonb,
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
  v_report_version text;
  v_assessment_version text;
  v_question_version text;
  v_content_version text;
  v_scoring_version text;
  v_source_hash text;
  v_computed_hash text;
BEGIN
  IF jsonb_typeof(p_definition_snapshot) IS DISTINCT FROM 'object'
    OR p_definition_snapshot->>'runtime' IS DISTINCT FROM 'ANIMAL_PERSONALITY_V4_REPORT'
    OR jsonb_typeof(p_definition_snapshot->'v4_master') IS DISTINCT FROM 'object'
    OR p_actor_id IS NULL
    OR nullif(btrim(p_action), '') IS NULL
    OR nullif(btrim(p_reason), '') IS NULL
  THEN
    RAISE EXCEPTION 'ANIMAL_V4_DEFINITION_ACTIVATION_FAILED';
  END IF;

  v_report_version := nullif(btrim(p_definition_snapshot->>'report_version'), '');
  v_assessment_version := nullif(btrim(p_definition_snapshot->>'assessment_version'), '');
  v_question_version := nullif(btrim(p_definition_snapshot->>'question_version'), '');
  v_content_version := nullif(btrim(p_definition_snapshot->>'content_version'), '');
  v_scoring_version := nullif(btrim(p_definition_snapshot->>'scoring_version'), '');
  v_source_hash := nullif(btrim(p_definition_snapshot->>'source_hash'), '');

  IF v_report_version IS NULL
    OR p_definition_snapshot->'v4_master'->>'reportVersion' IS DISTINCT FROM v_report_version
    OR v_assessment_version IS NULL
    OR v_question_version IS NULL
    OR v_content_version IS NULL
    OR v_scoring_version IS NULL
    OR v_source_hash !~ '^sha256:[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'ANIMAL_V4_DEFINITION_ACTIVATION_FAILED';
  END IF;

  v_computed_hash := 'sha256:' || encode(
    extensions.digest(
      convert_to(public.quiz_canonical_jsonb_text(p_definition_snapshot), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  IF v_source_hash IS DISTINCT FROM v_computed_hash THEN
    RAISE EXCEPTION 'ANIMAL_V4_DEFINITION_ACTIVATION_FAILED';
  END IF;

  INSERT INTO public.quiz_definitions(
    slug,
    title,
    status,
    price_tier,
    requires_subject,
    requires_birth_data,
    ai_supplement_enabled,
    definition,
    published_at,
    definition_kind
  ) VALUES (
    'animal-personality-v4-report',
    '動物人格・全解析 Master',
    'published',
    'free',
    false,
    false,
    false,
    p_definition_snapshot,
    now(),
    'report_definition'
  )
  ON CONFLICT (slug) DO NOTHING;

  SELECT * INTO v_quiz
  FROM public.quiz_definitions
  WHERE slug = 'animal-personality-v4-report'
  FOR UPDATE;

  IF NOT FOUND
    OR v_quiz.definition_kind IS DISTINCT FROM 'report_definition'
    OR v_quiz.disabled_at IS NOT NULL
    OR v_quiz.archived_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'ANIMAL_V4_DEFINITION_ACTIVATION_FAILED';
  END IF;

  SELECT id INTO v_revision_id
  FROM public.quiz_definition_revisions
  WHERE quiz_id = v_quiz.id
    AND source_hash = v_source_hash
  LIMIT 1;

  IF v_revision_id IS NOT NULL THEN
    RAISE EXCEPTION 'ANIMAL_V4_DEFINITION_ACTIVATION_FAILED';
  END IF;

  SELECT id INTO v_previous_revision_id
  FROM public.quiz_definition_revisions
  WHERE quiz_id = v_quiz.id
    AND deactivated_at IS NULL
  LIMIT 1;

  UPDATE public.quiz_definition_revisions
  SET deactivated_at = now()
  WHERE quiz_id = v_quiz.id
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
    v_quiz.id,
    v_previous_revision_id,
    p_definition_snapshot,
    v_assessment_version,
    v_question_version,
    v_content_version,
    v_scoring_version,
    v_source_hash,
    now(),
    p_actor_id,
    p_action,
    p_reason
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.quiz_definitions
  SET definition = p_definition_snapshot,
      status = 'published',
      published_at = COALESCE(published_at, now()),
      active_revision_id = v_revision_id,
      updated_at = now()
  WHERE id = v_quiz.id;

  RETURN v_revision_id;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM = 'ANIMAL_V4_DEFINITION_ACTIVATION_FAILED' THEN
    RAISE;
  END IF;
  RAISE EXCEPTION 'ANIMAL_V4_DEFINITION_ACTIVATION_FAILED';
END;
$$;

REVOKE ALL ON FUNCTION public.activate_animal_v4_report_definition_revision(jsonb,uuid,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_animal_v4_report_definition_revision(jsonb,uuid,text,text)
  TO service_role;

COMMIT;
