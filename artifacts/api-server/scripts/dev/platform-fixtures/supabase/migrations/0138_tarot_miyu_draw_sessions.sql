-- Tarot Miyu: server-owned three-card draw records and same-question 120-hour guard.
-- Development candidate; do not apply to production without explicit approval.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tarot_miyu_draw_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id text NOT NULL CHECK (question_id ~ '^(0[1-9]|[1-5][0-9]|60)$'),
  category_id text NOT NULL CHECK (category_id ~ '^(0[1-9]|10)$'),
  draws jsonb NOT NULL CHECK (jsonb_typeof(draws) = 'array' AND jsonb_array_length(draws) = 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, id)
);

CREATE INDEX IF NOT EXISTS tarot_miyu_draw_sessions_owner_question_created_idx
  ON public.tarot_miyu_draw_sessions (owner_id, question_id, created_at DESC);

ALTER TABLE public.tarot_miyu_draw_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tarot_miyu_draw_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tarot_miyu_draw_sessions TO authenticated;
DROP POLICY IF EXISTS tarot_miyu_draw_sessions_owner_read ON public.tarot_miyu_draw_sessions;
CREATE POLICY tarot_miyu_draw_sessions_owner_read ON public.tarot_miyu_draw_sessions
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);

CREATE OR REPLACE FUNCTION public.tarot_miyu_create_draw_session(
  p_owner_id uuid,
  p_question_id text,
  p_category_id text,
  p_draws jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous timestamptz;
  v_session public.tarot_miyu_draw_sessions%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL OR p_question_id IS NULL OR p_category_id IS NULL
     OR p_question_id !~ '^(0[1-9]|[1-5][0-9]|60)$'
     OR p_category_id !~ '^(0[1-9]|10)$'
     OR p_draws IS NULL OR jsonb_typeof(p_draws) <> 'array'
     OR jsonb_array_length(p_draws) <> 3 THEN
    RETURN jsonb_build_object('result_status', 'invalid_request');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tarot_miyu_draw:' || p_owner_id::text || ':' || p_question_id, 0
  ));

  SELECT created_at INTO v_previous
  FROM public.tarot_miyu_draw_sessions
  WHERE owner_id = p_owner_id AND question_id = p_question_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_previous IS NOT NULL AND v_previous > now() - interval '120 hours' THEN
    RETURN jsonb_build_object('result_status', 'cooldown', 'next_allowed_at', v_previous + interval '120 hours');
  END IF;

  INSERT INTO public.tarot_miyu_draw_sessions (owner_id, question_id, category_id, draws)
  VALUES (p_owner_id, p_question_id, p_category_id, p_draws)
  RETURNING * INTO v_session;

  RETURN jsonb_build_object(
    'result_status', 'created', 'draw_id', v_session.id,
    'question_id', v_session.question_id, 'category_id', v_session.category_id,
    'draws', v_session.draws, 'created_at', v_session.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tarot_miyu_create_draw_session(uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tarot_miyu_create_draw_session(uuid, text, text, jsonb)
  TO service_role;

COMMIT;
