BEGIN;

CREATE TABLE platform.rpg_life_reward_master (
  work_id text PRIMARY KEY CHECK (char_length(btrim(work_id)) BETWEEN 1 AND 128),
  skill_key text NOT NULL CHECK (skill_key IN ('HERBALISM','MINING','LOGGING')),
  work_tier integer NOT NULL CHECK (work_tier BETWEEN 1 AND 10),
  item_key text NOT NULL UNIQUE CHECK (char_length(btrim(item_key)) BETWEEN 1 AND 128),
  item_class text NOT NULL DEFAULT 'COMMON' CHECK (item_class='COMMON'),
  general_quantity integer NOT NULL CHECK (general_quantity > 0),
  professional_quantity integer NOT NULL CHECK (professional_quantity >= general_quantity),
  master_quantity integer NOT NULL CHECK (master_quantity >= professional_quantity),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(skill_key,work_tier)
);

ALTER TABLE platform.rpg_life_reward_master ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform.rpg_life_reward_master FROM anon,authenticated;

INSERT INTO platform.rpg_life_reward_master(
  work_id,skill_key,work_tier,item_key,general_quantity,professional_quantity,master_quantity
)
SELECT
  prefix || lpad(tier::text,2,'0'),
  skill_key,
  tier,
  'life.' || item_prefix || '.t' || lpad(tier::text,2,'0'),
  1,2,3
FROM (
  VALUES
    ('HERB','HERBALISM','herb'),
    ('MINE','MINING','ore'),
    ('WOOD','LOGGING','wood')
) AS discipline(prefix,skill_key,item_prefix)
CROSS JOIN generate_series(1,10) AS tier;

-- 0042 accepted reward payloads from trusted server code. From 0043 onward,
-- reward identity and quantity are resolved inside the database from Master Data.
REVOKE EXECUTE ON FUNCTION platform.settle_rpg_life_dispatch(uuid,uuid,text,jsonb,jsonb) FROM service_role;

CREATE OR REPLACE FUNCTION platform.settle_rpg_life_dispatch(
  p_character_id uuid,
  p_dispatch_id uuid,
  p_operation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_dispatch platform.rpg_life_dispatches;
  v_reward platform.rpg_life_reward_master;
  v_quantity integer;
  v_inventory_changes jsonb;
  v_economy jsonb;
  v_settled_at timestamptz;
BEGIN
  IF p_character_id IS NULL OR p_dispatch_id IS NULL
    OR char_length(btrim(coalesce(p_operation_id,''))) NOT BETWEEN 1 AND 160 THEN
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

  IF v_dispatch.status<>'ACTIVE' THEN RAISE EXCEPTION 'RPG_LIFE_DISPATCH_NOT_ACTIVE'; END IF;
  IF now() < v_dispatch.completes_at THEN RAISE EXCEPTION 'RPG_LIFE_DISPATCH_NOT_READY'; END IF;

  SELECT * INTO v_reward
  FROM platform.rpg_life_reward_master
  WHERE work_id=v_dispatch.work_id
    AND skill_key=v_dispatch.skill_key
    AND work_tier=v_dispatch.work_tier;

  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_LIFE_REWARD_NOT_CONFIGURED'; END IF;

  v_quantity := CASE v_dispatch.qualification
    WHEN 'GENERAL' THEN v_reward.general_quantity
    WHEN 'PROFESSIONAL' THEN v_reward.professional_quantity
    WHEN 'MASTER' THEN v_reward.master_quantity
    ELSE NULL
  END;

  IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'RPG_LIFE_REWARD_INVALID'; END IF;

  v_inventory_changes := jsonb_build_array(jsonb_build_object(
    'itemKey',v_reward.item_key,
    'itemClass',v_reward.item_class,
    'direction','credit',
    'quantity',v_quantity
  ));

  v_economy := platform.settle_rpg_economy(
    p_character_id,
    'life-dispatch:' || v_dispatch.id::text,
    'LIFE_DISPATCH',
    v_dispatch.id::text,
    '[]'::jsonb,
    v_inventory_changes
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
    'reward',jsonb_build_object(
      'itemKey',v_reward.item_key,
      'quantity',v_quantity,
      'qualification',v_dispatch.qualification
    ),
    'economy',v_economy
  );
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_life_dispatch(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_life_dispatch(uuid,uuid,text) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_life_dispatch(uuid,uuid,text) TO service_role;

COMMENT ON TABLE platform.rpg_life_reward_master IS
  'Trusted V1 gathering reward master. Stable internal item keys are intentionally separate from future localized display names.';
COMMENT ON FUNCTION platform.settle_rpg_life_dispatch(uuid,uuid,text) IS
  'Server-only life settlement. Browser/server caller supplies no reward payload; DB resolves reward from dispatch snapshot plus reward master.';

COMMIT;
