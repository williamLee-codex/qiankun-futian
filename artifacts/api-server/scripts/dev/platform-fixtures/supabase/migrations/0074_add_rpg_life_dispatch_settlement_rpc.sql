BEGIN;

ALTER TABLE platform.rpg_life_dispatches
  ADD COLUMN settlement_operation_id text NULL
    CHECK (settlement_operation_id IS NULL OR char_length(btrim(settlement_operation_id)) BETWEEN 1 AND 160);

CREATE OR REPLACE FUNCTION platform.settle_rpg_life_dispatch(
  p_character_id uuid,
  p_dispatch_id uuid,
  p_operation_id text,
  p_resource_changes jsonb DEFAULT '[]'::jsonb,
  p_inventory_changes jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dispatch platform.rpg_life_dispatches;
  v_economy jsonb;
  v_settled_at timestamptz;
BEGIN
  IF p_character_id IS NULL OR p_dispatch_id IS NULL
    OR char_length(btrim(coalesce(p_operation_id,''))) NOT BETWEEN 1 AND 160
    OR jsonb_typeof(p_resource_changes) <> 'array'
    OR jsonb_typeof(p_inventory_changes) <> 'array' THEN
    RAISE EXCEPTION 'RPG_LIFE_INVALID_SETTLEMENT';
  END IF;

  SELECT * INTO v_dispatch
  FROM platform.rpg_life_dispatches
  WHERE id=p_dispatch_id AND character_id=p_character_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_LIFE_DISPATCH_NOT_FOUND'; END IF;

  IF v_dispatch.status='COMPLETED' THEN
    IF v_dispatch.settlement_operation_id=btrim(p_operation_id) THEN
      RETURN jsonb_build_object(
        'resultStatus','duplicate',
        'dispatchId',v_dispatch.id::text,
        'settledAt',v_dispatch.settled_at
      );
    END IF;
    RAISE EXCEPTION 'RPG_LIFE_SETTLEMENT_CONFLICT';
  END IF;

  IF v_dispatch.status<>'ACTIVE' THEN
    RAISE EXCEPTION 'RPG_LIFE_DISPATCH_NOT_ACTIVE';
  END IF;

  IF now() < v_dispatch.completes_at THEN
    RAISE EXCEPTION 'RPG_LIFE_DISPATCH_NOT_READY';
  END IF;

  v_economy := platform.settle_rpg_economy(
    p_character_id,
    'life-dispatch:' || v_dispatch.id::text,
    'LIFE_DISPATCH',
    v_dispatch.id::text,
    p_resource_changes,
    p_inventory_changes
  );

  v_settled_at:=now();
  UPDATE platform.rpg_life_dispatches
  SET status='COMPLETED',
      settled_at=v_settled_at,
      settlement_operation_id=btrim(p_operation_id)
  WHERE id=v_dispatch.id;

  RETURN jsonb_build_object(
    'resultStatus','created',
    'dispatchId',v_dispatch.id::text,
    'settledAt',v_settled_at,
    'economy',v_economy
  );
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_life_dispatch(uuid,uuid,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_life_dispatch(uuid,uuid,text,jsonb,jsonb) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_life_dispatch(uuid,uuid,text,jsonb,jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_life_dispatch(uuid,uuid,text,jsonb,jsonb) IS
  'Trusted server-only life dispatch settlement. Enforces server time, one-time completion, and atomic economy settlement. Reward payload must be resolved by trusted server code, never browser input.';

COMMIT;
