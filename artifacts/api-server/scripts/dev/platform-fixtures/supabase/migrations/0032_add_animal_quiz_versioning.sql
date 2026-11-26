BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS version_snapshot jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quiz_attempts_version_snapshot_check'
  ) THEN
    ALTER TABLE public.quiz_attempts
      ADD CONSTRAINT quiz_attempts_version_snapshot_check
      CHECK (
        version_snapshot IS NULL OR (
          jsonb_typeof(version_snapshot) = 'object'
          AND version_snapshot ?& ARRAY['assessment_version','question_version','content_version','scoring_version','source_hash']
          AND length(btrim(version_snapshot->>'assessment_version')) > 0
          AND length(btrim(version_snapshot->>'question_version')) > 0
          AND length(btrim(version_snapshot->>'content_version')) > 0
          AND length(btrim(version_snapshot->>'scoring_version')) > 0
          AND (version_snapshot->>'source_hash') ~ '^sha256:[0-9a-f]{64}$'
        )
      );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.quiz_definition_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quiz_definitions(id) ON DELETE RESTRICT,
  previous_revision_id uuid REFERENCES public.quiz_definition_revisions(id) ON DELETE RESTRICT,
  definition_snapshot jsonb NOT NULL CHECK (jsonb_typeof(definition_snapshot) = 'object'),
  assessment_version text NOT NULL CHECK (length(btrim(assessment_version)) > 0),
  question_version text NOT NULL CHECK (length(btrim(question_version)) > 0),
  content_version text NOT NULL CHECK (length(btrim(content_version)) > 0),
  scoring_version text NOT NULL CHECK (length(btrim(scoring_version)) > 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^sha256:[0-9a-f]{64}$'),
  activated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  actor_id uuid,
  action text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quiz_definition_revisions_quiz_hash_key UNIQUE (quiz_id, source_hash)
);

ALTER TABLE public.quiz_definition_revisions
  ALTER COLUMN action SET NOT NULL,
  ALTER COLUMN reason SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS quiz_definition_revisions_one_active_per_quiz_idx
  ON public.quiz_definition_revisions(quiz_id)
  WHERE deactivated_at IS NULL;

ALTER TABLE public.quiz_definition_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quiz_definition_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.quiz_definition_revisions TO service_role;

ALTER TABLE public.quiz_definitions
  ADD COLUMN IF NOT EXISTS active_revision_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quiz_definitions_active_revision_fk'
  ) THEN
    ALTER TABLE public.quiz_definitions
      ADD CONSTRAINT quiz_definitions_active_revision_fk
      FOREIGN KEY (active_revision_id)
      REFERENCES public.quiz_definition_revisions(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.quiz_attempt_version_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.version_snapshot IS DISTINCT FROM NEW.version_snapshot THEN
    RAISE EXCEPTION 'QUIZ_ATTEMPT_VERSION_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quiz_attempt_version_snapshot_immutable_trg ON public.quiz_attempts;
CREATE TRIGGER quiz_attempt_version_snapshot_immutable_trg
BEFORE UPDATE OF version_snapshot ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.quiz_attempt_version_snapshot_immutable();

CREATE OR REPLACE FUNCTION public.quiz_definition_revision_content_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.quiz_id IS DISTINCT FROM NEW.quiz_id
    OR OLD.previous_revision_id IS DISTINCT FROM NEW.previous_revision_id
    OR OLD.definition_snapshot IS DISTINCT FROM NEW.definition_snapshot
    OR OLD.assessment_version IS DISTINCT FROM NEW.assessment_version
    OR OLD.question_version IS DISTINCT FROM NEW.question_version
    OR OLD.content_version IS DISTINCT FROM NEW.content_version
    OR OLD.scoring_version IS DISTINCT FROM NEW.scoring_version
    OR OLD.source_hash IS DISTINCT FROM NEW.source_hash
    OR OLD.activated_at IS DISTINCT FROM NEW.activated_at
    OR OLD.actor_id IS DISTINCT FROM NEW.actor_id
    OR OLD.action IS DISTINCT FROM NEW.action
    OR OLD.reason IS DISTINCT FROM NEW.reason
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'QUIZ_DEFINITION_REVISION_CONTENT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quiz_definition_revision_content_immutable_trg ON public.quiz_definition_revisions;
CREATE TRIGGER quiz_definition_revision_content_immutable_trg
BEFORE UPDATE ON public.quiz_definition_revisions
FOR EACH ROW EXECUTE FUNCTION public.quiz_definition_revision_content_immutable();

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
  THEN
    RAISE EXCEPTION 'ANIMAL_DEFINITION_ACTIVATION_FAILED';
  END IF;

  SELECT * INTO v_quiz
  FROM public.quiz_definitions
  WHERE id=p_quiz_id AND slug='animal-personality'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ANIMAL_DEFINITION_ACTIVATION_FAILED'; END IF;

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

REVOKE ALL ON FUNCTION public.activate_animal_quiz_definition_revision(uuid,jsonb,text,text,text,text,text,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_animal_quiz_definition_revision(uuid,jsonb,text,text,text,text,text,uuid,text,text) TO service_role;

DO $$
DECLARE
  v_quiz public.quiz_definitions;
  v_revision_id uuid;
  v_assessment_version text;
  v_question_version text;
  v_content_version text;
  v_scoring_version text;
  v_source_hash text;
BEGIN
  SELECT * INTO v_quiz FROM public.quiz_definitions WHERE slug='animal-personality' LIMIT 1 FOR UPDATE;
  IF FOUND AND v_quiz.active_revision_id IS NULL THEN
    v_assessment_version := nullif(btrim(v_quiz.definition->>'assessment_version'),'');
    v_question_version := coalesce(nullif(btrim(v_quiz.definition->>'question_version'),''),nullif(btrim(v_quiz.definition->>'question_bank_version'),''));
    v_content_version := nullif(btrim(v_quiz.definition->>'content_version'),'');
    v_scoring_version := nullif(btrim(v_quiz.definition->>'scoring_version'),'');
    v_source_hash := nullif(btrim(v_quiz.definition->>'source_hash'),'');
    IF v_assessment_version IS NULL OR v_question_version IS NULL OR v_content_version IS NULL OR v_scoring_version IS NULL OR v_source_hash !~ '^sha256:[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'ANIMAL_PERSONALITY_BOOTSTRAP_VERSION_FIELDS_MISSING';
    END IF;
    INSERT INTO public.quiz_definition_revisions(
      quiz_id,definition_snapshot,assessment_version,question_version,content_version,scoring_version,source_hash,
      activated_at,action,reason
    ) VALUES (
      v_quiz.id,v_quiz.definition,v_assessment_version,v_question_version,v_content_version,v_scoring_version,v_source_hash,
      now(),'BOOTSTRAP','0032 immutable version binding bootstrap'
    )
    ON CONFLICT (quiz_id,source_hash) DO NOTHING
    RETURNING id INTO v_revision_id;
    IF v_revision_id IS NULL THEN
      SELECT id INTO v_revision_id FROM public.quiz_definition_revisions WHERE quiz_id=v_quiz.id AND source_hash=v_source_hash LIMIT 1;
    END IF;
    UPDATE public.quiz_definition_revisions SET deactivated_at=NULL WHERE id=v_revision_id;
    UPDATE public.quiz_definitions SET active_revision_id=v_revision_id WHERE id=v_quiz.id;
  END IF;
END;
$$;

COMMIT;
