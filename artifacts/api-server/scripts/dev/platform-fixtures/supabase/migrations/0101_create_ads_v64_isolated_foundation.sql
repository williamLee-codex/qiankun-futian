-- Ads V6.4 isolated foundation. No existing wallet or payment tables are modified.
BEGIN;
CREATE SCHEMA IF NOT EXISTS platform;
CREATE TABLE IF NOT EXISTS platform.ad_reward_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 game_id text NOT NULL CHECK (length(btrim(game_id)) > 0),
 server_id text NOT NULL CHECK (length(btrim(server_id)) > 0),
 ad_event_id text NOT NULL CHECK (length(btrim(ad_event_id)) > 0),
 reward_kind text NOT NULL CHECK (reward_kind IN ('coin','game_asset')),
 reward_amount integer NOT NULL CHECK (reward_amount > 0),
 reward_reference text NOT NULL CHECK (length(btrim(reward_reference)) > 0),
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','settled','rejected')),
 verified_at timestamptz,
 settled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT ad_reward_events_event_unique UNIQUE (game_id, server_id, ad_event_id)
);
CREATE INDEX IF NOT EXISTS ad_reward_events_user_game_server_idx ON platform.ad_reward_events(user_id,game_id,server_id,created_at DESC);
CREATE TABLE IF NOT EXISTS platform.ad_daily_quotas (
 user_id uuid NOT NULL REFERENCES auth.users(id),
 game_id text NOT NULL CHECK (length(btrim(game_id)) > 0),
 server_id text NOT NULL CHECK (length(btrim(server_id)) > 0),
 quota_date date NOT NULL,
 claimed_count integer NOT NULL DEFAULT 0 CHECK (claimed_count >= 0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,game_id,server_id,quota_date)
);
ALTER TABLE platform.ad_reward_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.ad_daily_quotas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform.ad_reward_events, platform.ad_daily_quotas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON platform.ad_reward_events, platform.ad_daily_quotas TO service_role;
-- No client write policies. Settlement RPC must enforce server proof, quotas and atomic credit.
COMMIT;
