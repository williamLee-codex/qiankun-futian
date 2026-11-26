BEGIN;

CREATE OR REPLACE FUNCTION public.quiz_claim_guest_attempt(
  p_attempt_id uuid,
  p_owner_id uuid,
  p_guest_token_hash text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.quiz_attempts;
BEGIN
  IF p_attempt_id IS NULL OR p_owner_id IS NULL OR p_guest_token_hash IS NULL THEN
    RETURN 'invalid_request';
  END IF;

  SELECT qa.*
  INTO v_attempt
  FROM public.quiz_attempts qa
  WHERE qa.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'attempt_not_found';
  END IF;

  IF v_attempt.owner_id IS NOT NULL THEN
    IF v_attempt.owner_id = p_owner_id THEN
      RETURN 'already_claimed';
    END IF;

    RETURN 'owned_by_another_user';
  END IF;

  IF v_attempt.guest_token_hash IS NULL
    OR v_attempt.guest_token_hash IS DISTINCT FROM p_guest_token_hash
  THEN
    RETURN 'guest_token_mismatch';
  END IF;

  UPDATE public.quiz_attempts
  SET owner_id = p_owner_id,
      guest_token_hash = NULL
  WHERE id = p_attempt_id;

  RETURN 'claimed';
END;
$$;

REVOKE ALL ON FUNCTION public.quiz_claim_guest_attempt(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quiz_claim_guest_attempt(uuid,uuid,text) TO service_role;

COMMIT;
