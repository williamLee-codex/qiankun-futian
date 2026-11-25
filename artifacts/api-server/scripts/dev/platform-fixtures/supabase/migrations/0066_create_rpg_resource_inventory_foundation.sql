BEGIN;

CREATE TABLE platform.rpg_resource_balances (
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  resource_key text NOT NULL CHECK (resource_key IN ('silver', 'sect_contribution')),
  balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, resource_key)
);

CREATE TABLE platform.rpg_resource_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  resource_key text NOT NULL CHECK (resource_key IN ('silver', 'sect_contribution')),
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount bigint NOT NULL CHECK (amount > 0),
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  reference_id text NOT NULL CHECK (btrim(reference_id) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, idempotency_key)
);

CREATE INDEX rpg_resource_events_character_created_idx
  ON platform.rpg_resource_events (character_id, created_at DESC);

CREATE TABLE platform.rpg_inventory_stacks (
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK (btrim(item_key) <> ''),
  item_class text NOT NULL CHECK (item_class IN ('COMMON', 'CORE', 'QUEST', 'UNIQUE')),
  quantity bigint NOT NULL CHECK (
    quantity >= 0
    AND (item_class = 'COMMON' OR quantity <= 1)
  ),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (character_id, item_key)
);

CREATE TABLE platform.rpg_inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK (btrim(item_key) <> ''),
  item_class text NOT NULL CHECK (item_class IN ('COMMON', 'CORE', 'QUEST', 'UNIQUE')),
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  quantity bigint NOT NULL CHECK (quantity > 0),
  idempotency_key text NOT NULL CHECK (btrim(idempotency_key) <> ''),
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  reference_id text NOT NULL CHECK (btrim(reference_id) <> ''),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (character_id, idempotency_key)
);

CREATE INDEX rpg_inventory_events_character_created_idx
  ON platform.rpg_inventory_events (character_id, created_at DESC);

ALTER TABLE platform.rpg_resource_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.rpg_resource_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.rpg_inventory_stacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.rpg_inventory_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  platform.rpg_resource_balances,
  platform.rpg_resource_events,
  platform.rpg_inventory_stacks,
  platform.rpg_inventory_events
FROM anon, authenticated;

GRANT SELECT ON TABLE
  platform.rpg_resource_balances,
  platform.rpg_resource_events,
  platform.rpg_inventory_stacks,
  platform.rpg_inventory_events
TO authenticated;

CREATE POLICY rpg_resource_balances_owner_select
ON platform.rpg_resource_balances
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM platform.rpg_characters c
    JOIN platform.rpg_players p ON p.id = c.player_id
    WHERE c.id = character_id AND p.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY rpg_resource_events_owner_select
ON platform.rpg_resource_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM platform.rpg_characters c
    JOIN platform.rpg_players p ON p.id = c.player_id
    WHERE c.id = character_id AND p.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY rpg_inventory_stacks_owner_select
ON platform.rpg_inventory_stacks
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM platform.rpg_characters c
    JOIN platform.rpg_players p ON p.id = c.player_id
    WHERE c.id = character_id AND p.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY rpg_inventory_events_owner_select
ON platform.rpg_inventory_events
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM platform.rpg_characters c
    JOIN platform.rpg_players p ON p.id = c.player_id
    WHERE c.id = character_id AND p.user_id = (SELECT auth.uid())
  )
);

COMMENT ON TABLE platform.rpg_resource_balances IS
  'RPG-private balances only. Platform crystal and VIP entitlement must never be stored here.';
COMMENT ON TABLE platform.rpg_inventory_stacks IS
  'RPG-private inventory only. No platform wallet currency or cross-app entitlement belongs here.';

COMMIT;
