BEGIN;

CREATE TABLE platform.rpg_economy_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 128),
  action_type text NOT NULL CHECK (char_length(btrim(action_type)) BETWEEN 1 AND 64),
  reference_id text NOT NULL CHECK (char_length(btrim(reference_id)) BETWEEN 1 AND 128),
  result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, idempotency_key)
);

ALTER TABLE platform.rpg_economy_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform.rpg_economy_settlements FROM anon, authenticated;
GRANT SELECT ON TABLE platform.rpg_economy_settlements TO authenticated;

CREATE POLICY rpg_economy_settlements_owner_select
ON platform.rpg_economy_settlements
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM platform.rpg_characters c
    JOIN platform.rpg_players p ON p.id = c.player_id
    WHERE c.id = character_id AND p.user_id = (SELECT auth.uid())
  )
);

CREATE OR REPLACE FUNCTION platform.settle_rpg_economy(
  p_character_id uuid,
  p_idempotency_key text,
  p_action_type text,
  p_reference_id text,
  p_resource_changes jsonb DEFAULT '[]'::jsonb,
  p_inventory_changes jsonb DEFAULT '[]'::jsonb
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
  v_key text;
  v_direction text;
  v_amount bigint;
  v_class text;
  v_current bigint;
  v_result jsonb;
BEGIN
  IF p_character_id IS NULL
     OR char_length(btrim(coalesce(p_idempotency_key, ''))) NOT BETWEEN 1 AND 128
     OR char_length(btrim(coalesce(p_action_type, ''))) NOT BETWEEN 1 AND 64
     OR char_length(btrim(coalesce(p_reference_id, ''))) NOT BETWEEN 1 AND 128
     OR jsonb_typeof(p_resource_changes) <> 'array'
     OR jsonb_typeof(p_inventory_changes) <> 'array' THEN
    RAISE EXCEPTION 'RPG_ECONOMY_INVALID_SETTLEMENT';
  END IF;

  SELECT * INTO v_existing
  FROM platform.rpg_economy_settlements
  WHERE character_id = p_character_id
    AND idempotency_key = btrim(p_idempotency_key);

  IF FOUND THEN
    IF v_existing.action_type <> btrim(p_action_type)
       OR v_existing.reference_id <> btrim(p_reference_id) THEN
      RAISE EXCEPTION 'RPG_ECONOMY_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus', 'duplicate');
  END IF;

  PERFORM 1 FROM platform.rpg_characters WHERE id = p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_CHARACTER_NOT_FOUND'; END IF;

  INSERT INTO platform.rpg_economy_settlements (
    character_id, idempotency_key, action_type, reference_id
  ) VALUES (
    p_character_id, btrim(p_idempotency_key), btrim(p_action_type), btrim(p_reference_id)
  ) RETURNING id INTO v_settlement_id;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_resource_changes)
  LOOP
    v_key := v_change->>'resourceKey';
    v_direction := v_change->>'direction';
    v_amount := (v_change->>'amount')::bigint;

    IF v_key NOT IN ('silver', 'sect_contribution')
       OR v_direction NOT IN ('credit', 'debit')
       OR v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'RPG_ECONOMY_INVALID_RESOURCE_CHANGE';
    END IF;

    INSERT INTO platform.rpg_resource_balances(character_id, resource_key, balance)
    VALUES (p_character_id, v_key, 0)
    ON CONFLICT (character_id, resource_key) DO NOTHING;

    SELECT balance INTO v_current
    FROM platform.rpg_resource_balances
    WHERE character_id = p_character_id AND resource_key = v_key
    FOR UPDATE;

    IF v_direction = 'debit' AND v_current < v_amount THEN
      RAISE EXCEPTION 'RPG_ECONOMY_INSUFFICIENT_RESOURCE';
    END IF;

    UPDATE platform.rpg_resource_balances
    SET balance = balance + CASE WHEN v_direction = 'credit' THEN v_amount ELSE -v_amount END,
        updated_at = now()
    WHERE character_id = p_character_id AND resource_key = v_key;

    INSERT INTO platform.rpg_resource_events(
      character_id, resource_key, direction, amount, idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, v_direction, v_amount,
      btrim(p_idempotency_key) || ':resource:' || v_key,
      btrim(p_action_type), btrim(p_reference_id)
    );
  END LOOP;

  FOR v_change IN SELECT value FROM jsonb_array_elements(p_inventory_changes)
  LOOP
    v_key := btrim(coalesce(v_change->>'itemKey', ''));
    v_class := v_change->>'itemClass';
    v_direction := v_change->>'direction';
    v_amount := (v_change->>'quantity')::bigint;

    IF v_key = ''
       OR v_class NOT IN ('COMMON', 'CORE', 'QUEST', 'UNIQUE')
       OR v_direction NOT IN ('credit', 'debit')
       OR v_amount IS NULL OR v_amount <= 0
       OR (v_class <> 'COMMON' AND v_amount <> 1) THEN
      RAISE EXCEPTION 'RPG_ECONOMY_INVALID_INVENTORY_CHANGE';
    END IF;

    INSERT INTO platform.rpg_inventory_stacks(character_id, item_key, item_class, quantity)
    VALUES (p_character_id, v_key, v_class, 0)
    ON CONFLICT (character_id, item_key) DO NOTHING;

    SELECT quantity, item_class INTO v_current, v_class
    FROM platform.rpg_inventory_stacks
    WHERE character_id = p_character_id AND item_key = v_key
    FOR UPDATE;

    IF v_class <> (v_change->>'itemClass') THEN
      RAISE EXCEPTION 'RPG_ECONOMY_ITEM_CLASS_CONFLICT';
    END IF;
    IF v_direction = 'debit' AND v_current < v_amount THEN
      RAISE EXCEPTION 'RPG_ECONOMY_INSUFFICIENT_ITEM';
    END IF;
    IF v_direction = 'credit' AND v_class <> 'COMMON' AND v_current >= 1 THEN
      RAISE EXCEPTION 'RPG_ECONOMY_UNIQUE_ITEM_DUPLICATE';
    END IF;

    UPDATE platform.rpg_inventory_stacks
    SET quantity = quantity + CASE WHEN v_direction = 'credit' THEN v_amount ELSE -v_amount END,
        updated_at = now()
    WHERE character_id = p_character_id AND item_key = v_key;

    INSERT INTO platform.rpg_inventory_events(
      character_id, item_key, item_class, direction, quantity,
      idempotency_key, reason, reference_id
    ) VALUES (
      p_character_id, v_key, v_class, v_direction, v_amount,
      btrim(p_idempotency_key) || ':item:' || v_key,
      btrim(p_action_type), btrim(p_reference_id)
    );
  END LOOP;

  v_result := jsonb_build_object(
    'resultStatus', 'created',
    'settlementId', v_settlement_id::text,
    'characterId', p_character_id::text,
    'actionType', btrim(p_action_type),
    'referenceId', btrim(p_reference_id)
  );

  UPDATE platform.rpg_economy_settlements SET result = v_result WHERE id = v_settlement_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.settle_rpg_economy(uuid, text, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.settle_rpg_economy(uuid, text, text, text, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_economy(uuid, text, text, text, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION platform.settle_rpg_economy(uuid, text, text, text, jsonb, jsonb) IS
  'Trusted RPG server settlement only. Never expose this RPC directly to browser clients. Crystal and VIP are outside this domain.';

COMMIT;
