-- Tarot Miyu V1: atomically consume a selected quota grant and persist a reading.
-- Development candidate only. Do not apply to production without separate authorization.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tarot_miyu_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reading_request_id uuid NOT NULL,
  grant_id uuid NOT NULL REFERENCES public.tarot_miyu_quota_grants(id),
  question_id text NOT NULL CHECK (question_id ~ '^(0[1-9]|[1-5][0-9]|60)$'),
  category_id text NOT NULL CHECK (category_id ~ '^(0[1-9]|10)$'),
  draws jsonb NOT NULL CHECK (jsonb_typeof(draws) = 'array' AND jsonb_array_length(draws) = 3),
  reading jsonb NOT NULL CHECK (jsonb_typeof(reading) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, reading_request_id)
);

CREATE INDEX IF NOT EXISTS tarot_miyu_readings_owner_created_idx
  ON public.tarot_miyu_readings (owner_id, created_at DESC);

ALTER TABLE public.tarot_miyu_readings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tarot_miyu_readings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tarot_miyu_readings TO authenticated;
DROP POLICY IF EXISTS tarot_miyu_readings_owner_read ON public.tarot_miyu_readings;
CREATE POLICY tarot_miyu_readings_owner_read ON public.tarot_miyu_readings
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);

CREATE OR REPLACE FUNCTION public.tarot_miyu_consume_quota(
  p_owner_id uuid,
  p_reading_request_id uuid,
  p_grant_id uuid,
  p_question_id text,
  p_category_id text,
  p_draws jsonb,
  p_reading jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.tarot_miyu_readings%ROWTYPE;
  v_grant public.tarot_miyu_quota_grants%ROWTYPE;
  v_reading public.tarot_miyu_readings%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL OR p_reading_request_id IS NULL OR p_grant_id IS NULL
     OR p_question_id IS NULL OR p_category_id IS NULL OR p_draws IS NULL OR p_reading IS NULL
     OR jsonb_typeof(p_draws) <> 'array' OR jsonb_array_length(p_draws) <> 3
     OR jsonb_typeof(p_reading) <> 'object' THEN
    RETURN jsonb_build_object('result_status', 'invalid_request');
  END IF;

  IF p_question_id !~ '^(0[1-9]|[1-5][0-9]|60)$'
     OR p_category_id !~ '^(0[1-9]|10)$' THEN
    RETURN jsonb_build_object('result_status', 'invalid_request');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tarot_miyu_reading:' || p_owner_id::text || ':' || p_reading_request_id::text, 0
  ));

  SELECT * INTO v_existing
  FROM public.tarot_miyu_readings
  WHERE owner_id = p_owner_id AND reading_request_id = p_reading_request_id;

  IF FOUND THEN
    IF v_existing.grant_id <> p_grant_id
       OR v_existing.question_id <> p_question_id
       OR v_existing.category_id <> p_category_id
       OR v_existing.draws <> p_draws THEN
      RETURN jsonb_build_object('result_status', 'idempotency_conflict');
    END IF;
    RETURN jsonb_build_object(
      'result_status', 'duplicate',
      'reading_id', v_existing.id,
      'reading', v_existing.reading,
      'grant_id', v_existing.grant_id
    );
  END IF;

  SELECT * INTO v_grant
  FROM public.tarot_miyu_quota_grants
  WHERE id = p_grant_id AND owner_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status', 'grant_not_found');
  END IF;

  IF (v_grant.plan_code = 'question_5' AND v_grant.scope_id <> p_question_id)
     OR (v_grant.plan_code = 'category_20' AND v_grant.scope_id <> p_category_id) THEN
    RETURN jsonb_build_object('result_status', 'grant_scope_mismatch');
  END IF;

  IF v_grant.consumed_uses >= v_grant.granted_uses THEN
    RETURN jsonb_build_object('result_status', 'quota_exhausted');
  END IF;

  UPDATE public.tarot_miyu_quota_grants
  SET consumed_uses = consumed_uses + 1
  WHERE id = v_grant.id
  RETURNING * INTO v_grant;

  INSERT INTO public.tarot_miyu_readings (
    owner_id, reading_request_id, grant_id, question_id, category_id, draws, reading
  ) VALUES (
    p_owner_id, p_reading_request_id, p_grant_id, p_question_id, p_category_id, p_draws, p_reading
  ) RETURNING * INTO v_reading;

  RETURN jsonb_build_object(
    'result_status', 'created',
    'reading_id', v_reading.id,
    'reading', v_reading.reading,
    'grant_id', v_grant.id,
    'remaining_uses', v_grant.granted_uses - v_grant.consumed_uses
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tarot_miyu_consume_quota(uuid, uuid, uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tarot_miyu_consume_quota(uuid, uuid, uuid, text, text, jsonb, jsonb)
  TO service_role;

COMMIT;
