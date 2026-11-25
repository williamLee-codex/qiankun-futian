BEGIN;

CREATE TABLE platform.rpg_permanent_deputy_roster (
  roster_id text PRIMARY KEY CHECK (char_length(btrim(roster_id)) BETWEEN 1 AND 64),
  character_id text NOT NULL UNIQUE CHECK (char_length(btrim(character_id)) BETWEEN 1 AND 64),
  name text NOT NULL CHECK (btrim(name) <> ''),
  quality text NOT NULL CHECK (quality IN ('WHITE', 'GREEN', 'BLUE', 'PURPLE', 'GOLD'))
);

INSERT INTO platform.rpg_permanent_deputy_roster(roster_id, character_id, name, quality) VALUES
  ('DEP-W-01', 'CH007', '林昊', 'WHITE'),
  ('DEP-W-02', 'CH008', '林虎', 'WHITE'),
  ('DEP-W-03', 'CH009', '陳鐵', 'WHITE'),
  ('DEP-W-04', 'CH010', '趙烈', 'WHITE'),
  ('DEP-W-05', 'CH011', '周平', 'WHITE'),
  ('DEP-W-06', 'CH012', '周川', 'WHITE'),
  ('DEP-W-07', 'CH013', '許岳', 'WHITE'),
  ('DEP-W-08', 'CH024', '魏洪', 'WHITE'),
  ('DEP-G-01', 'CH019', '趙寒山', 'GREEN'),
  ('DEP-G-02', 'CH025', '柳魅', 'GREEN'),
  ('DEP-G-03', 'CH026', '莫鷹', 'GREEN'),
  ('DEP-G-04', 'CH027', '石戰', 'GREEN'),
  ('DEP-G-05', 'CH029', '寧無幽', 'GREEN'),
  ('DEP-G-06', 'CH032', '黑羽', 'GREEN'),
  ('DEP-G-07', 'CH033', '夜冥', 'GREEN'),
  ('DEP-G-08', 'CH071', '鐵無心', 'GREEN'),
  ('DEP-B-01', 'CH023', '段血河', 'BLUE'),
  ('DEP-B-02', 'CH063', '蘇星璃', 'BLUE'),
  ('DEP-B-03', 'CH067', '段千刃', 'BLUE'),
  ('DEP-B-04', 'CH068', '洛清雪', 'BLUE'),
  ('DEP-B-05', 'CH072', '月傾城', 'BLUE'),
  ('DEP-B-06', 'CH073', '獨孤馴', 'BLUE'),
  ('DEP-P-01', 'CH030', '鬼劍翁', 'PURPLE'),
  ('DEP-P-02', 'CH031', '血鈴', 'PURPLE'),
  ('DEP-P-03', 'CH042', '劍河', 'PURPLE'),
  ('DEP-P-04', 'CH070', '玄機子', 'PURPLE'),
  ('DEP-A-01', 'CH028', '司空冥', 'GOLD'),
  ('DEP-A-02', 'CH041', '劍塵', 'GOLD');

ALTER TABLE platform.rpg_permanent_deputy_roster ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform.rpg_permanent_deputy_roster FROM anon, authenticated;
GRANT SELECT ON TABLE platform.rpg_permanent_deputy_roster TO authenticated;

CREATE POLICY rpg_permanent_deputy_roster_select
ON platform.rpg_permanent_deputy_roster FOR SELECT TO authenticated
USING (true);

CREATE TABLE platform.rpg_gacha_pity_states (
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  pool_key text NOT NULL CHECK (char_length(btrim(pool_key)) BETWEEN 1 AND 64),
  since_blue_or_higher integer NOT NULL DEFAULT 0 CHECK (since_blue_or_higher >= 0),
  since_purple_or_higher integer NOT NULL DEFAULT 0 CHECK (since_purple_or_higher >= 0),
  since_gold integer NOT NULL DEFAULT 0 CHECK (since_gold >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, pool_key)
);

CREATE TABLE platform.rpg_owned_deputies (
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  roster_id text NOT NULL REFERENCES platform.rpg_permanent_deputy_roster(roster_id),
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, roster_id)
);

CREATE TABLE platform.rpg_deputy_shards (
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  roster_id text NOT NULL REFERENCES platform.rpg_permanent_deputy_roster(roster_id),
  shard_quantity bigint NOT NULL DEFAULT 0 CHECK (shard_quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, roster_id)
);

ALTER TABLE platform.rpg_gacha_pity_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.rpg_owned_deputies ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.rpg_deputy_shards ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  platform.rpg_gacha_pity_states,
  platform.rpg_owned_deputies,
  platform.rpg_deputy_shards
FROM anon, authenticated;

GRANT SELECT ON TABLE
  platform.rpg_gacha_pity_states,
  platform.rpg_owned_deputies,
  platform.rpg_deputy_shards
TO authenticated;

CREATE POLICY rpg_gacha_pity_states_owner_select
ON platform.rpg_gacha_pity_states FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM platform.rpg_characters c
  JOIN platform.rpg_players p ON p.id = c.player_id
  WHERE c.id = character_id AND p.user_id = (SELECT auth.uid())
));

CREATE POLICY rpg_owned_deputies_owner_select
ON platform.rpg_owned_deputies FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM platform.rpg_characters c
  JOIN platform.rpg_players p ON p.id = c.player_id
  WHERE c.id = character_id AND p.user_id = (SELECT auth.uid())
));

CREATE POLICY rpg_deputy_shards_owner_select
ON platform.rpg_deputy_shards FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM platform.rpg_characters c
  JOIN platform.rpg_players p ON p.id = c.player_id
  WHERE c.id = character_id AND p.user_id = (SELECT auth.uid())
));

CREATE OR REPLACE FUNCTION platform.settle_rpg_permanent_gacha(
  p_character_id uuid,
  p_idempotency_key text,
  p_resource_changes jsonb,
  p_inventory_changes jsonb,
  p_pulls jsonb,
  p_next_pity jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing platform.rpg_economy_settlements;
  v_settlement_id uuid;
  v_change jsonb;
  v_pull jsonb;
  v_key text;
  v_class text;
  v_delta bigint;
  v_current bigint;
  v_roster_id text;
  v_shard_quantity bigint;
  v_quality text;
  v_result jsonb;
  v_jade_delta bigint := 0;
  v_ticket_delta bigint := 0;
  v_resource_change_count integer;
  v_inventory_change_count integer;
BEGIN
  IF p_character_id IS NULL
     OR char_length(btrim(coalesce(p_idempotency_key, ''))) NOT BETWEEN 1 AND 128
     OR jsonb_typeof(p_resource_changes) <> 'array'
     OR jsonb_typeof(p_inventory_changes) <> 'array'
     OR jsonb_typeof(p_pulls) <> 'array'
     OR jsonb_array_length(p_pulls) <> 10
     OR jsonb_typeof(p_next_pity) <> 'object' THEN
    RAISE EXCEPTION 'RPG_GACHA_INVALID_SETTLEMENT';
  END IF;

  IF NOT (p_next_pity ?& ARRAY['sinceBlueOrHigher', 'sincePurpleOrHigher', 'sinceGold'])
     OR jsonb_typeof(p_next_pity->'sinceBlueOrHigher') <> 'number'
     OR jsonb_typeof(p_next_pity->'sincePurpleOrHigher') <> 'number'
     OR jsonb_typeof(p_next_pity->'sinceGold') <> 'number'
     OR (p_next_pity->>'sinceBlueOrHigher') !~ '^[0-9]+

  v_resource_change_count := jsonb_array_length(p_resource_changes);
  v_inventory_change_count := jsonb_array_length(p_inventory_changes);

  IF v_resource_change_count > 1 OR v_inventory_change_count > 1 THEN
    RAISE EXCEPTION 'RPG_GACHA_INVALID_PAYMENT_SHAPE';
  END IF;

  IF v_resource_change_count = 1 THEN
    v_change := p_resource_changes->0;
    IF v_change->>'resourceKey' <> 'jade'
       OR (v_change->>'delta') !~ '^-[0-9]+
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> 'gacha_permanent_ten_pull'
       OR v_existing.reference_id <> 'permanent' THEN
      RAISE EXCEPTION 'RPG_GACHA_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements(
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key),
    'gacha_permanent_ten_pull', 'permanent'
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_delta := (v_change->>'delta')::bigint;
    IF v_key <> 'jade' OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, 'jade', 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = 'jade' FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_JADE'; END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND resource_key = 'jade';

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, 'jade', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':resource:jade',
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_delta := (v_change->>'quantityDelta')::bigint;
    IF v_key <> 'SUMMON_TICKET_SINGLE' OR v_class <> 'COMMON'
       OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, 'COMMON', 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity INTO v_current FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_TICKET'; END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, 'COMMON', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':item:' || v_key,
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_pull IN SELECT value FROM jsonb_array_elements(p_pulls)
  LOOP
    v_roster_id := btrim(coalesce(v_pull->>'rosterId', ''));

    IF v_roster_id !~ '^DEP-(W|G|B|P|A)-[0-9]{2}$' THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_ROSTER_ID';
    END IF;

    SELECT quality INTO v_quality
    FROM platform.rpg_permanent_deputy_roster
    WHERE roster_id = v_roster_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPG_GACHA_UNKNOWN_DEPUTY_ROSTER_ID';
    END IF;

    v_shard_quantity := CASE v_quality
      WHEN 'WHITE' THEN 10
      WHEN 'GREEN' THEN 15
      WHEN 'BLUE' THEN 20
      WHEN 'PURPLE' THEN 30
      WHEN 'GOLD' THEN 50
      ELSE NULL
    END;

    IF v_shard_quantity IS NULL THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_QUALITY';
    END IF;

    PERFORM 1
    FROM platform.rpg_owned_deputies
    WHERE character_id = p_character_id
      AND roster_id = v_roster_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM platform.rpg_owned_deputies
      WHERE character_id = p_character_id
        AND roster_id = v_roster_id
    ) THEN
      INSERT INTO platform.rpg_deputy_shards(character_id, roster_id, shard_quantity)
      VALUES (p_character_id, v_roster_id, v_shard_quantity)
      ON CONFLICT (character_id, roster_id) DO UPDATE
      SET shard_quantity = platform.rpg_deputy_shards.shard_quantity + EXCLUDED.shard_quantity,
          updated_at = now();
    ELSE
      INSERT INTO platform.rpg_owned_deputies(character_id, roster_id)
      VALUES (p_character_id, v_roster_id);
    END IF;
  END LOOP;

  INSERT INTO platform.rpg_gacha_pity_states(
    character_id, pool_key, since_blue_or_higher, since_purple_or_higher, since_gold
  ) VALUES (
    p_character_id, 'permanent',
    (p_next_pity->>'sinceBlueOrHigher')::integer,
    (p_next_pity->>'sincePurpleOrHigher')::integer,
    (p_next_pity->>'sinceGold')::integer
  )
  ON CONFLICT (character_id, pool_key) DO UPDATE SET
    since_blue_or_higher = EXCLUDED.since_blue_or_higher,
    since_purple_or_higher = EXCLUDED.since_purple_or_higher,
    since_gold = EXCLUDED.since_gold,
    updated_at = now();

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'action', 'gacha_permanent_ten_pull',
    'reference', 'permanent'
  );

  UPDATE platform.rpg_economy_settlements
  SET result = v_result WHERE id = v_settlement_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Trusted service_role-only atomic RPG permanent gacha settlement: jade, SUMMON_TICKET_SINGLE, ten pull outcomes, deputy ownership, character-specific shards, and pity.';

COMMIT;

     OR (p_next_pity->>'sincePurpleOrHigher') !~ '^[0-9]+

  SELECT * INTO v_existing
  FROM platform.rpg_economy_settlements
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> 'gacha_permanent_ten_pull'
       OR v_existing.reference_id <> 'permanent' THEN
      RAISE EXCEPTION 'RPG_GACHA_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements(
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key),
    'gacha_permanent_ten_pull', 'permanent'
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_delta := (v_change->>'delta')::bigint;
    IF v_key <> 'jade' OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, 'jade', 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = 'jade' FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_JADE'; END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND resource_key = 'jade';

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, 'jade', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':resource:jade',
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_delta := (v_change->>'quantityDelta')::bigint;
    IF v_key <> 'SUMMON_TICKET_SINGLE' OR v_class <> 'COMMON'
       OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, 'COMMON', 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity INTO v_current FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_TICKET'; END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, 'COMMON', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':item:' || v_key,
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_pull IN SELECT value FROM jsonb_array_elements(p_pulls)
  LOOP
    v_roster_id := btrim(coalesce(v_pull->>'rosterId', ''));

    IF v_roster_id !~ '^DEP-(W|G|B|P|A)-[0-9]{2}$' THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_ROSTER_ID';
    END IF;

    SELECT quality INTO v_quality
    FROM platform.rpg_permanent_deputy_roster
    WHERE roster_id = v_roster_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPG_GACHA_UNKNOWN_DEPUTY_ROSTER_ID';
    END IF;

    v_shard_quantity := CASE v_quality
      WHEN 'WHITE' THEN 10
      WHEN 'GREEN' THEN 15
      WHEN 'BLUE' THEN 20
      WHEN 'PURPLE' THEN 30
      WHEN 'GOLD' THEN 50
      ELSE NULL
    END;

    IF v_shard_quantity IS NULL THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_QUALITY';
    END IF;

    PERFORM 1
    FROM platform.rpg_owned_deputies
    WHERE character_id = p_character_id
      AND roster_id = v_roster_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM platform.rpg_owned_deputies
      WHERE character_id = p_character_id
        AND roster_id = v_roster_id
    ) THEN
      INSERT INTO platform.rpg_deputy_shards(character_id, roster_id, shard_quantity)
      VALUES (p_character_id, v_roster_id, v_shard_quantity)
      ON CONFLICT (character_id, roster_id) DO UPDATE
      SET shard_quantity = platform.rpg_deputy_shards.shard_quantity + EXCLUDED.shard_quantity,
          updated_at = now();
    ELSE
      INSERT INTO platform.rpg_owned_deputies(character_id, roster_id)
      VALUES (p_character_id, v_roster_id);
    END IF;
  END LOOP;

  INSERT INTO platform.rpg_gacha_pity_states(
    character_id, pool_key, since_blue_or_higher, since_purple_or_higher, since_gold
  ) VALUES (
    p_character_id, 'permanent',
    (p_next_pity->>'sinceBlueOrHigher')::integer,
    (p_next_pity->>'sincePurpleOrHigher')::integer,
    (p_next_pity->>'sinceGold')::integer
  )
  ON CONFLICT (character_id, pool_key) DO UPDATE SET
    since_blue_or_higher = EXCLUDED.since_blue_or_higher,
    since_purple_or_higher = EXCLUDED.since_purple_or_higher,
    since_gold = EXCLUDED.since_gold,
    updated_at = now();

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'action', 'gacha_permanent_ten_pull',
    'reference', 'permanent'
  );

  UPDATE platform.rpg_economy_settlements
  SET result = v_result WHERE id = v_settlement_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Trusted service_role-only atomic RPG permanent gacha settlement: jade, SUMMON_TICKET_SINGLE, ten pull outcomes, deputy ownership, character-specific shards, and pity.';

COMMIT;

     OR (p_next_pity->>'sinceGold') !~ '^[0-9]+

  SELECT * INTO v_existing
  FROM platform.rpg_economy_settlements
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> 'gacha_permanent_ten_pull'
       OR v_existing.reference_id <> 'permanent' THEN
      RAISE EXCEPTION 'RPG_GACHA_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements(
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key),
    'gacha_permanent_ten_pull', 'permanent'
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_delta := (v_change->>'delta')::bigint;
    IF v_key <> 'jade' OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, 'jade', 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = 'jade' FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_JADE'; END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND resource_key = 'jade';

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, 'jade', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':resource:jade',
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_delta := (v_change->>'quantityDelta')::bigint;
    IF v_key <> 'SUMMON_TICKET_SINGLE' OR v_class <> 'COMMON'
       OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, 'COMMON', 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity INTO v_current FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_TICKET'; END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, 'COMMON', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':item:' || v_key,
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_pull IN SELECT value FROM jsonb_array_elements(p_pulls)
  LOOP
    v_roster_id := btrim(coalesce(v_pull->>'rosterId', ''));

    IF v_roster_id !~ '^DEP-(W|G|B|P|A)-[0-9]{2}$' THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_ROSTER_ID';
    END IF;

    SELECT quality INTO v_quality
    FROM platform.rpg_permanent_deputy_roster
    WHERE roster_id = v_roster_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPG_GACHA_UNKNOWN_DEPUTY_ROSTER_ID';
    END IF;

    v_shard_quantity := CASE v_quality
      WHEN 'WHITE' THEN 10
      WHEN 'GREEN' THEN 15
      WHEN 'BLUE' THEN 20
      WHEN 'PURPLE' THEN 30
      WHEN 'GOLD' THEN 50
      ELSE NULL
    END;

    IF v_shard_quantity IS NULL THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_QUALITY';
    END IF;

    PERFORM 1
    FROM platform.rpg_owned_deputies
    WHERE character_id = p_character_id
      AND roster_id = v_roster_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM platform.rpg_owned_deputies
      WHERE character_id = p_character_id
        AND roster_id = v_roster_id
    ) THEN
      INSERT INTO platform.rpg_deputy_shards(character_id, roster_id, shard_quantity)
      VALUES (p_character_id, v_roster_id, v_shard_quantity)
      ON CONFLICT (character_id, roster_id) DO UPDATE
      SET shard_quantity = platform.rpg_deputy_shards.shard_quantity + EXCLUDED.shard_quantity,
          updated_at = now();
    ELSE
      INSERT INTO platform.rpg_owned_deputies(character_id, roster_id)
      VALUES (p_character_id, v_roster_id);
    END IF;
  END LOOP;

  INSERT INTO platform.rpg_gacha_pity_states(
    character_id, pool_key, since_blue_or_higher, since_purple_or_higher, since_gold
  ) VALUES (
    p_character_id, 'permanent',
    (p_next_pity->>'sinceBlueOrHigher')::integer,
    (p_next_pity->>'sincePurpleOrHigher')::integer,
    (p_next_pity->>'sinceGold')::integer
  )
  ON CONFLICT (character_id, pool_key) DO UPDATE SET
    since_blue_or_higher = EXCLUDED.since_blue_or_higher,
    since_purple_or_higher = EXCLUDED.since_purple_or_higher,
    since_gold = EXCLUDED.since_gold,
    updated_at = now();

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'action', 'gacha_permanent_ten_pull',
    'reference', 'permanent'
  );

  UPDATE platform.rpg_economy_settlements
  SET result = v_result WHERE id = v_settlement_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Trusted service_role-only atomic RPG permanent gacha settlement: jade, SUMMON_TICKET_SINGLE, ten pull outcomes, deputy ownership, character-specific shards, and pity.';

COMMIT;

     OR (p_next_pity->>'sinceBlueOrHigher')::numeric > 9
     OR (p_next_pity->>'sincePurpleOrHigher')::numeric > 29
     OR (p_next_pity->>'sinceGold')::numeric > 59 THEN
    RAISE EXCEPTION 'RPG_GACHA_INVALID_PITY_STATE';
  END IF;

  SELECT * INTO v_existing
  FROM platform.rpg_economy_settlements
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> 'gacha_permanent_ten_pull'
       OR v_existing.reference_id <> 'permanent' THEN
      RAISE EXCEPTION 'RPG_GACHA_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements(
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key),
    'gacha_permanent_ten_pull', 'permanent'
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_delta := (v_change->>'delta')::bigint;
    IF v_key <> 'jade' OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, 'jade', 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = 'jade' FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_JADE'; END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND resource_key = 'jade';

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, 'jade', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':resource:jade',
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_delta := (v_change->>'quantityDelta')::bigint;
    IF v_key <> 'SUMMON_TICKET_SINGLE' OR v_class <> 'COMMON'
       OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, 'COMMON', 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity INTO v_current FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_TICKET'; END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, 'COMMON', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':item:' || v_key,
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_pull IN SELECT value FROM jsonb_array_elements(p_pulls)
  LOOP
    v_roster_id := btrim(coalesce(v_pull->>'rosterId', ''));

    IF v_roster_id !~ '^DEP-(W|G|B|P|A)-[0-9]{2}$' THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_ROSTER_ID';
    END IF;

    SELECT quality INTO v_quality
    FROM platform.rpg_permanent_deputy_roster
    WHERE roster_id = v_roster_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPG_GACHA_UNKNOWN_DEPUTY_ROSTER_ID';
    END IF;

    v_shard_quantity := CASE v_quality
      WHEN 'WHITE' THEN 10
      WHEN 'GREEN' THEN 15
      WHEN 'BLUE' THEN 20
      WHEN 'PURPLE' THEN 30
      WHEN 'GOLD' THEN 50
      ELSE NULL
    END;

    IF v_shard_quantity IS NULL THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_QUALITY';
    END IF;

    PERFORM 1
    FROM platform.rpg_owned_deputies
    WHERE character_id = p_character_id
      AND roster_id = v_roster_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM platform.rpg_owned_deputies
      WHERE character_id = p_character_id
        AND roster_id = v_roster_id
    ) THEN
      INSERT INTO platform.rpg_deputy_shards(character_id, roster_id, shard_quantity)
      VALUES (p_character_id, v_roster_id, v_shard_quantity)
      ON CONFLICT (character_id, roster_id) DO UPDATE
      SET shard_quantity = platform.rpg_deputy_shards.shard_quantity + EXCLUDED.shard_quantity,
          updated_at = now();
    ELSE
      INSERT INTO platform.rpg_owned_deputies(character_id, roster_id)
      VALUES (p_character_id, v_roster_id);
    END IF;
  END LOOP;

  INSERT INTO platform.rpg_gacha_pity_states(
    character_id, pool_key, since_blue_or_higher, since_purple_or_higher, since_gold
  ) VALUES (
    p_character_id, 'permanent',
    (p_next_pity->>'sinceBlueOrHigher')::integer,
    (p_next_pity->>'sincePurpleOrHigher')::integer,
    (p_next_pity->>'sinceGold')::integer
  )
  ON CONFLICT (character_id, pool_key) DO UPDATE SET
    since_blue_or_higher = EXCLUDED.since_blue_or_higher,
    since_purple_or_higher = EXCLUDED.since_purple_or_higher,
    since_gold = EXCLUDED.since_gold,
    updated_at = now();

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'action', 'gacha_permanent_ten_pull',
    'reference', 'permanent'
  );

  UPDATE platform.rpg_economy_settlements
  SET result = v_result WHERE id = v_settlement_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Trusted service_role-only atomic RPG permanent gacha settlement: jade, SUMMON_TICKET_SINGLE, ten pull outcomes, deputy ownership, character-specific shards, and pity.';

COMMIT;
 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_PAYMENT_SHAPE';
    END IF;
    v_jade_delta := (v_change->>'delta')::bigint;
  END IF;

  IF v_inventory_change_count = 1 THEN
    v_change := p_inventory_changes->0;
    IF btrim(coalesce(v_change->>'itemKey', '')) <> 'SUMMON_TICKET_SINGLE'
       OR v_change->>'itemClass' <> 'COMMON'
       OR (v_change->>'quantityDelta') !~ '^-[0-9]+
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> 'gacha_permanent_ten_pull'
       OR v_existing.reference_id <> 'permanent' THEN
      RAISE EXCEPTION 'RPG_GACHA_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements(
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key),
    'gacha_permanent_ten_pull', 'permanent'
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_delta := (v_change->>'delta')::bigint;
    IF v_key <> 'jade' OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, 'jade', 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = 'jade' FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_JADE'; END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND resource_key = 'jade';

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, 'jade', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':resource:jade',
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_delta := (v_change->>'quantityDelta')::bigint;
    IF v_key <> 'SUMMON_TICKET_SINGLE' OR v_class <> 'COMMON'
       OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, 'COMMON', 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity INTO v_current FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_TICKET'; END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, 'COMMON', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':item:' || v_key,
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_pull IN SELECT value FROM jsonb_array_elements(p_pulls)
  LOOP
    v_roster_id := btrim(coalesce(v_pull->>'rosterId', ''));

    IF v_roster_id !~ '^DEP-(W|G|B|P|A)-[0-9]{2}$' THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_ROSTER_ID';
    END IF;

    SELECT quality INTO v_quality
    FROM platform.rpg_permanent_deputy_roster
    WHERE roster_id = v_roster_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPG_GACHA_UNKNOWN_DEPUTY_ROSTER_ID';
    END IF;

    v_shard_quantity := CASE v_quality
      WHEN 'WHITE' THEN 10
      WHEN 'GREEN' THEN 15
      WHEN 'BLUE' THEN 20
      WHEN 'PURPLE' THEN 30
      WHEN 'GOLD' THEN 50
      ELSE NULL
    END;

    IF v_shard_quantity IS NULL THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_QUALITY';
    END IF;

    PERFORM 1
    FROM platform.rpg_owned_deputies
    WHERE character_id = p_character_id
      AND roster_id = v_roster_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM platform.rpg_owned_deputies
      WHERE character_id = p_character_id
        AND roster_id = v_roster_id
    ) THEN
      INSERT INTO platform.rpg_deputy_shards(character_id, roster_id, shard_quantity)
      VALUES (p_character_id, v_roster_id, v_shard_quantity)
      ON CONFLICT (character_id, roster_id) DO UPDATE
      SET shard_quantity = platform.rpg_deputy_shards.shard_quantity + EXCLUDED.shard_quantity,
          updated_at = now();
    ELSE
      INSERT INTO platform.rpg_owned_deputies(character_id, roster_id)
      VALUES (p_character_id, v_roster_id);
    END IF;
  END LOOP;

  INSERT INTO platform.rpg_gacha_pity_states(
    character_id, pool_key, since_blue_or_higher, since_purple_or_higher, since_gold
  ) VALUES (
    p_character_id, 'permanent',
    (p_next_pity->>'sinceBlueOrHigher')::integer,
    (p_next_pity->>'sincePurpleOrHigher')::integer,
    (p_next_pity->>'sinceGold')::integer
  )
  ON CONFLICT (character_id, pool_key) DO UPDATE SET
    since_blue_or_higher = EXCLUDED.since_blue_or_higher,
    since_purple_or_higher = EXCLUDED.since_purple_or_higher,
    since_gold = EXCLUDED.since_gold,
    updated_at = now();

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'action', 'gacha_permanent_ten_pull',
    'reference', 'permanent'
  );

  UPDATE platform.rpg_economy_settlements
  SET result = v_result WHERE id = v_settlement_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Trusted service_role-only atomic RPG permanent gacha settlement: jade, SUMMON_TICKET_SINGLE, ten pull outcomes, deputy ownership, character-specific shards, and pity.';

COMMIT;

     OR (p_next_pity->>'sincePurpleOrHigher') !~ '^[0-9]+

  SELECT * INTO v_existing
  FROM platform.rpg_economy_settlements
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> 'gacha_permanent_ten_pull'
       OR v_existing.reference_id <> 'permanent' THEN
      RAISE EXCEPTION 'RPG_GACHA_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements(
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key),
    'gacha_permanent_ten_pull', 'permanent'
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_delta := (v_change->>'delta')::bigint;
    IF v_key <> 'jade' OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, 'jade', 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = 'jade' FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_JADE'; END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND resource_key = 'jade';

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, 'jade', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':resource:jade',
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_delta := (v_change->>'quantityDelta')::bigint;
    IF v_key <> 'SUMMON_TICKET_SINGLE' OR v_class <> 'COMMON'
       OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, 'COMMON', 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity INTO v_current FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_TICKET'; END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, 'COMMON', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':item:' || v_key,
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_pull IN SELECT value FROM jsonb_array_elements(p_pulls)
  LOOP
    v_roster_id := btrim(coalesce(v_pull->>'rosterId', ''));

    IF v_roster_id !~ '^DEP-(W|G|B|P|A)-[0-9]{2}$' THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_ROSTER_ID';
    END IF;

    SELECT quality INTO v_quality
    FROM platform.rpg_permanent_deputy_roster
    WHERE roster_id = v_roster_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPG_GACHA_UNKNOWN_DEPUTY_ROSTER_ID';
    END IF;

    v_shard_quantity := CASE v_quality
      WHEN 'WHITE' THEN 10
      WHEN 'GREEN' THEN 15
      WHEN 'BLUE' THEN 20
      WHEN 'PURPLE' THEN 30
      WHEN 'GOLD' THEN 50
      ELSE NULL
    END;

    IF v_shard_quantity IS NULL THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_QUALITY';
    END IF;

    PERFORM 1
    FROM platform.rpg_owned_deputies
    WHERE character_id = p_character_id
      AND roster_id = v_roster_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM platform.rpg_owned_deputies
      WHERE character_id = p_character_id
        AND roster_id = v_roster_id
    ) THEN
      INSERT INTO platform.rpg_deputy_shards(character_id, roster_id, shard_quantity)
      VALUES (p_character_id, v_roster_id, v_shard_quantity)
      ON CONFLICT (character_id, roster_id) DO UPDATE
      SET shard_quantity = platform.rpg_deputy_shards.shard_quantity + EXCLUDED.shard_quantity,
          updated_at = now();
    ELSE
      INSERT INTO platform.rpg_owned_deputies(character_id, roster_id)
      VALUES (p_character_id, v_roster_id);
    END IF;
  END LOOP;

  INSERT INTO platform.rpg_gacha_pity_states(
    character_id, pool_key, since_blue_or_higher, since_purple_or_higher, since_gold
  ) VALUES (
    p_character_id, 'permanent',
    (p_next_pity->>'sinceBlueOrHigher')::integer,
    (p_next_pity->>'sincePurpleOrHigher')::integer,
    (p_next_pity->>'sinceGold')::integer
  )
  ON CONFLICT (character_id, pool_key) DO UPDATE SET
    since_blue_or_higher = EXCLUDED.since_blue_or_higher,
    since_purple_or_higher = EXCLUDED.since_purple_or_higher,
    since_gold = EXCLUDED.since_gold,
    updated_at = now();

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'action', 'gacha_permanent_ten_pull',
    'reference', 'permanent'
  );

  UPDATE platform.rpg_economy_settlements
  SET result = v_result WHERE id = v_settlement_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Trusted service_role-only atomic RPG permanent gacha settlement: jade, SUMMON_TICKET_SINGLE, ten pull outcomes, deputy ownership, character-specific shards, and pity.';

COMMIT;

     OR (p_next_pity->>'sinceGold') !~ '^[0-9]+

  SELECT * INTO v_existing
  FROM platform.rpg_economy_settlements
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> 'gacha_permanent_ten_pull'
       OR v_existing.reference_id <> 'permanent' THEN
      RAISE EXCEPTION 'RPG_GACHA_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements(
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key),
    'gacha_permanent_ten_pull', 'permanent'
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_delta := (v_change->>'delta')::bigint;
    IF v_key <> 'jade' OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, 'jade', 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = 'jade' FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_JADE'; END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND resource_key = 'jade';

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, 'jade', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':resource:jade',
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_delta := (v_change->>'quantityDelta')::bigint;
    IF v_key <> 'SUMMON_TICKET_SINGLE' OR v_class <> 'COMMON'
       OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, 'COMMON', 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity INTO v_current FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_TICKET'; END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, 'COMMON', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':item:' || v_key,
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_pull IN SELECT value FROM jsonb_array_elements(p_pulls)
  LOOP
    v_roster_id := btrim(coalesce(v_pull->>'rosterId', ''));

    IF v_roster_id !~ '^DEP-(W|G|B|P|A)-[0-9]{2}$' THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_ROSTER_ID';
    END IF;

    SELECT quality INTO v_quality
    FROM platform.rpg_permanent_deputy_roster
    WHERE roster_id = v_roster_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPG_GACHA_UNKNOWN_DEPUTY_ROSTER_ID';
    END IF;

    v_shard_quantity := CASE v_quality
      WHEN 'WHITE' THEN 10
      WHEN 'GREEN' THEN 15
      WHEN 'BLUE' THEN 20
      WHEN 'PURPLE' THEN 30
      WHEN 'GOLD' THEN 50
      ELSE NULL
    END;

    IF v_shard_quantity IS NULL THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_QUALITY';
    END IF;

    PERFORM 1
    FROM platform.rpg_owned_deputies
    WHERE character_id = p_character_id
      AND roster_id = v_roster_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM platform.rpg_owned_deputies
      WHERE character_id = p_character_id
        AND roster_id = v_roster_id
    ) THEN
      INSERT INTO platform.rpg_deputy_shards(character_id, roster_id, shard_quantity)
      VALUES (p_character_id, v_roster_id, v_shard_quantity)
      ON CONFLICT (character_id, roster_id) DO UPDATE
      SET shard_quantity = platform.rpg_deputy_shards.shard_quantity + EXCLUDED.shard_quantity,
          updated_at = now();
    ELSE
      INSERT INTO platform.rpg_owned_deputies(character_id, roster_id)
      VALUES (p_character_id, v_roster_id);
    END IF;
  END LOOP;

  INSERT INTO platform.rpg_gacha_pity_states(
    character_id, pool_key, since_blue_or_higher, since_purple_or_higher, since_gold
  ) VALUES (
    p_character_id, 'permanent',
    (p_next_pity->>'sinceBlueOrHigher')::integer,
    (p_next_pity->>'sincePurpleOrHigher')::integer,
    (p_next_pity->>'sinceGold')::integer
  )
  ON CONFLICT (character_id, pool_key) DO UPDATE SET
    since_blue_or_higher = EXCLUDED.since_blue_or_higher,
    since_purple_or_higher = EXCLUDED.since_purple_or_higher,
    since_gold = EXCLUDED.since_gold,
    updated_at = now();

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'action', 'gacha_permanent_ten_pull',
    'reference', 'permanent'
  );

  UPDATE platform.rpg_economy_settlements
  SET result = v_result WHERE id = v_settlement_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Trusted service_role-only atomic RPG permanent gacha settlement: jade, SUMMON_TICKET_SINGLE, ten pull outcomes, deputy ownership, character-specific shards, and pity.';

COMMIT;

     OR (p_next_pity->>'sinceBlueOrHigher')::numeric > 9
     OR (p_next_pity->>'sincePurpleOrHigher')::numeric > 29
     OR (p_next_pity->>'sinceGold')::numeric > 59 THEN
    RAISE EXCEPTION 'RPG_GACHA_INVALID_PITY_STATE';
  END IF;

  SELECT * INTO v_existing
  FROM platform.rpg_economy_settlements
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> 'gacha_permanent_ten_pull'
       OR v_existing.reference_id <> 'permanent' THEN
      RAISE EXCEPTION 'RPG_GACHA_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements(
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key),
    'gacha_permanent_ten_pull', 'permanent'
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_delta := (v_change->>'delta')::bigint;
    IF v_key <> 'jade' OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, 'jade', 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = 'jade' FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_JADE'; END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND resource_key = 'jade';

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, 'jade', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':resource:jade',
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_delta := (v_change->>'quantityDelta')::bigint;
    IF v_key <> 'SUMMON_TICKET_SINGLE' OR v_class <> 'COMMON'
       OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, 'COMMON', 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity INTO v_current FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_TICKET'; END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, 'COMMON', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':item:' || v_key,
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_pull IN SELECT value FROM jsonb_array_elements(p_pulls)
  LOOP
    v_roster_id := btrim(coalesce(v_pull->>'rosterId', ''));

    IF v_roster_id !~ '^DEP-(W|G|B|P|A)-[0-9]{2}$' THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_ROSTER_ID';
    END IF;

    SELECT quality INTO v_quality
    FROM platform.rpg_permanent_deputy_roster
    WHERE roster_id = v_roster_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPG_GACHA_UNKNOWN_DEPUTY_ROSTER_ID';
    END IF;

    v_shard_quantity := CASE v_quality
      WHEN 'WHITE' THEN 10
      WHEN 'GREEN' THEN 15
      WHEN 'BLUE' THEN 20
      WHEN 'PURPLE' THEN 30
      WHEN 'GOLD' THEN 50
      ELSE NULL
    END;

    IF v_shard_quantity IS NULL THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_QUALITY';
    END IF;

    PERFORM 1
    FROM platform.rpg_owned_deputies
    WHERE character_id = p_character_id
      AND roster_id = v_roster_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM platform.rpg_owned_deputies
      WHERE character_id = p_character_id
        AND roster_id = v_roster_id
    ) THEN
      INSERT INTO platform.rpg_deputy_shards(character_id, roster_id, shard_quantity)
      VALUES (p_character_id, v_roster_id, v_shard_quantity)
      ON CONFLICT (character_id, roster_id) DO UPDATE
      SET shard_quantity = platform.rpg_deputy_shards.shard_quantity + EXCLUDED.shard_quantity,
          updated_at = now();
    ELSE
      INSERT INTO platform.rpg_owned_deputies(character_id, roster_id)
      VALUES (p_character_id, v_roster_id);
    END IF;
  END LOOP;

  INSERT INTO platform.rpg_gacha_pity_states(
    character_id, pool_key, since_blue_or_higher, since_purple_or_higher, since_gold
  ) VALUES (
    p_character_id, 'permanent',
    (p_next_pity->>'sinceBlueOrHigher')::integer,
    (p_next_pity->>'sincePurpleOrHigher')::integer,
    (p_next_pity->>'sinceGold')::integer
  )
  ON CONFLICT (character_id, pool_key) DO UPDATE SET
    since_blue_or_higher = EXCLUDED.since_blue_or_higher,
    since_purple_or_higher = EXCLUDED.since_purple_or_higher,
    since_gold = EXCLUDED.since_gold,
    updated_at = now();

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'action', 'gacha_permanent_ten_pull',
    'reference', 'permanent'
  );

  UPDATE platform.rpg_economy_settlements
  SET result = v_result WHERE id = v_settlement_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Trusted service_role-only atomic RPG permanent gacha settlement: jade, SUMMON_TICKET_SINGLE, ten pull outcomes, deputy ownership, character-specific shards, and pity.';

COMMIT;
 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_PAYMENT_SHAPE';
    END IF;
    v_ticket_delta := (v_change->>'quantityDelta')::bigint;
  END IF;

  IF NOT (
    (v_ticket_delta = 0 AND v_jade_delta = -888)
    OR (v_ticket_delta = -7 AND v_jade_delta = -300)
    OR (v_ticket_delta = -8 AND v_jade_delta = -200)
    OR (v_ticket_delta = -9 AND v_jade_delta = -100)
    OR (v_ticket_delta = -10 AND v_jade_delta = 0)
  ) THEN
    RAISE EXCEPTION 'RPG_GACHA_INVALID_PAYMENT_COMBINATION';
  END IF;

  SELECT * INTO v_existing
  FROM platform.rpg_economy_settlements
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> 'gacha_permanent_ten_pull'
       OR v_existing.reference_id <> 'permanent' THEN
      RAISE EXCEPTION 'RPG_GACHA_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements(
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key),
    'gacha_permanent_ten_pull', 'permanent'
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_delta := (v_change->>'delta')::bigint;
    IF v_key <> 'jade' OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, 'jade', 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = 'jade' FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_JADE'; END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND resource_key = 'jade';

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, 'jade', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':resource:jade',
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_delta := (v_change->>'quantityDelta')::bigint;
    IF v_key <> 'SUMMON_TICKET_SINGLE' OR v_class <> 'COMMON'
       OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, 'COMMON', 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity INTO v_current FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_TICKET'; END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, 'COMMON', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':item:' || v_key,
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_pull IN SELECT value FROM jsonb_array_elements(p_pulls)
  LOOP
    v_roster_id := btrim(coalesce(v_pull->>'rosterId', ''));

    IF v_roster_id !~ '^DEP-(W|G|B|P|A)-[0-9]{2}$' THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_ROSTER_ID';
    END IF;

    SELECT quality INTO v_quality
    FROM platform.rpg_permanent_deputy_roster
    WHERE roster_id = v_roster_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPG_GACHA_UNKNOWN_DEPUTY_ROSTER_ID';
    END IF;

    v_shard_quantity := CASE v_quality
      WHEN 'WHITE' THEN 10
      WHEN 'GREEN' THEN 15
      WHEN 'BLUE' THEN 20
      WHEN 'PURPLE' THEN 30
      WHEN 'GOLD' THEN 50
      ELSE NULL
    END;

    IF v_shard_quantity IS NULL THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_QUALITY';
    END IF;

    PERFORM 1
    FROM platform.rpg_owned_deputies
    WHERE character_id = p_character_id
      AND roster_id = v_roster_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM platform.rpg_owned_deputies
      WHERE character_id = p_character_id
        AND roster_id = v_roster_id
    ) THEN
      INSERT INTO platform.rpg_deputy_shards(character_id, roster_id, shard_quantity)
      VALUES (p_character_id, v_roster_id, v_shard_quantity)
      ON CONFLICT (character_id, roster_id) DO UPDATE
      SET shard_quantity = platform.rpg_deputy_shards.shard_quantity + EXCLUDED.shard_quantity,
          updated_at = now();
    ELSE
      INSERT INTO platform.rpg_owned_deputies(character_id, roster_id)
      VALUES (p_character_id, v_roster_id);
    END IF;
  END LOOP;

  INSERT INTO platform.rpg_gacha_pity_states(
    character_id, pool_key, since_blue_or_higher, since_purple_or_higher, since_gold
  ) VALUES (
    p_character_id, 'permanent',
    (p_next_pity->>'sinceBlueOrHigher')::integer,
    (p_next_pity->>'sincePurpleOrHigher')::integer,
    (p_next_pity->>'sinceGold')::integer
  )
  ON CONFLICT (character_id, pool_key) DO UPDATE SET
    since_blue_or_higher = EXCLUDED.since_blue_or_higher,
    since_purple_or_higher = EXCLUDED.since_purple_or_higher,
    since_gold = EXCLUDED.since_gold,
    updated_at = now();

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'action', 'gacha_permanent_ten_pull',
    'reference', 'permanent'
  );

  UPDATE platform.rpg_economy_settlements
  SET result = v_result WHERE id = v_settlement_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Trusted service_role-only atomic RPG permanent gacha settlement: jade, SUMMON_TICKET_SINGLE, ten pull outcomes, deputy ownership, character-specific shards, and pity.';

COMMIT;

     OR (p_next_pity->>'sincePurpleOrHigher') !~ '^[0-9]+

  SELECT * INTO v_existing
  FROM platform.rpg_economy_settlements
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> 'gacha_permanent_ten_pull'
       OR v_existing.reference_id <> 'permanent' THEN
      RAISE EXCEPTION 'RPG_GACHA_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements(
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key),
    'gacha_permanent_ten_pull', 'permanent'
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_delta := (v_change->>'delta')::bigint;
    IF v_key <> 'jade' OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, 'jade', 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = 'jade' FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_JADE'; END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND resource_key = 'jade';

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, 'jade', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':resource:jade',
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_delta := (v_change->>'quantityDelta')::bigint;
    IF v_key <> 'SUMMON_TICKET_SINGLE' OR v_class <> 'COMMON'
       OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, 'COMMON', 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity INTO v_current FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_TICKET'; END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, 'COMMON', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':item:' || v_key,
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_pull IN SELECT value FROM jsonb_array_elements(p_pulls)
  LOOP
    v_roster_id := btrim(coalesce(v_pull->>'rosterId', ''));

    IF v_roster_id !~ '^DEP-(W|G|B|P|A)-[0-9]{2}$' THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_ROSTER_ID';
    END IF;

    SELECT quality INTO v_quality
    FROM platform.rpg_permanent_deputy_roster
    WHERE roster_id = v_roster_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPG_GACHA_UNKNOWN_DEPUTY_ROSTER_ID';
    END IF;

    v_shard_quantity := CASE v_quality
      WHEN 'WHITE' THEN 10
      WHEN 'GREEN' THEN 15
      WHEN 'BLUE' THEN 20
      WHEN 'PURPLE' THEN 30
      WHEN 'GOLD' THEN 50
      ELSE NULL
    END;

    IF v_shard_quantity IS NULL THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_QUALITY';
    END IF;

    PERFORM 1
    FROM platform.rpg_owned_deputies
    WHERE character_id = p_character_id
      AND roster_id = v_roster_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM platform.rpg_owned_deputies
      WHERE character_id = p_character_id
        AND roster_id = v_roster_id
    ) THEN
      INSERT INTO platform.rpg_deputy_shards(character_id, roster_id, shard_quantity)
      VALUES (p_character_id, v_roster_id, v_shard_quantity)
      ON CONFLICT (character_id, roster_id) DO UPDATE
      SET shard_quantity = platform.rpg_deputy_shards.shard_quantity + EXCLUDED.shard_quantity,
          updated_at = now();
    ELSE
      INSERT INTO platform.rpg_owned_deputies(character_id, roster_id)
      VALUES (p_character_id, v_roster_id);
    END IF;
  END LOOP;

  INSERT INTO platform.rpg_gacha_pity_states(
    character_id, pool_key, since_blue_or_higher, since_purple_or_higher, since_gold
  ) VALUES (
    p_character_id, 'permanent',
    (p_next_pity->>'sinceBlueOrHigher')::integer,
    (p_next_pity->>'sincePurpleOrHigher')::integer,
    (p_next_pity->>'sinceGold')::integer
  )
  ON CONFLICT (character_id, pool_key) DO UPDATE SET
    since_blue_or_higher = EXCLUDED.since_blue_or_higher,
    since_purple_or_higher = EXCLUDED.since_purple_or_higher,
    since_gold = EXCLUDED.since_gold,
    updated_at = now();

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'action', 'gacha_permanent_ten_pull',
    'reference', 'permanent'
  );

  UPDATE platform.rpg_economy_settlements
  SET result = v_result WHERE id = v_settlement_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Trusted service_role-only atomic RPG permanent gacha settlement: jade, SUMMON_TICKET_SINGLE, ten pull outcomes, deputy ownership, character-specific shards, and pity.';

COMMIT;

     OR (p_next_pity->>'sinceGold') !~ '^[0-9]+

  SELECT * INTO v_existing
  FROM platform.rpg_economy_settlements
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> 'gacha_permanent_ten_pull'
       OR v_existing.reference_id <> 'permanent' THEN
      RAISE EXCEPTION 'RPG_GACHA_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements(
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key),
    'gacha_permanent_ten_pull', 'permanent'
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_delta := (v_change->>'delta')::bigint;
    IF v_key <> 'jade' OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, 'jade', 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = 'jade' FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_JADE'; END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND resource_key = 'jade';

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, 'jade', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':resource:jade',
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_delta := (v_change->>'quantityDelta')::bigint;
    IF v_key <> 'SUMMON_TICKET_SINGLE' OR v_class <> 'COMMON'
       OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, 'COMMON', 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity INTO v_current FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_TICKET'; END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, 'COMMON', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':item:' || v_key,
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_pull IN SELECT value FROM jsonb_array_elements(p_pulls)
  LOOP
    v_roster_id := btrim(coalesce(v_pull->>'rosterId', ''));

    IF v_roster_id !~ '^DEP-(W|G|B|P|A)-[0-9]{2}$' THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_ROSTER_ID';
    END IF;

    SELECT quality INTO v_quality
    FROM platform.rpg_permanent_deputy_roster
    WHERE roster_id = v_roster_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPG_GACHA_UNKNOWN_DEPUTY_ROSTER_ID';
    END IF;

    v_shard_quantity := CASE v_quality
      WHEN 'WHITE' THEN 10
      WHEN 'GREEN' THEN 15
      WHEN 'BLUE' THEN 20
      WHEN 'PURPLE' THEN 30
      WHEN 'GOLD' THEN 50
      ELSE NULL
    END;

    IF v_shard_quantity IS NULL THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_QUALITY';
    END IF;

    PERFORM 1
    FROM platform.rpg_owned_deputies
    WHERE character_id = p_character_id
      AND roster_id = v_roster_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM platform.rpg_owned_deputies
      WHERE character_id = p_character_id
        AND roster_id = v_roster_id
    ) THEN
      INSERT INTO platform.rpg_deputy_shards(character_id, roster_id, shard_quantity)
      VALUES (p_character_id, v_roster_id, v_shard_quantity)
      ON CONFLICT (character_id, roster_id) DO UPDATE
      SET shard_quantity = platform.rpg_deputy_shards.shard_quantity + EXCLUDED.shard_quantity,
          updated_at = now();
    ELSE
      INSERT INTO platform.rpg_owned_deputies(character_id, roster_id)
      VALUES (p_character_id, v_roster_id);
    END IF;
  END LOOP;

  INSERT INTO platform.rpg_gacha_pity_states(
    character_id, pool_key, since_blue_or_higher, since_purple_or_higher, since_gold
  ) VALUES (
    p_character_id, 'permanent',
    (p_next_pity->>'sinceBlueOrHigher')::integer,
    (p_next_pity->>'sincePurpleOrHigher')::integer,
    (p_next_pity->>'sinceGold')::integer
  )
  ON CONFLICT (character_id, pool_key) DO UPDATE SET
    since_blue_or_higher = EXCLUDED.since_blue_or_higher,
    since_purple_or_higher = EXCLUDED.since_purple_or_higher,
    since_gold = EXCLUDED.since_gold,
    updated_at = now();

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'action', 'gacha_permanent_ten_pull',
    'reference', 'permanent'
  );

  UPDATE platform.rpg_economy_settlements
  SET result = v_result WHERE id = v_settlement_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Trusted service_role-only atomic RPG permanent gacha settlement: jade, SUMMON_TICKET_SINGLE, ten pull outcomes, deputy ownership, character-specific shards, and pity.';

COMMIT;

     OR (p_next_pity->>'sinceBlueOrHigher')::numeric > 9
     OR (p_next_pity->>'sincePurpleOrHigher')::numeric > 29
     OR (p_next_pity->>'sinceGold')::numeric > 59 THEN
    RAISE EXCEPTION 'RPG_GACHA_INVALID_PITY_STATE';
  END IF;

  SELECT * INTO v_existing
  FROM platform.rpg_economy_settlements
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> 'gacha_permanent_ten_pull'
       OR v_existing.reference_id <> 'permanent' THEN
      RAISE EXCEPTION 'RPG_GACHA_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements(
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key),
    'gacha_permanent_ten_pull', 'permanent'
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_delta := (v_change->>'delta')::bigint;
    IF v_key <> 'jade' OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, 'jade', 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = 'jade' FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_JADE'; END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND resource_key = 'jade';

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, 'jade', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':resource:jade',
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_delta := (v_change->>'quantityDelta')::bigint;
    IF v_key <> 'SUMMON_TICKET_SINGLE' OR v_class <> 'COMMON'
       OR v_delta IS NULL OR v_delta >= 0 THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, 'COMMON', 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity INTO v_current FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key FOR UPDATE;
    IF v_current + v_delta < 0 THEN RAISE EXCEPTION 'RPG_GACHA_INSUFFICIENT_TICKET'; END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + v_delta, updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, 'COMMON', 'debit', -v_delta,
      btrim(p_idempotency_key) || ':item:' || v_key,
      'gacha_permanent_ten_pull', 'permanent'
    );
  END LOOP;

  FOR v_pull IN SELECT value FROM jsonb_array_elements(p_pulls)
  LOOP
    v_roster_id := btrim(coalesce(v_pull->>'rosterId', ''));

    IF v_roster_id !~ '^DEP-(W|G|B|P|A)-[0-9]{2}$' THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_ROSTER_ID';
    END IF;

    SELECT quality INTO v_quality
    FROM platform.rpg_permanent_deputy_roster
    WHERE roster_id = v_roster_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'RPG_GACHA_UNKNOWN_DEPUTY_ROSTER_ID';
    END IF;

    v_shard_quantity := CASE v_quality
      WHEN 'WHITE' THEN 10
      WHEN 'GREEN' THEN 15
      WHEN 'BLUE' THEN 20
      WHEN 'PURPLE' THEN 30
      WHEN 'GOLD' THEN 50
      ELSE NULL
    END;

    IF v_shard_quantity IS NULL THEN
      RAISE EXCEPTION 'RPG_GACHA_INVALID_QUALITY';
    END IF;

    PERFORM 1
    FROM platform.rpg_owned_deputies
    WHERE character_id = p_character_id
      AND roster_id = v_roster_id
    FOR UPDATE;

    IF EXISTS (
      SELECT 1
      FROM platform.rpg_owned_deputies
      WHERE character_id = p_character_id
        AND roster_id = v_roster_id
    ) THEN
      INSERT INTO platform.rpg_deputy_shards(character_id, roster_id, shard_quantity)
      VALUES (p_character_id, v_roster_id, v_shard_quantity)
      ON CONFLICT (character_id, roster_id) DO UPDATE
      SET shard_quantity = platform.rpg_deputy_shards.shard_quantity + EXCLUDED.shard_quantity,
          updated_at = now();
    ELSE
      INSERT INTO platform.rpg_owned_deputies(character_id, roster_id)
      VALUES (p_character_id, v_roster_id);
    END IF;
  END LOOP;

  INSERT INTO platform.rpg_gacha_pity_states(
    character_id, pool_key, since_blue_or_higher, since_purple_or_higher, since_gold
  ) VALUES (
    p_character_id, 'permanent',
    (p_next_pity->>'sinceBlueOrHigher')::integer,
    (p_next_pity->>'sincePurpleOrHigher')::integer,
    (p_next_pity->>'sinceGold')::integer
  )
  ON CONFLICT (character_id, pool_key) DO UPDATE SET
    since_blue_or_higher = EXCLUDED.since_blue_or_higher,
    since_purple_or_higher = EXCLUDED.since_purple_or_higher,
    since_gold = EXCLUDED.since_gold,
    updated_at = now();

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'action', 'gacha_permanent_ten_pull',
    'reference', 'permanent'
  );

  UPDATE platform.rpg_economy_settlements
  SET result = v_result WHERE id = v_settlement_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_permanent_gacha(uuid, text, jsonb, jsonb, jsonb, jsonb) IS
  'Trusted service_role-only atomic RPG permanent gacha settlement: jade, SUMMON_TICKET_SINGLE, ten pull outcomes, deputy ownership, character-specific shards, and pity.';

COMMIT;
