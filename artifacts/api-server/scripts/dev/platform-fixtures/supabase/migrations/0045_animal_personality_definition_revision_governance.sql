BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.quiz_canonical_jsonb_text(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public
AS $$
DECLARE
  v_type text := jsonb_typeof(p_value);
  v_result text;
BEGIN
  IF v_type = 'object' THEN
    SELECT '{' || COALESCE(string_agg(to_jsonb(e.key)::text || ':' || public.quiz_canonical_jsonb_text(e.value), ',' ORDER BY e.key), '') || '}'
      INTO v_result
    FROM jsonb_each(p_value) AS e
    WHERE e.key <> 'source_hash';
    RETURN v_result;
  ELSIF v_type = 'array' THEN
    SELECT '[' || COALESCE(string_agg(public.quiz_canonical_jsonb_text(a.value), ',' ORDER BY a.ordinality), '') || ']'
      INTO v_result
    FROM jsonb_array_elements(p_value) WITH ORDINALITY AS a(value, ordinality);
    RETURN v_result;
  END IF;
  RETURN p_value::text;
END;
$$;

CREATE TABLE IF NOT EXISTS public.quiz_definition_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quiz_definitions(id) ON DELETE RESTRICT,
  previous_revision_id uuid NULL REFERENCES public.quiz_definition_revisions(id) ON DELETE RESTRICT,
  definition_snapshot jsonb NOT NULL CHECK (jsonb_typeof(definition_snapshot) = 'object'),
  assessment_version text NOT NULL CHECK (length(btrim(assessment_version)) > 0),
  question_version text NOT NULL CHECK (length(btrim(question_version)) > 0),
  content_version text NOT NULL CHECK (length(btrim(content_version)) > 0),
  scoring_version text NOT NULL CHECK (length(btrim(scoring_version)) > 0),
  source_hash text NOT NULL CHECK (source_hash ~ '^sha256:[0-9a-f]{64}$'),
  activated_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz NULL,
  actor_id uuid NULL,
  action text NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quiz_definition_revisions_quiz_hash_key UNIQUE (quiz_id, source_hash)
);

CREATE UNIQUE INDEX IF NOT EXISTS quiz_definition_revisions_one_active_per_quiz_idx
  ON public.quiz_definition_revisions(quiz_id)
  WHERE deactivated_at IS NULL;

ALTER TABLE public.quiz_definition_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quiz_definition_revisions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.quiz_definition_revisions TO service_role;

ALTER TABLE public.quiz_definitions
  ADD COLUMN IF NOT EXISTS active_revision_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_definitions_active_revision_fk') THEN
    ALTER TABLE public.quiz_definitions
      ADD CONSTRAINT quiz_definitions_active_revision_fk
      FOREIGN KEY (active_revision_id)
      REFERENCES public.quiz_definition_revisions(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS version_snapshot jsonb NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quiz_attempts_version_snapshot_check') THEN
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

CREATE OR REPLACE FUNCTION public.quiz_definition_active_revision_same_quiz()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.active_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.quiz_definition_revisions qdr
    WHERE qdr.id = NEW.active_revision_id AND qdr.quiz_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'QUIZ_ACTIVE_REVISION_QUIZ_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quiz_definition_active_revision_same_quiz_trg ON public.quiz_definitions;
CREATE TRIGGER quiz_definition_active_revision_same_quiz_trg
BEFORE INSERT OR UPDATE OF active_revision_id ON public.quiz_definitions
FOR EACH ROW EXECUTE FUNCTION public.quiz_definition_active_revision_same_quiz();

DO $$
DECLARE
  v_quiz public.quiz_definitions;
  v_definition jsonb;
  v_question_version text;
  v_assessment_version text;
  v_scoring_version text;
  v_content_version text := 'CONTENT_V1.0';
  v_hash text;
  v_revision_id uuid;
  v_previous_revision_id uuid;
BEGIN
  SELECT * INTO v_quiz
  FROM public.quiz_definitions
  WHERE slug = 'animal-personality'
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    v_question_version := COALESCE(NULLIF(btrim(v_quiz.definition->>'question_version'), ''), NULLIF(btrim(v_quiz.definition->>'question_bank_version'), ''));
    v_assessment_version := NULLIF(btrim(v_quiz.definition->>'assessment_version'), '');
    v_scoring_version := NULLIF(btrim(v_quiz.definition->>'scoring_version'), '');

    IF v_question_version IS NULL OR v_assessment_version IS NULL OR v_scoring_version IS NULL THEN
      RAISE EXCEPTION 'ANIMAL_PERSONALITY_BOOTSTRAP_VERSION_FIELDS_MISSING';
    END IF;

    v_definition := (v_quiz.definition - 'source_hash') || jsonb_build_object(
      'question_version', v_question_version,
      'content_version', v_content_version
    );
    v_hash := 'sha256:' || encode(digest(convert_to(public.quiz_canonical_jsonb_text(v_definition), 'UTF8'), 'sha256'), 'hex');
    v_definition := v_definition || jsonb_build_object('source_hash', v_hash);

    SELECT id INTO v_revision_id
    FROM public.quiz_definition_revisions
    WHERE quiz_id = v_quiz.id AND source_hash = v_hash
    LIMIT 1;

    IF v_revision_id IS NULL THEN
      SELECT id INTO v_previous_revision_id
      FROM public.quiz_definition_revisions
      WHERE quiz_id = v_quiz.id
      ORDER BY activated_at DESC, created_at DESC
      LIMIT 1;

      UPDATE public.quiz_definition_revisions
      SET deactivated_at = COALESCE(deactivated_at, now())
      WHERE quiz_id = v_quiz.id AND deactivated_at IS NULL;

      INSERT INTO public.quiz_definition_revisions(
        quiz_id, previous_revision_id, definition_snapshot,
        assessment_version, question_version, content_version, scoring_version,
        source_hash, activated_at, action, reason
      ) VALUES (
        v_quiz.id, v_previous_revision_id, v_definition,
        v_assessment_version, v_question_version, v_content_version, v_scoring_version,
        v_hash, now(), 'BOOTSTRAP', '0045 immutable version binding bootstrap'
      )
      RETURNING id INTO v_revision_id;
    ELSE
      UPDATE public.quiz_definition_revisions
      SET deactivated_at = COALESCE(deactivated_at, now())
      WHERE quiz_id = v_quiz.id AND id <> v_revision_id AND deactivated_at IS NULL;
      UPDATE public.quiz_definition_revisions
      SET deactivated_at = NULL
      WHERE id = v_revision_id;
    END IF;

    UPDATE public.quiz_definitions
    SET definition = v_definition,
        active_revision_id = v_revision_id
    WHERE id = v_quiz.id;
  END IF;
END;
$$;

COMMIT;
