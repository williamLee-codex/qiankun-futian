BEGIN;

CREATE OR REPLACE FUNCTION platform.claim_rpg_life_dispatch(
  p_dispatch_id uuid,
  p_operation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_character_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'RPG_AUTH_REQUIRED'; END IF;
  IF p_dispatch_id IS NULL
    OR char_length(btrim(coalesce(p_operation_id,''))) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'RPG_LIFE_INVALID_SETTLEMENT';
  END IF;

  SELECT d.character_id INTO v_character_id
  FROM platform.rpg_life_dispatches d
  JOIN platform.rpg_characters c ON c.id=d.character_id
  JOIN platform.rpg_players p ON p.id=c.player_id
  WHERE d.id=p_dispatch_id AND p.user_id=auth.uid();

  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_LIFE_DISPATCH_NOT_FOUND'; END IF;

  RETURN platform.settle_rpg_life_dispatch(
    v_character_id,
    p_dispatch_id,
    btrim(p_operation_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION platform.claim_rpg_life_dispatch(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.claim_rpg_life_dispatch(uuid,text) FROM anon;
GRANT EXECUTE ON FUNCTION platform.claim_rpg_life_dispatch(uuid,text) TO authenticated;

COMMENT ON FUNCTION platform.claim_rpg_life_dispatch(uuid,text) IS
  'Authenticated player claim boundary. Ownership is resolved from auth.uid(); caller cannot choose character or rewards.';

COMMIT;
