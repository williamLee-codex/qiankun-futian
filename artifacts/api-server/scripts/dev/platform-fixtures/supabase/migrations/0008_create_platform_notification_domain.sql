BEGIN;

CREATE TABLE IF NOT EXISTS platform.notifications (
  id uuid DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_id uuid,
  notification_type text NOT NULL,
  source_domain text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  action_reference text,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'pending',
  scheduled_at timestamptz,
  available_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  archived_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE RESTRICT,
  CONSTRAINT notifications_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id) ON DELETE SET NULL,
  CONSTRAINT notifications_notification_type_check
    CHECK (notification_type ~ '^[a-z][a-z0-9_.:-]*$'),
  CONSTRAINT notifications_source_domain_check
    CHECK (source_domain ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT notifications_title_check
    CHECK (btrim(title) <> ''),
  CONSTRAINT notifications_message_check
    CHECK (btrim(message) <> ''),
  CONSTRAINT notifications_action_reference_check
    CHECK (
      action_reference IS NULL
      OR (
        btrim(action_reference) <> ''
        AND action_reference !~* '(secret|token|api[_-]?key|birth|dream|face|palm|wallet[_-]?ledger)'
      )
    ),
  CONSTRAINT notifications_priority_check
    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  CONSTRAINT notifications_status_check
    CHECK (status IN ('pending', 'scheduled', 'available', 'read', 'archived', 'expired', 'cancelled')),
  CONSTRAINT notifications_expiry_check
    CHECK (expires_at IS NULL OR expires_at > available_at),
  CONSTRAINT notifications_scheduled_check
    CHECK (scheduled_at IS NULL OR scheduled_at <= available_at),
  CONSTRAINT notifications_read_status_check
    CHECK (read_at IS NULL OR status IN ('read', 'archived')),
  CONSTRAINT notifications_archive_delete_order_check
    CHECK (
      deleted_at IS NULL
      OR archived_at IS NULL
      OR deleted_at >= archived_at
    )
);

COMMENT ON TABLE platform.notifications IS
'Notification aggregate root for in-platform notification state, availability, read state, and archival state.';
COMMENT ON COLUMN platform.notifications.id IS
'Notification UUID.';
COMMENT ON COLUMN platform.notifications.user_id IS
'Core User reference for the notification recipient.';
COMMENT ON COLUMN platform.notifications.subject_id IS
'Optional Core Subject reference. Subject deletion clears this reference only.';
COMMENT ON COLUMN platform.notifications.notification_type IS
'Structured notification type key.';
COMMENT ON COLUMN platform.notifications.source_domain IS
'Structured domain key that requested or produced the notification.';
COMMENT ON COLUMN platform.notifications.title IS
'Notification title. This must not contain raw highly sensitive resource payloads.';
COMMENT ON COLUMN platform.notifications.message IS
'Notification message summary. This must not contain raw highly sensitive resource payloads.';
COMMENT ON COLUMN platform.notifications.action_reference IS
'Optional safe action reference. This must not store credentials, session values, or sensitive raw payload references.';
COMMENT ON COLUMN platform.notifications.priority IS
'Notification priority. Allowed values are low, normal, high, and critical.';
COMMENT ON COLUMN platform.notifications.status IS
'Notification lifecycle status. Allowed values are pending, scheduled, available, read, archived, expired, and cancelled.';
COMMENT ON COLUMN platform.notifications.scheduled_at IS
'Optional timestamp when the notification was scheduled.';
COMMENT ON COLUMN platform.notifications.available_at IS
'Timestamp when the notification becomes available to the user.';
COMMENT ON COLUMN platform.notifications.read_at IS
'Optional timestamp when the user read the notification.';
COMMENT ON COLUMN platform.notifications.archived_at IS
'Optional timestamp when the notification was archived.';
COMMENT ON COLUMN platform.notifications.expires_at IS
'Optional timestamp when the notification expires.';
COMMENT ON COLUMN platform.notifications.created_at IS
'Timestamp when the Notification record was created.';
COMMENT ON COLUMN platform.notifications.updated_at IS
'Timestamp when the Notification record was last updated.';
COMMENT ON COLUMN platform.notifications.deleted_at IS
'Timestamp when the Notification record was soft deleted.';

CREATE INDEX IF NOT EXISTS notifications_user_id_idx
  ON platform.notifications (user_id);

CREATE INDEX IF NOT EXISTS notifications_subject_id_idx
  ON platform.notifications (subject_id);

CREATE INDEX IF NOT EXISTS notifications_notification_type_idx
  ON platform.notifications (notification_type);

CREATE INDEX IF NOT EXISTS notifications_status_idx
  ON platform.notifications (status);

CREATE INDEX IF NOT EXISTS notifications_available_at_idx
  ON platform.notifications (available_at);

CREATE INDEX IF NOT EXISTS notifications_read_at_idx
  ON platform.notifications (read_at);

CREATE INDEX IF NOT EXISTS notifications_user_status_available_at_idx
  ON platform.notifications (user_id, status, available_at DESC);

CREATE TABLE IF NOT EXISTS platform.notification_preferences (
  id uuid DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  notification_type text NOT NULL,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  push_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start time,
  quiet_hours_end time,
  timezone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT notification_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT notification_preferences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE CASCADE,
  CONSTRAINT notification_preferences_user_type_key
    UNIQUE (user_id, notification_type),
  CONSTRAINT notification_preferences_notification_type_check
    CHECK (notification_type ~ '^[a-z][a-z0-9_.:-]*$'),
  CONSTRAINT notification_preferences_quiet_hours_pair_check
    CHECK (
      (quiet_hours_start IS NULL AND quiet_hours_end IS NULL)
      OR (quiet_hours_start IS NOT NULL AND quiet_hours_end IS NOT NULL)
    ),
  CONSTRAINT notification_preferences_timezone_check
    CHECK (timezone IS NULL OR timezone ~ '^[A-Za-z][A-Za-z0-9_./+-]*$')
);

COMMENT ON TABLE platform.notification_preferences IS
'User notification preferences by notification type and delivery channel flags.';
COMMENT ON COLUMN platform.notification_preferences.id IS
'Notification Preference UUID.';
COMMENT ON COLUMN platform.notification_preferences.user_id IS
'Core User reference for the preference owner.';
COMMENT ON COLUMN platform.notification_preferences.notification_type IS
'Structured notification type key controlled by this preference.';
COMMENT ON COLUMN platform.notification_preferences.in_app_enabled IS
'Whether in-app delivery is enabled for this notification type.';
COMMENT ON COLUMN platform.notification_preferences.email_enabled IS
'Whether email delivery is enabled for this notification type.';
COMMENT ON COLUMN platform.notification_preferences.push_enabled IS
'Whether push delivery is enabled for this notification type.';
COMMENT ON COLUMN platform.notification_preferences.quiet_hours_start IS
'Optional quiet-hours start time. Must be paired with quiet_hours_end.';
COMMENT ON COLUMN platform.notification_preferences.quiet_hours_end IS
'Optional quiet-hours end time. Must be paired with quiet_hours_start.';
COMMENT ON COLUMN platform.notification_preferences.timezone IS
'Optional timezone key used to interpret quiet hours.';
COMMENT ON COLUMN platform.notification_preferences.created_at IS
'Timestamp when the Notification Preference record was created.';
COMMENT ON COLUMN platform.notification_preferences.updated_at IS
'Timestamp when the Notification Preference record was last updated.';
COMMENT ON COLUMN platform.notification_preferences.deleted_at IS
'Timestamp when the Notification Preference record was soft deleted.';

CREATE INDEX IF NOT EXISTS notification_preferences_user_id_idx
  ON platform.notification_preferences (user_id);

CREATE INDEX IF NOT EXISTS notification_preferences_notification_type_idx
  ON platform.notification_preferences (notification_type);

CREATE TABLE IF NOT EXISTS platform.notification_deliveries (
  id uuid DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  channel text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  provider_key text,
  provider_reference text,
  attempt_number integer NOT NULL DEFAULT 1,
  queued_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT notification_deliveries_notification_id_fkey
    FOREIGN KEY (notification_id) REFERENCES platform.notifications(id) ON DELETE RESTRICT,
  CONSTRAINT notification_deliveries_notification_channel_attempt_key
    UNIQUE (notification_id, channel, attempt_number),
  CONSTRAINT notification_deliveries_channel_check
    CHECK (channel IN ('in_app', 'email', 'push')),
  CONSTRAINT notification_deliveries_status_check
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'cancelled')),
  CONSTRAINT notification_deliveries_provider_key_check
    CHECK (
      provider_key IS NULL
      OR (
        provider_key ~ '^[a-z][a-z0-9_-]*$'
        AND provider_key !~* '(secret|token|api[_-]?key)'
      )
    ),
  CONSTRAINT notification_deliveries_provider_reference_check
    CHECK (
      provider_reference IS NULL
      OR (
        btrim(provider_reference) <> ''
        AND provider_reference !~* '(secret|token|api[_-]?key)'
      )
    ),
  CONSTRAINT notification_deliveries_attempt_number_check
    CHECK (attempt_number > 0),
  CONSTRAINT notification_deliveries_time_order_check
    CHECK (
      (sent_at IS NULL OR sent_at >= queued_at)
      AND (delivered_at IS NULL OR delivered_at >= queued_at)
      AND (failed_at IS NULL OR failed_at >= queued_at)
    ),
  CONSTRAINT notification_deliveries_failure_code_check
    CHECK (failure_code IS NULL OR failure_code ~ '^[A-Z0-9_:-]{2,128}$')
);

COMMENT ON TABLE platform.notification_deliveries IS
'Append-only Notification delivery attempts by channel and provider reference metadata.';
COMMENT ON COLUMN platform.notification_deliveries.id IS
'Notification Delivery UUID.';
COMMENT ON COLUMN platform.notification_deliveries.notification_id IS
'Owning Notification reference.';
COMMENT ON COLUMN platform.notification_deliveries.channel IS
'Delivery channel. Allowed values are in_app, email, and push.';
COMMENT ON COLUMN platform.notification_deliveries.status IS
'Delivery status. Allowed values are queued, sent, delivered, failed, and cancelled.';
COMMENT ON COLUMN platform.notification_deliveries.provider_key IS
'Optional provider routing key. This must not store provider credentials.';
COMMENT ON COLUMN platform.notification_deliveries.provider_reference IS
'Optional provider-side delivery reference. This must not store provider credentials or user device secrets.';
COMMENT ON COLUMN platform.notification_deliveries.attempt_number IS
'Positive delivery attempt number scoped to notification and channel.';
COMMENT ON COLUMN platform.notification_deliveries.queued_at IS
'Timestamp when this delivery attempt was queued.';
COMMENT ON COLUMN platform.notification_deliveries.sent_at IS
'Optional timestamp when this delivery attempt was sent.';
COMMENT ON COLUMN platform.notification_deliveries.delivered_at IS
'Optional timestamp when this delivery attempt was delivered.';
COMMENT ON COLUMN platform.notification_deliveries.failed_at IS
'Optional timestamp when this delivery attempt failed.';
COMMENT ON COLUMN platform.notification_deliveries.failure_code IS
'Optional structured failure code without provider secrets.';
COMMENT ON COLUMN platform.notification_deliveries.created_at IS
'Timestamp when this Notification Delivery record was created.';

CREATE INDEX IF NOT EXISTS notification_deliveries_notification_id_idx
  ON platform.notification_deliveries (notification_id);

CREATE INDEX IF NOT EXISTS notification_deliveries_channel_idx
  ON platform.notification_deliveries (channel);

CREATE INDEX IF NOT EXISTS notification_deliveries_status_idx
  ON platform.notification_deliveries (status);

CREATE INDEX IF NOT EXISTS notification_deliveries_queued_at_idx
  ON platform.notification_deliveries (queued_at);

DROP TRIGGER IF EXISTS trg_notifications_set_updated_at ON platform.notifications;
CREATE TRIGGER trg_notifications_set_updated_at
  BEFORE UPDATE ON platform.notifications
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_notifications_set_updated_at ON platform.notifications IS
'Maintains platform.notifications.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_notification_preferences_set_updated_at ON platform.notification_preferences;
CREATE TRIGGER trg_notification_preferences_set_updated_at
  BEFORE UPDATE ON platform.notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_notification_preferences_set_updated_at ON platform.notification_preferences IS
'Maintains platform.notification_preferences.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_notification_deliveries_reject_update ON platform.notification_deliveries;
CREATE TRIGGER trg_notification_deliveries_reject_update
  BEFORE UPDATE ON platform.notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_notification_deliveries_reject_update ON platform.notification_deliveries IS
'Rejects all UPDATE attempts on append-only Notification Delivery records.';

DROP TRIGGER IF EXISTS trg_notification_deliveries_reject_delete ON platform.notification_deliveries;
CREATE TRIGGER trg_notification_deliveries_reject_delete
  BEFORE DELETE ON platform.notification_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_notification_deliveries_reject_delete ON platform.notification_deliveries IS
'Rejects all DELETE attempts on append-only Notification Delivery records.';

ALTER TABLE platform.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.notification_deliveries ENABLE ROW LEVEL SECURITY;

COMMIT;
