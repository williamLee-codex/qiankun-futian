BEGIN;

CREATE TABLE platform.rpg_life_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id uuid NOT NULL REFERENCES platform.rpg_characters(id) ON DELETE CASCADE,
  skill_key text NOT NULL CHECK (skill_key IN (
    'MINING','HERBALISM','LOGGING','CONSTRUCTION','ALCHEMY',
    'FORGING','IDENTIFICATION','COMMERCE','EXPLORATION'
  )),
  work_id text NOT NULL CHECK (char_length(btrim(work_id)) BETWEEN 1 AND 128),
  work_tier integer NOT NULL CHECK (work_tier BETWEEN 1 AND 10),
  qualification text NOT NULL CHECK (qualification IN ('GENERAL','PROFESSIONAL','MASTER')),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','COMPLETED','CANCELLED')),
  operation_id text NOT NULL CHECK (char_length(btrim(operation_id)) BETWEEN 1 AND 160),
  started_at timestamptz NOT NULL DEFAULT now(),
  completes_at timestamptz NOT NULL,
  settled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(character_id, operation_id),
  CHECK (completes_at >= started_at),
  CHECK ((status='ACTIVE' AND settled_at IS NULL) OR status<>'ACTIVE')
);

CREATE UNIQUE INDEX rpg_life_one_active_dispatch_per_character
ON platform.rpg_life_dispatches(character_id)
WHERE status='ACTIVE';

ALTER TABLE platform.rpg_life_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform.rpg_life_dispatches FROM anon,authenticated;
GRANT SELECT ON TABLE platform.rpg_life_dispatches TO authenticated;

CREATE POLICY rpg_life_dispatches_owner_select
ON platform.rpg_life_dispatches FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM platform.rpg_characters c
    JOIN platform.rpg_players p ON p.id=c.player_id
    WHERE c.id=character_id AND p.user_id=(SELECT auth.uid())
  )
);

COMMENT ON TABLE platform.rpg_life_dispatches IS
  'Shared runtime dispatch state for all nine RPG life disciplines. Rewards and qualification are server-resolved; browser submits work intent only.';

COMMIT;
