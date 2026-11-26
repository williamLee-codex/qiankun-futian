BEGIN;

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

 UPDATE platform.rpg_life_dispatches
 SET ability_advanced_at=coalesce(ability_advanced_at,now())
 WHERE id=p_dispatch_id AND character_id=p_character_id
   AND skill_key=p_skill_key AND status='COMPLETED'
   AND ability_advanced_at IS NULL;

 IF NOT FOUND THEN
   SELECT a.skill_value INTO v_value
   FROM platform.rpg_character_life_abilities a
   JOIN platform.rpg_life_dispatches d ON d.id=p_dispatch_id
   WHERE a.character_id=p_character_id AND a.skill_key=p_skill_key
     AND d.character_id=p_character_id AND d.skill_key=p_skill_key
     AND d.status='COMPLETED' AND d.ability_advanced_at IS NOT NULL;
   IF v_value IS NULL THEN RAISE EXCEPTION 'RPG_LIFE_COMPLETED_DISPATCH_REQUIRED'; END IF;
   RETURN v_value;
 END IF;

 UPDATE platform.rpg_character_life_abilities
 SET skill_value=least(118,skill_value+1),updated_at=now()
 WHERE character_id=p_character_id AND skill_key=p_skill_key
 RETURNING skill_value INTO v_value;

 IF v_value IS NULL THEN RAISE EXCEPTION 'RPG_LIFE_ABILITY_NOT_INITIALIZED'; END IF;
 RETURN v_value;
END;
$$;

COMMENT ON FUNCTION platform.advance_rpg_life_ability(uuid,text,uuid) IS
 'Idempotent trusted life ability progression. Each completed dispatch can advance its skill at most once; repeated calls return the existing value.';

COMMIT;
