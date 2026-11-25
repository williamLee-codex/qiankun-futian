-- Event receipt is append-only and denies client writes.
CREATE TABLE IF NOT EXISTS platform.game_server_registration_events (
  source_event_id text PRIMARY KEY,
  game_id text NOT NULL,
  server_id text NOT NULL,
  character_id text NOT NULL,
  account_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('active','suspended','archived')),
  source_version bigint NOT NULL CHECK (source_version > 0),
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS game_server_registration_versions_unique
 ON platform.game_server_registration_events(game_id,server_id,character_id,source_version);
ALTER TABLE platform.game_server_registration_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform.game_server_registration_events FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE platform.game_server_characters
 ADD COLUMN IF NOT EXISTS source_version bigint NOT NULL DEFAULT 0 CHECK (source_version >= 0);
COMMENT ON COLUMN platform.game_server_characters.source_version IS
 'Monotonic authoritative registration version; old events must not overwrite newer state.';
