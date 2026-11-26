BEGIN;

CREATE TABLE platform.rpg_equipment_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  operation_id text NOT NULL CHECK (char_length(btrim(operation_id)) BETWEEN 1 AND 160),
  operation_type text NOT NULL CHECK (operation_type IN ('equip','unequip','enhance','salvage')),
  instance_id uuid NULL REFERENCES platform.rpg_item_instances(id) ON DELETE SET NULL,
  equipment_slot text NULL CHECK (
    equipment_slot IS NULL OR equipment_slot IN ('weapon','helmet','armor','legs','shoes','gloves')
  ),
  result jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(character_id, operation_id)
);

ALTER TABLE platform.rpg_equipment_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform.rpg_equipment_operations FROM anon, authenticated;
GRANT SELECT ON TABLE platform.rpg_equipment_operations TO authenticated;

CREATE POLICY rpg_equipment_operations_owner_select
ON platform.rpg_equipment_operations FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM platform.rpg_characters c
    JOIN platform.rpg_players p ON p.id = c.player_id
    WHERE c.id = character_id AND p.user_id = (SELECT auth.uid())
  )
);

COMMENT ON TABLE platform.rpg_equipment_operations IS
  'Idempotent server-trusted equipment commands. Browser clients submit intent only; final stats, costs, rolls and rewards are resolved by trusted RPG rules.';

COMMIT;
