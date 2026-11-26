BEGIN;

CREATE TABLE IF NOT EXISTS platform.achievements (
  id uuid DEFAULT gen_random_uuid(),
  achievement_key text NOT NULL,
  achievement_type text NOT NULL,
  title text NOT NULL,
  description text,
  source_domain text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  target_value bigint NOT NULL DEFAULT 1,
  visibility text NOT NULL DEFAULT 'private',
  reward_reference_type text,
  reward_reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT achievements_pkey PRIMARY KEY (id),
  CONSTRAINT achievements_achievement_key_key UNIQUE (achievement_key),
  CONSTRAINT achievements_achievement_key_check
    CHECK (achievement_key ~ '^[a-z][a-z0-9_.:-]*$'),
  CONSTRAINT achievements_achievement_type_check
    CHECK (achievement_type IN ('progress', 'milestone', 'collection', 'streak', 'event', 'hidden')),
  CONSTRAINT achievements_title_check
    CHECK (btrim(title) <> ''),
  CONSTRAINT achievements_description_check
    CHECK (description IS NULL OR btrim(description) <> ''),
  CONSTRAINT achievements_source_domain_check
    CHECK (source_domain ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT achievements_status_check
    CHECK (status IN ('draft', 'active', 'paused', 'retired', 'archived')),
  CONSTRAINT achievements_target_value_check
    CHECK (target_value > 0),
  CONSTRAINT achievements_visibility_check
    CHECK (visibility IN ('private', 'visible', 'hidden')),
  CONSTRAINT achievements_reward_reference_pair_check
    CHECK (
      (reward_reference_type IS NULL AND reward_reference_id IS NULL)
      OR (reward_reference_type IS NOT NULL AND reward_reference_id IS NOT NULL)
    ),
  CONSTRAINT achievements_reward_reference_type_check
    CHECK (reward_reference_type IS NULL OR reward_reference_type ~ '^[a-z][a-z0-9_.:-]*$'),
  CONSTRAINT achievements_archive_delete_order_check
    CHECK (
      deleted_at IS NULL
      OR archived_at IS NULL
      OR deleted_at >= archived_at
    )
);

COMMENT ON TABLE platform.achievements IS
'Achievement aggregate root for platform achievement definitions and reward request references.';
COMMENT ON COLUMN platform.achievements.id IS
'Achievement UUID.';
COMMENT ON COLUMN platform.achievements.achievement_key IS
'Stable achievement key. This is a secondary identifier and not the primary key.';
COMMENT ON COLUMN platform.achievements.achievement_type IS
'Achievement type. Allowed values are progress, milestone, collection, streak, event, and hidden.';
COMMENT ON COLUMN platform.achievements.title IS
'Achievement title.';
COMMENT ON COLUMN platform.achievements.description IS
'Optional achievement description.';
COMMENT ON COLUMN platform.achievements.source_domain IS
'Structured owner or source domain key for this achievement.';
COMMENT ON COLUMN platform.achievements.status IS
'Achievement lifecycle status. Allowed values are draft, active, paused, retired, and archived.';
COMMENT ON COLUMN platform.achievements.target_value IS
'Positive target value required to unlock this achievement.';
COMMENT ON COLUMN platform.achievements.visibility IS
'Achievement visibility. Allowed values are private, visible, and hidden.';
COMMENT ON COLUMN platform.achievements.reward_reference_type IS
'Optional structured reward reference type. Reward execution belongs to the owning application service.';
COMMENT ON COLUMN platform.achievements.reward_reference_id IS
'Optional reward request or reward configuration reference UUID.';
COMMENT ON COLUMN platform.achievements.created_at IS
'Timestamp when the Achievement record was created.';
COMMENT ON COLUMN platform.achievements.updated_at IS
'Timestamp when the Achievement record was last updated.';
COMMENT ON COLUMN platform.achievements.archived_at IS
'Timestamp when the Achievement record was archived.';
COMMENT ON COLUMN platform.achievements.deleted_at IS
'Timestamp when the Achievement record was soft deleted.';

CREATE INDEX IF NOT EXISTS achievements_achievement_type_idx
  ON platform.achievements (achievement_type);

CREATE INDEX IF NOT EXISTS achievements_source_domain_idx
  ON platform.achievements (source_domain);

CREATE INDEX IF NOT EXISTS achievements_status_idx
  ON platform.achievements (status);

CREATE INDEX IF NOT EXISTS achievements_visibility_idx
  ON platform.achievements (visibility);

CREATE TABLE IF NOT EXISTS platform.achievement_progress (
  id uuid DEFAULT gen_random_uuid(),
  achievement_id uuid NOT NULL,
  user_id uuid NOT NULL,
  subject_id uuid,
  current_value bigint NOT NULL DEFAULT 0,
  target_value bigint NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  last_event_type text,
  last_resource_reference uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT achievement_progress_pkey PRIMARY KEY (id),
  CONSTRAINT achievement_progress_achievement_id_fkey
    FOREIGN KEY (achievement_id) REFERENCES platform.achievements(id) ON DELETE RESTRICT,
  CONSTRAINT achievement_progress_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE RESTRICT,
  CONSTRAINT achievement_progress_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id) ON DELETE SET NULL,
  CONSTRAINT achievement_progress_current_value_check
    CHECK (current_value >= 0),
  CONSTRAINT achievement_progress_target_value_check
    CHECK (target_value > 0),
  CONSTRAINT achievement_progress_current_target_check
    CHECK (current_value <= target_value),
  CONSTRAINT achievement_progress_status_check
    CHECK (status IN ('in_progress', 'completed', 'expired', 'cancelled')),
  CONSTRAINT achievement_progress_last_event_type_check
    CHECK (last_event_type IS NULL OR last_event_type ~ '^[A-Z][A-Za-z0-9]*$'),
  CONSTRAINT achievement_progress_completed_at_check
    CHECK (completed_at IS NULL OR completed_at >= started_at),
  CONSTRAINT achievement_progress_completed_status_check
    CHECK (completed_at IS NULL OR status = 'completed')
);

COMMENT ON TABLE platform.achievement_progress IS
'User achievement progress state with canonical event references and resource references only.';
COMMENT ON COLUMN platform.achievement_progress.id IS
'Achievement Progress UUID.';
COMMENT ON COLUMN platform.achievement_progress.achievement_id IS
'Owning Achievement reference.';
COMMENT ON COLUMN platform.achievement_progress.user_id IS
'Core User reference for the achievement owner.';
COMMENT ON COLUMN platform.achievement_progress.subject_id IS
'Optional Core Subject reference for subject-linked achievements. Subject deletion clears this reference only.';
COMMENT ON COLUMN platform.achievement_progress.current_value IS
'Current non-negative progress value.';
COMMENT ON COLUMN platform.achievement_progress.target_value IS
'Positive target value required to unlock the achievement.';
COMMENT ON COLUMN platform.achievement_progress.status IS
'Achievement progress status. Allowed values are in_progress, completed, expired, and cancelled.';
COMMENT ON COLUMN platform.achievement_progress.last_event_type IS
'Optional canonical event name for the most recent progress update.';
COMMENT ON COLUMN platform.achievement_progress.last_resource_reference IS
'Optional UUID reference to the resource associated with the most recent progress update.';
COMMENT ON COLUMN platform.achievement_progress.started_at IS
'Timestamp when achievement progress started.';
COMMENT ON COLUMN platform.achievement_progress.completed_at IS
'Optional timestamp when achievement progress completed.';
COMMENT ON COLUMN platform.achievement_progress.created_at IS
'Timestamp when the Achievement Progress record was created.';
COMMENT ON COLUMN platform.achievement_progress.updated_at IS
'Timestamp when the Achievement Progress record was last updated.';

CREATE INDEX IF NOT EXISTS achievement_progress_achievement_id_idx
  ON platform.achievement_progress (achievement_id);

CREATE INDEX IF NOT EXISTS achievement_progress_user_id_idx
  ON platform.achievement_progress (user_id);

CREATE INDEX IF NOT EXISTS achievement_progress_subject_id_idx
  ON platform.achievement_progress (subject_id);

CREATE INDEX IF NOT EXISTS achievement_progress_status_idx
  ON platform.achievement_progress (status);

CREATE INDEX IF NOT EXISTS achievement_progress_current_target_idx
  ON platform.achievement_progress (current_value, target_value);

CREATE UNIQUE INDEX IF NOT EXISTS achievement_progress_active_user_achievement_key
  ON platform.achievement_progress (achievement_id, user_id)
  WHERE subject_id IS NULL
    AND status IN ('in_progress', 'completed');

CREATE UNIQUE INDEX IF NOT EXISTS achievement_progress_active_user_subject_achievement_key
  ON platform.achievement_progress (achievement_id, user_id, subject_id)
  WHERE subject_id IS NOT NULL
    AND status IN ('in_progress', 'completed');

CREATE TABLE IF NOT EXISTS platform.achievement_unlocks (
  id uuid DEFAULT gen_random_uuid(),
  achievement_progress_id uuid NOT NULL,
  unlock_event_type text NOT NULL,
  reward_status text NOT NULL DEFAULT 'pending',
  reward_request_reference uuid,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT achievement_unlocks_pkey PRIMARY KEY (id),
  CONSTRAINT achievement_unlocks_achievement_progress_id_key UNIQUE (achievement_progress_id),
  CONSTRAINT achievement_unlocks_achievement_progress_id_fkey
    FOREIGN KEY (achievement_progress_id) REFERENCES platform.achievement_progress(id) ON DELETE RESTRICT,
  CONSTRAINT achievement_unlocks_unlock_event_type_check
    CHECK (unlock_event_type ~ '^[A-Z][A-Za-z0-9]*$'),
  CONSTRAINT achievement_unlocks_reward_status_check
    CHECK (reward_status IN ('pending', 'requested', 'granted', 'failed', 'cancelled'))
);

COMMENT ON TABLE platform.achievement_unlocks IS
'Append-only Achievement unlock records with unlock event and reward request references.';
COMMENT ON COLUMN platform.achievement_unlocks.id IS
'Achievement Unlock UUID.';
COMMENT ON COLUMN platform.achievement_unlocks.achievement_progress_id IS
'Unique Achievement Progress reference.';
COMMENT ON COLUMN platform.achievement_unlocks.unlock_event_type IS
'Canonical event name that unlocked the achievement.';
COMMENT ON COLUMN platform.achievement_unlocks.reward_status IS
'Reward request status. Allowed values are pending, requested, granted, failed, and cancelled.';
COMMENT ON COLUMN platform.achievement_unlocks.reward_request_reference IS
'Optional reward request reference UUID. Reward execution belongs outside this table.';
COMMENT ON COLUMN platform.achievement_unlocks.unlocked_at IS
'Timestamp when the achievement was unlocked.';
COMMENT ON COLUMN platform.achievement_unlocks.created_at IS
'Timestamp when this Achievement Unlock record was created.';

CREATE INDEX IF NOT EXISTS achievement_unlocks_reward_status_idx
  ON platform.achievement_unlocks (reward_status);

CREATE INDEX IF NOT EXISTS achievement_unlocks_unlocked_at_idx
  ON platform.achievement_unlocks (unlocked_at);

DROP TRIGGER IF EXISTS trg_achievements_set_updated_at ON platform.achievements;
CREATE TRIGGER trg_achievements_set_updated_at
  BEFORE UPDATE ON platform.achievements
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_achievements_set_updated_at ON platform.achievements IS
'Maintains platform.achievements.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_achievement_progress_set_updated_at ON platform.achievement_progress;
CREATE TRIGGER trg_achievement_progress_set_updated_at
  BEFORE UPDATE ON platform.achievement_progress
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_achievement_progress_set_updated_at ON platform.achievement_progress IS
'Maintains platform.achievement_progress.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_achievement_unlocks_reject_update ON platform.achievement_unlocks;
CREATE TRIGGER trg_achievement_unlocks_reject_update
  BEFORE UPDATE ON platform.achievement_unlocks
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_achievement_unlocks_reject_update ON platform.achievement_unlocks IS
'Rejects all UPDATE attempts on append-only Achievement Unlock records.';

DROP TRIGGER IF EXISTS trg_achievement_unlocks_reject_delete ON platform.achievement_unlocks;
CREATE TRIGGER trg_achievement_unlocks_reject_delete
  BEFORE DELETE ON platform.achievement_unlocks
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_achievement_unlocks_reject_delete ON platform.achievement_unlocks IS
'Rejects all DELETE attempts on append-only Achievement Unlock records.';

ALTER TABLE platform.achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.achievement_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.achievement_unlocks ENABLE ROW LEVEL SECURITY;

COMMIT;
