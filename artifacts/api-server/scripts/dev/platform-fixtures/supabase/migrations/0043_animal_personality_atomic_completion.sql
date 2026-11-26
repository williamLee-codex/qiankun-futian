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
  JOIN public.quiz_definitions qd ON qd.id = qa.quiz_id
  WHERE qa.id = p_attempt_id
    AND qa.status = 'started'
    AND qd.slug = 'animal-personality'
    AND qa.owner_id IS NOT DISTINCT FROM p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status','invalid_attempt');
  END IF;

  INSERT INTO public.animal_personality_results(
    attempt_id, assessment_version,
    v1_result_version, v1_primary_type, v1_core_scores, v1_chameleon_flag,
    v2_version, v2_profile_id, v2_display_name, v2_primary_animal, v2_secondary_animal, v2_profile_kind
  ) VALUES (
    p_attempt_id,
    coalesce(p_result_payload->>'assessment_version','V1.0'),
    p_result_payload->>'v1_result_version',
    p_result_payload#>>'{v1,primary_type}',
    p_result_payload#>'{v1,core_scores}',
    coalesce((p_result_payload#>>'{v1,is_chameleon}')::boolean,false),
    p_result_payload->>'v2_version',
    p_result_payload#>>'{v2,profile_id}',
    p_result_payload#>>'{v2,display_name}',
    p_result_payload#>>'{v2,primary_animal}',
    p_result_payload#>>'{v2,secondary_animal}',
    p_result_payload#>>'{v2,profile_kind}'
  )
  ON CONFLICT (attempt_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status','duplicate');
  END IF;

  UPDATE public.quiz_attempts
  SET status = 'completed',
      private_response = p_attempt_payload->'private_response',
      primary_result_id = p_result_payload#>>'{v1,primary_type}',
      secondary_result_id = p_result_payload#>>'{v2,profile_id}',
      completed_at = now()
  WHERE id = p_attempt_id
    AND status = 'started';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ANIMAL_PERSONALITY_ATTEMPT_STATE_CHANGED';
  END IF;

  RETURN jsonb_build_object(
    'result_status','completed',
    'attempt_id',p_attempt_id,
    'v1_primary_type',p_result_payload#>>'{v1,primary_type}',
    'v2_profile_id',p_result_payload#>>'{v2,profile_id}'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.animal_personality_complete_attempt(uuid,uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.animal_personality_complete_attempt(uuid,uuid,jsonb,jsonb) TO service_role;
