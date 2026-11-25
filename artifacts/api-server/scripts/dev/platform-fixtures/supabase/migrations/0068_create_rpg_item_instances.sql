BEGIN;

CREATE TABLE platform.rpg_item_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  item_key text NOT NULL CHECK (char_length(btrim(item_key)) BETWEEN 1 AND 128),
  instance_type text NOT NULL CHECK (instance_type = 'EQUIPMENT'),
  equipment_slot text NOT NULL CHECK (
    equipment_slot IN ('weapon', 'helmet', 'armor', 'legs', 'shoes', 'gloves')
  ),
  quality text NOT NULL CHECK (quality IN ('WHITE', 'GREEN', 'BLUE', 'PURPLE', 'GOLD', 'RED')),
  enhancement_level integer NOT NULL DEFAULT 0 CHECK (enhancement_level BETWEEN 0 AND 10),
  bound boolean NOT NULL DEFAULT true,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  source_reference_id text NOT NULL CHECK (char_length(btrim(source_reference_id)) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX rpg_item_instances_character_idx
  ON platform.rpg_item_instances(character_id, created_at DESC);

CREATE TABLE platform.rpg_item_instance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES platform.rpg_item_instances(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (
    event_type IN ('created', 'enhanced', 'equipped', 'unequipped', 'salvaged')
  ),
  idempotency_key text NOT NULL CHECK (char_length(btrim(idempotency_key)) BETWEEN 1 AND 160),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(character_id, idempotency_key)
);

CREATE TABLE platform.rpg_equipment_loadout (
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  equipment_slot text NOT NULL CHECK (
    equipment_slot IN ('weapon', 'helmet', 'armor', 'legs', 'shoes', 'gloves')
  ),
  instance_id uuid NOT NULL UNIQUE REFERENCES platform.rpg_item_instances(id) ON DELETE CASCADE,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(character_id, equipment_slot)
);

ALTER TABLE platform.rpg_item_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.rpg_item_instance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.rpg_equipment_loadout ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  platform.rpg_item_instances,
  platform.rpg_item_instance_events,
  platform.rpg_equipment_loadout
FROM anon, authenticated;

GRANT SELECT ON TABLE
  platform.rpg_item_instances,
  platform.rpg_item_instance_events,
  platform.rpg_equipment_loadout
TO authenticated;

CREATE POLICY rpg_item_instances_owner_select
ON platform.rpg_item_instances FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM platform.rpg_characters c
    JOIN platform.rpg_players p ON p.id = c.player_id
    WHERE c.id = character_id AND p.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY rpg_item_instance_events_owner_select
ON platform.rpg_item_instance_events FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM platform.rpg_characters c
    JOIN platform.rpg_players p ON p.id = c.player_id
    WHERE c.id = character_id AND p.user_id = (SELECT auth.uid())
  )
);

CREATE POLICY rpg_equipment_loadout_owner_select
ON platform.rpg_equipment_loadout FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM platform.rpg_characters c
    JOIN platform.rpg_players p ON p.id = c.player_id
    WHERE c.id = character_id AND p.user_id = (SELECT auth.uid())
  )
);

COMMENT ON TABLE platform.rpg_item_instances IS
  'Non-stackable RPG item instances. V1 equipment uses exactly six slots; stackable materials and consumables remain in rpg_inventory_stacks.';
COMMENT ON COLUMN platform.rpg_item_instances.attributes IS
  'Server-resolved item-local attributes only. Never accept authoritative attribute rolls from browser clients.';

COMMIT;
