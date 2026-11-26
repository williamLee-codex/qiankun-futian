-- V6.4 verified session foundation. This migration does not grant settlement.
CREATE TABLE IF NOT EXISTS platform.ad_verified_sessions (
  session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  game_id text NOT NULL CHECK (length(btrim(game_id)) > 0),
  server_id text NOT NULL CHECK (length(btrim(server_id)) > 0),
  character_id text NOT NULL CHECK (length(btrim(character_id)) > 0),
  ad_event_id text NOT NULL CHECK (length(btrim(ad_event_id)) > 0),
  provider text NOT NULL CHECK (length(btrim(provider)) > 0),
  provider_transaction_id text,
  reward_kind text NOT NULL DEFAULT 'coin' CHECK (reward_kind IN ('coin','game_asset')),
  reward_amount integer NOT NULL CHECK (reward_amount > 0),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ad_verified_sessions_event_unique UNIQUE (game_id,server_id,ad_event_id),
  CONSTRAINT ad_verified_sessions_provider_tx_unique UNIQUE (provider,provider_transaction_id),
  CONSTRAINT ad_verified_sessions_verified_provider CHECK (verified_at IS NULL OR provider_transaction_id IS NOT NULL),
  CONSTRAINT ad_verified_sessions_settled_after_verification CHECK (settled_at IS NULL OR verified_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ad_verified_sessions_user_server_idx
 ON platform.ad_verified_sessions(user_id,game_id,server_id,created_at DESC);
ALTER TABLE platform.ad_verified_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform.ad_verified_sessions FROM PUBLIC,anon,authenticated,service_role;
-- Trusted backend session issuance and provider verification require a separate
-- privileged integration. No API or RPC can mint verified_at via this migration.
COMMENT ON TABLE platform.ad_verified_sessions IS
 'Fail-closed ad session registry: no client/service_role table grants; verification must be implemented by a trusted provider callback.';
