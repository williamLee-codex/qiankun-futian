-- Tarot Miyu: require the original server-stored draw when consuming quota.
-- Development candidate only; isolated validation required before deployment.
BEGIN;

ALTER TABLE public.tarot_miyu_readings
  ADD COLUMN IF NOT EXISTS draw_id uuid REFERENCES public.tarot_miyu_draw_sessions(id);

CREATE UNIQUE INDEX IF NOT EXISTS tarot_miyu_readings_owner_draw_unique
  ON public.tarot_miyu_readings (owner_id, draw_id) WHERE draw_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.tarot_miyu_consume_saved_draw(
  p_owner_id uuid,
  p_reading_request_id uuid,
  p_draw_id uuid,
  p_grant_id uuid,
  p_reading jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_draw public.tarot_miyu_draw_sessions%ROWTYPE;
  v_existing public.tarot_miyu_readings%ROWTYPE;
  v_grant public.tarot_miyu_quota_grants%ROWTYPE;
  v_result public.tarot_miyu_readings%ROWTYPE;
BEGIN
  IF p_owner_id IS NULL OR p_reading_request_id IS NULL OR p_draw_id IS NULL OR p_grant_id IS NULL OR p_reading IS NULL OR jsonb_typeof(p_reading) <> 'object' THEN
    RETURN jsonb_build_object('result_status','invalid_request');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tarot_miyu_reading:' || p_owner_id::text || ':' || p_reading_request_id::text, 0
  ));

  SELECT * INTO v_existing FROM public.tarot_miyu_readings
  WHERE owner_id = p_owner_id AND reading_request_id = p_reading_request_id;
  IF FOUND THEN
    IF v_existing.draw_id IS DISTINCT FROM p_draw_id OR v_existing.grant_id <> p_grant_id THEN
      RETURN jsonb_build_object('result_status','idempotency_conflict');
    END IF;
    RETURN jsonb_build_object('result_status','duplicate','reading_id',v_existing.id,
      'reading',v_existing.reading,'grant_id',v_existing.grant_id);
  END IF;

  SELECT * INTO v_draw FROM public.tarot_miyu_draw_sessions
  WHERE id = p_draw_id AND owner_id = p_owner_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('result_status','draw_not_found'); END IF;

  -- Lock the draw so two distinct requests cannot both consume it.
  PERFORM 1 FROM public.tarot_miyu_draw_sessions WHERE id = v_draw.id FOR UPDATE;
  SELECT * INTO v_existing FROM public.tarot_miyu_readings
  WHERE owner_id = p_owner_id AND draw_id = p_draw_id;
  IF FOUND THEN RETURN jsonb_build_object('result_status','draw_already_consumed'); END IF;

  SELECT * INTO v_grant FROM public.tarot_miyu_quota_grants
  WHERE id = p_grant_id AND owner_id = p_owner_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('result_status','grant_not_found'); END IF;
  IF (v_grant.plan_code = 'question_5' AND v_grant.scope_id <> v_draw.question_id)
     OR (v_grant.plan_code = 'category_20' AND v_grant.scope_id <> v_draw.category_id) THEN
    RETURN jsonb_build_object('result_status','grant_scope_mismatch');
  END IF;
  IF v_grant.consumed_uses >= v_grant.granted_uses THEN
    RETURN jsonb_build_object('result_status','quota_exhausted');
  END IF;

  UPDATE public.tarot_miyu_quota_grants
  SET consumed_uses = consumed_uses + 1 WHERE id = v_grant.id;

  INSERT INTO public.tarot_miyu_readings
    (owner_id, reading_request_id, grant_id, question_id, category_id, draws, reading, draw_id)
  VALUES
    (p_owner_id, p_reading_request_id, p_grant_id, v_draw.question_id,
     v_draw.category_id, v_draw.draws, p_reading, p_draw_id)
  RETURNING * INTO v_result;

  RETURN jsonb_build_object('result_status','created','reading_id',v_result.id,
    'reading',v_result.reading,'grant_id',v_grant.id,
    'remaining_uses',v_grant.granted_uses - v_grant.consumed_uses - 1);
END;
$$;

REVOKE ALL ON FUNCTION public.tarot_miyu_consume_saved_draw(uuid,uuid,uuid,uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tarot_miyu_consume_saved_draw(uuid,uuid,uuid,uuid,jsonb) TO service_role;

COMMIT;
