-- V6.4: authoritative per-game-server character registration boundary.
-- Isolated test migration; no browser/service_role direct writes.
CREATE TABLE IF NOT EXISTS platform.game_server_characters (
  game_id text NOT NULL CHECK (length(trim(game_id)) > 0),
  server_id text NOT NULL CHECK (length(trim(server_id)) > 0),
  character_id text NOT NULL CHECK (length(trim(character_id)) > 0),
  account_id uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, server_id, character_id),
  UNIQUE (game_id, server_id, account_id, character_id)
);
CREATE INDEX IF NOT EXISTS game_server_characters_account_idx
  ON platform.game_server_characters(account_id, game_id, server_id)
  WHERE status = 'active';
ALTER TABLE platform.game_server_characters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform.game_server_characters FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE platform.game_server_characters IS
  'V6.4 authoritative server membership. Populated only by trusted game registration integration; no client writes.';
