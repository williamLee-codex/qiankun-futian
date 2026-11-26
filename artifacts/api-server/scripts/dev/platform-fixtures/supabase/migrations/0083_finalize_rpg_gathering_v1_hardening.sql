BEGIN;

-- Final V1 gathering hardening after 0034-0050 audit.
-- Remove the obsolete payload-bearing settlement signature entirely.
DROP FUNCTION IF EXISTS platform.settle_rpg_life_dispatch(uuid,uuid,text,jsonb,jsonb);

-- The runtime already caps writes at 118; enforce the same invariant in storage.
ALTER TABLE platform.rpg_character_life_abilities
  ADD CONSTRAINT rpg_character_life_abilities_skill_value_v1_range
  CHECK (skill_value BETWEEN 0 AND 118)
  NOT VALID;
ALTER TABLE platform.rpg_character_life_abilities
  VALIDATE CONSTRAINT rpg_character_life_abilities_skill_value_v1_range;

-- Restate privilege boundaries explicitly after CREATE OR REPLACE migrations.
REVOKE ALL ON FUNCTION platform.settle_rpg_life_dispatch(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform.settle_rpg_life_dispatch(uuid,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION platform.advance_rpg_life_ability(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform.advance_rpg_life_ability(uuid,text,uuid) TO service_role;

COMMENT ON CONSTRAINT rpg_character_life_abilities_skill_value_v1_range
ON platform.rpg_character_life_abilities IS
 'V1 player life ability storage invariant. Runtime starts at 25 and progression cannot exceed 118.';

COMMIT;
