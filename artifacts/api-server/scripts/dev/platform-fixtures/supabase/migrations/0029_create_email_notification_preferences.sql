BEGIN;

CREATE TABLE IF NOT EXISTS platform.email_notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES core.users(id) ON DELETE CASCADE,
  game_notifications_enabled boolean NOT NULL DEFAULT true,
  social_notifications_enabled boolean NOT NULL DEFAULT true,
  reward_notifications_enabled boolean NOT NULL DEFAULT true,
  product_updates_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE platform.email_notification_preferences IS
'Platform-wide, user-controlled Email notification category preferences. Required service Email is intentionally not configurable here.';
COMMENT ON COLUMN platform.email_notification_preferences.user_id IS
'Core Identity user UUID; Email addresses remain owned by the authentication provider and are not duplicated here.';

DROP TRIGGER IF EXISTS trg_email_notification_preferences_set_updated_at
  ON platform.email_notification_preferences;
CREATE TRIGGER trg_email_notification_preferences_set_updated_at
  BEFORE UPDATE ON platform.email_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

ALTER TABLE platform.email_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_notification_preferences_service_role_all
  ON platform.email_notification_preferences;
CREATE POLICY email_notification_preferences_service_role_all
  ON platform.email_notification_preferences
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE platform.email_notification_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE platform.email_notification_preferences TO service_role;

COMMIT;
