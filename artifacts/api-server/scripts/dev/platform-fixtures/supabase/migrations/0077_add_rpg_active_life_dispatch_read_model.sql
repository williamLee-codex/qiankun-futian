BEGIN;

CREATE OR REPLACE FUNCTION platform.get_my_active_rpg_life_dispatch()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dispatch platform.rpg_life_dispatches;
  v_now timestamptz;
  v_remaining_seconds bigint;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'RPG_AUTH_REQUIRED'; END IF;

  SELECT d.* INTO v_dispatch
  FROM platform.rpg_life_dispatches d
  JOIN platform.rpg_characters c ON c.id=d.character_id
  JOIN platform.rpg_players p ON p.id=c.player_id
  WHERE p.user_id=auth.uid()
    AND d.status='ACTIVE'
  ORDER BY d.started_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('active',false);
  END IF;

  v_now:=now();
  v_remaining_seconds:=greatest(0,floor(extract(epoch FROM (v_dispatch.completes_at-v_now)))::bigint);

  RETURN jsonb_build_object(
    'active',true,
    'dispatchId',v_dispatch.id::text,
    'workId',v_dispatch.work_id,
    'skill',v_dispatch.skill_key,
    'tier',v_dispatch.work_tier,
    'qualification',v_dispatch.qualification,
    'startedAt',v_dispatch.started_at,
    'completesAt',v_dispatch.completes_at,
    'serverNow',v_now,
    'remainingSeconds',v_remaining_seconds,
    'claimable',v_dispatch.completes_at<=v_now
  );
END;
$$;

REVOKE ALL ON FUNCTION platform.get_my_active_rpg_life_dispatch() FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.get_my_active_rpg_life_dispatch() FROM anon;
GRANT EXECUTE ON FUNCTION platform.get_my_active_rpg_life_dispatch() TO authenticated;

COMMENT ON FUNCTION platform.get_my_active_rpg_life_dispatch() IS
  'Authenticated read model for the current player active life dispatch. Remaining time and claimable state use database server time.';

COMMIT;
