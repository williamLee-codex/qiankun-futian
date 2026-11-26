BEGIN;

ALTER TABLE platform.rpg_character_life_abilities
  ALTER COLUMN skill_value SET DEFAULT 25;

-- 0041 has not been deployed in the target environment yet. This migration makes
-- the intended V1 progression explicit and also safely normalizes untouched 118 rows.
UPDATE platform.rpg_character_life_abilities
SET skill_value=25,updated_at=now()
WHERE skill_value=118
  AND NOT EXISTS (
    SELECT 1 FROM platform.rpg_life_dispatches d
    WHERE d.character_id=rpg_character_life_abilities.character_id
  );

CREATE OR REPLACE FUNCTION platform.ensure_rpg_player_life_abilities(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 INSERT INTO platform.rpg_character_life_abilities(character_id,skill_key,skill_value)
 SELECT p_character_id,s.skill_key,25
 FROM (VALUES ('MINING'),('HERBALISM'),('LOGGING'),('CONSTRUCTION'),('ALCHEMY'),
 ('FORGING'),('IDENTIFICATION'),('COMMERCE'),('EXPLORATION')) AS s(skill_key)
 ON CONFLICT(character_id,skill_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION platform.advance_rpg_life_ability(
 p_character_id uuid,p_skill_key text,p_dispatch_id uuid
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_value integer;
BEGIN
 IF p_skill_key NOT IN ('MINING','HERBALISM','LOGGING','CONSTRUCTION','ALCHEMY','FORGING','IDENTIFICATION','COMMERCE','EXPLORATION')
 THEN RAISE EXCEPTION 'RPG_LIFE_INVALID_SKILL'; END IF;
 IF NOT EXISTS(
   SELECT 1 FROM platform.rpg_life_dispatches
   WHERE id=p_dispatch_id AND character_id=p_character_id AND skill_key=p_skill_key AND status='COMPLETED'
 ) THEN RAISE EXCEPTION 'RPG_LIFE_COMPLETED_DISPATCH_REQUIRED'; END IF;
 UPDATE platform.rpg_character_life_abilities
 SET skill_value=least(118,skill_value+1),updated_at=now()
 WHERE character_id=p_character_id AND skill_key=p_skill_key
 RETURNING skill_value INTO v_value;
 IF v_value IS NULL THEN RAISE EXCEPTION 'RPG_LIFE_ABILITY_NOT_INITIALIZED'; END IF;
 RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION platform.advance_rpg_life_ability(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform.advance_rpg_life_ability(uuid,text,uuid) TO service_role;

COMMENT ON TABLE platform.rpg_character_life_abilities IS
 'Trusted player life ability source. V1 starts at 25, successful work grows the used discipline, and values cap at 118.';

COMMIT;
