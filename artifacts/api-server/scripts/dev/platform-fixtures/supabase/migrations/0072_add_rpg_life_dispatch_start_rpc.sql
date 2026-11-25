BEGIN;

CREATE OR REPLACE FUNCTION platform.start_rpg_life_dispatch(
  p_character_id uuid,
  p_work_id text,
  p_operation_id text,
  p_skill_key text,
  p_work_tier integer,
  p_qualification text,
  p_duration_minutes integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing platform.rpg_life_dispatches;
  v_id uuid;
  v_started_at timestamptz;
  v_completes_at timestamptz;
BEGIN
  IF p_character_id IS NULL
    OR char_length(btrim(coalesce(p_work_id,''))) NOT BETWEEN 1 AND 128
    OR char_length(btrim(coalesce(p_operation_id,''))) NOT BETWEEN 1 AND 160
    OR p_skill_key NOT IN ('MINING','HERBALISM','LOGGING','CONSTRUCTION','ALCHEMY','FORGING','IDENTIFICATION','COMMERCE','EXPLORATION')
    OR p_work_tier NOT BETWEEN 1 AND 10
    OR p_qualification NOT IN ('GENERAL','PROFESSIONAL','MASTER')
    OR p_duration_minutes IS NULL OR p_duration_minutes <= 0 THEN
    RAISE EXCEPTION 'RPG_LIFE_INVALID_DISPATCH';
  END IF;

  SELECT * INTO v_existing
  FROM platform.rpg_life_dispatches
  WHERE character_id=p_character_id AND operation_id=btrim(p_operation_id);

  IF FOUND THEN
    IF v_existing.work_id<>upper(btrim(p_work_id))
      OR v_existing.skill_key<>p_skill_key
      OR v_existing.work_tier<>p_work_tier
      OR v_existing.qualification<>p_qualification THEN
      RAISE EXCEPTION 'RPG_LIFE_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN jsonb_build_object(
      'resultStatus','duplicate','dispatchId',v_existing.id::text,
      'workId',v_existing.work_id,'skill',v_existing.skill_key,
      'tier',v_existing.work_tier,'qualification',v_existing.qualification,
      'startedAt',v_existing.started_at,'completesAt',v_existing.completes_at
    );
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id=p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  IF EXISTS (
    SELECT 1 FROM platform.rpg_life_dispatches
    WHERE character_id=p_character_id AND status='ACTIVE'
  ) THEN
    RAISE EXCEPTION 'RPG_LIFE_ACTIVE_DISPATCH_EXISTS';
  END IF;

  v_started_at:=now();
  v_completes_at:=v_started_at + make_interval(mins=>p_duration_minutes);

  INSERT INTO platform.rpg_life_dispatches(
    character_id,skill_key,work_id,work_tier,qualification,status,
    operation_id,started_at,completes_at
  ) VALUES(
    p_character_id,p_skill_key,upper(btrim(p_work_id)),p_work_tier,p_qualification,'ACTIVE',
    btrim(p_operation_id),v_started_at,v_completes_at
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'resultStatus','created','dispatchId',v_id::text,
    'workId',upper(btrim(p_work_id)),'skill',p_skill_key,
    'tier',p_work_tier,'qualification',p_qualification,
    'startedAt',v_started_at,'completesAt',v_completes_at
  );
END;
$$;

REVOKE ALL ON FUNCTION platform.start_rpg_life_dispatch(uuid,text,text,text,integer,text,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.start_rpg_life_dispatch(uuid,text,text,text,integer,text,integer) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION platform.start_rpg_life_dispatch(uuid,text,text,text,integer,text,integer) TO service_role;

COMMENT ON FUNCTION platform.start_rpg_life_dispatch(uuid,text,text,text,integer,text,integer) IS
  'Server-trusted dispatch persistence. Browser must not call directly or choose tier, qualification, duration, or rewards.';

COMMIT;
