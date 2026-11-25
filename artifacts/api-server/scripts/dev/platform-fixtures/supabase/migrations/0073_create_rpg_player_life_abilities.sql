BEGIN;

CREATE TABLE platform.rpg_character_life_abilities (
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  skill_key text NOT NULL CHECK (skill_key IN (
    'MINING','HERBALISM','LOGGING','CONSTRUCTION','ALCHEMY',
    'FORGING','IDENTIFICATION','COMMERCE','EXPLORATION'
  )),
  skill_value integer NOT NULL DEFAULT 118 CHECK (skill_value >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(character_id,skill_key)
);

INSERT INTO platform.rpg_character_life_abilities(character_id,skill_key,skill_value)
SELECT c.id,s.skill_key,118
FROM platform.rpg_characters c
CROSS JOIN (VALUES
 ('MINING'),('HERBALISM'),('LOGGING'),('CONSTRUCTION'),('ALCHEMY'),
 ('FORGING'),('IDENTIFICATION'),('COMMERCE'),('EXPLORATION')
) AS s(skill_key)
ON CONFLICT(character_id,skill_key) DO NOTHING;

CREATE OR REPLACE FUNCTION platform.ensure_rpg_player_life_abilities(p_character_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  INSERT INTO platform.rpg_character_life_abilities(character_id,skill_key,skill_value)
  SELECT p_character_id,s.skill_key,118
  FROM (VALUES
   ('MINING'),('HERBALISM'),('LOGGING'),('CONSTRUCTION'),('ALCHEMY'),
   ('FORGING'),('IDENTIFICATION'),('COMMERCE'),('EXPLORATION')
  ) AS s(skill_key)
  ON CONFLICT(character_id,skill_key) DO NOTHING;
END;
$$;

ALTER TABLE platform.rpg_character_life_abilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform.rpg_character_life_abilities FROM anon,authenticated;
GRANT SELECT ON TABLE platform.rpg_character_life_abilities TO authenticated;

CREATE POLICY rpg_character_life_abilities_owner_select
ON platform.rpg_character_life_abilities FOR SELECT TO authenticated
USING(EXISTS(
 SELECT 1 FROM platform.rpg_characters c
 JOIN platform.rpg_players p ON p.id=c.player_id
 WHERE c.id=character_id AND p.user_id=(SELECT auth.uid())
));

REVOKE ALL ON FUNCTION platform.ensure_rpg_player_life_abilities(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform.ensure_rpg_player_life_abilities(uuid) TO service_role;

COMMENT ON TABLE platform.rpg_character_life_abilities IS
 'Trusted player life ability source. V1 player characters are MASTER-capable in all nine disciplines; follower specialization is intentionally separate.';

COMMIT;
