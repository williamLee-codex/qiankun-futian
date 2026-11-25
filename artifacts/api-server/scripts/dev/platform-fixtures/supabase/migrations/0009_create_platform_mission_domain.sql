BEGIN;

CREATE TABLE IF NOT EXISTS platform.missions (
  id uuid DEFAULT gen_random_uuid(),
  mission_key text NOT NULL,
  mission_type text NOT NULL,
  title text NOT NULL,
  description text,
  source_domain text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  repeat_type text NOT NULL DEFAULT 'one_time',
  target_value bigint NOT NULL DEFAULT 1,
  reward_reference_type text,
  reward_reference_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT missions_pkey PRIMARY KEY (id),
  CONSTRAINT missions_mission_key_key UNIQUE (mission_key),
  CONSTRAINT missions_mission_key_check
    CHECK (mission_key ~ '^[a-z][a-z0-9_.:-]*$'),
  CONSTRAINT missions_mission_type_check
    CHECK (mission_type IN ('daily', 'weekly', 'milestone', 'event', 'onboarding')),
  CONSTRAINT missions_title_check
    CHECK (btrim(title) <> ''),
  CONSTRAINT missions_description_check
    CHECK (description IS NULL OR btrim(description) <> ''),
  CONSTRAINT missions_source_domain_check
    CHECK (source_domain ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT missions_status_check
    CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'ended', 'archived')),
  CONSTRAINT missions_repeat_type_check
    CHECK (repeat_type IN ('one_time', 'daily', 'weekly', 'monthly', 'event')),
  CONSTRAINT missions_target_value_check
    CHECK (target_value > 0),
  CONSTRAINT missions_reward_reference_pair_check
    CHECK (
      (reward_reference_type IS NULL AND reward_reference_id IS NULL)
      OR (reward_reference_type IS NOT NULL AND reward_reference_id IS NOT NULL)
    ),
  CONSTRAINT missions_reward_reference_type_check
    CHECK (reward_reference_type IS NULL OR reward_reference_type ~ '^[a-z][a-z0-9_.:-]*$'),
  CONSTRAINT missions_time_window_check
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT missions_archive_delete_order_check
    CHECK (
      deleted_at IS NULL
      OR archived_at IS NULL
      OR deleted_at >= archived_at
    )
);

COMMENT ON TABLE platform.missions IS
'Mission aggregate root for platform mission definitions and reward request references.';
COMMENT ON COLUMN platform.missions.id IS
'Mission UUID.';
COMMENT ON COLUMN platform.missions.mission_key IS
'Stable mission key. This is a secondary identifier and not the primary key.';
COMMENT ON COLUMN platform.missions.mission_type IS
'Mission type. Allowed values are daily, weekly, milestone, event, and onboarding.';
COMMENT ON COLUMN platform.missions.title IS
'Mission title.';
COMMENT ON COLUMN platform.missions.description IS
'Optional mission description.';
COMMENT ON COLUMN platform.missions.source_domain IS
'Structured owner or source domain key for this mission.';
COMMENT ON COLUMN platform.missions.status IS
'Mission lifecycle status. Allowed values are draft, scheduled, active, paused, ended, and archived.';
COMMENT ON COLUMN platform.missions.repeat_type IS
'Mission repeat type. Allowed values are one_time, daily, weekly, monthly, and event.';
COMMENT ON COLUMN platform.missions.target_value IS
'Positive target value required to complete this mission.';
COMMENT ON COLUMN platform.missions.reward_reference_type IS
'Optional structured reward reference type. Reward execution belongs to the owning application service.';
COMMENT ON COLUMN platform.missions.reward_reference_id IS
'Optional reward request or reward configuration reference UUID.';
COMMENT ON COLUMN platform.missions.starts_at IS
'Optional timestamp when this mission starts.';
COMMENT ON COLUMN platform.missions.ends_at IS
'Optional timestamp when this mission ends.';
COMMENT ON COLUMN platform.missions.created_at IS
'Timestamp when the Mission record was created.';
COMMENT ON COLUMN platform.missions.updated_at IS
'Timestamp when the Mission record was last updated.';
COMMENT ON COLUMN platform.missions.archived_at IS
'Timestamp when the Mission record was archived.';
COMMENT ON COLUMN platform.missions.deleted_at IS
'Timestamp when the Mission record was soft deleted.';

CREATE INDEX IF NOT EXISTS missions_mission_type_idx
  ON platform.missions (mission_type);

CREATE INDEX IF NOT EXISTS missions_source_domain_idx
  ON platform.missions (source_domain);

CREATE INDEX IF NOT EXISTS missions_status_idx
  ON platform.missions (status);

CREATE INDEX IF NOT EXISTS missions_starts_at_idx
  ON platform.missions (starts_at);

CREATE INDEX IF NOT EXISTS missions_ends_at_idx
  ON platform.missions (ends_at);

CREATE TABLE IF NOT EXISTS platform.mission_assignments (
  id uuid DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL,
  user_id uuid NOT NULL,
  subject_id uuid,
  status text NOT NULL DEFAULT 'assigned',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  available_until timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT mission_assignments_mission_id_fkey
    FOREIGN KEY (mission_id) REFERENCES platform.missions(id) ON DELETE RESTRICT,
  CONSTRAINT mission_assignments_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE RESTRICT,
  CONSTRAINT mission_assignments_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id) ON DELETE SET NULL,
  CONSTRAINT mission_assignments_status_check
    CHECK (status IN ('assigned', 'in_progress', 'completed', 'expired', 'cancelled')),
  CONSTRAINT mission_assignments_available_until_check
    CHECK (available_until IS NULL OR available_until > assigned_at),
  CONSTRAINT mission_assignments_completed_at_check
    CHECK (completed_at IS NULL OR completed_at >= assigned_at),
  CONSTRAINT mission_assignments_cancelled_at_check
    CHECK (cancelled_at IS NULL OR cancelled_at >= assigned_at),
  CONSTRAINT mission_assignments_completed_status_check
    CHECK (completed_at IS NULL OR status = 'completed'),
  CONSTRAINT mission_assignments_cancelled_status_check
    CHECK (cancelled_at IS NULL OR status = 'cancelled')
);

COMMENT ON TABLE platform.mission_assignments IS
'User mission assignment records referencing Missions, Users, and optionally Subjects.';
COMMENT ON COLUMN platform.mission_assignments.id IS
'Mission Assignment UUID.';
COMMENT ON COLUMN platform.mission_assignments.mission_id IS
'Owning Mission reference.';
COMMENT ON COLUMN platform.mission_assignments.user_id IS
'Core User reference for the mission assignee.';
COMMENT ON COLUMN platform.mission_assignments.subject_id IS
'Optional Core Subject reference for subject-linked missions. Subject deletion clears this reference only.';
COMMENT ON COLUMN platform.mission_assignments.status IS
'Mission assignment status. Allowed values are assigned, in_progress, completed, expired, and cancelled.';
COMMENT ON COLUMN platform.mission_assignments.assigned_at IS
'Timestamp when this mission was assigned.';
COMMENT ON COLUMN platform.mission_assignments.available_until IS
'Optional timestamp when this assignment stops being available.';
COMMENT ON COLUMN platform.mission_assignments.completed_at IS
'Optional timestamp when this assignment was completed.';
COMMENT ON COLUMN platform.mission_assignments.cancelled_at IS
'Optional timestamp when this assignment was cancelled.';
COMMENT ON COLUMN platform.mission_assignments.created_at IS
'Timestamp when the Mission Assignment record was created.';
COMMENT ON COLUMN platform.mission_assignments.updated_at IS
'Timestamp when the Mission Assignment record was last updated.';

CREATE INDEX IF NOT EXISTS mission_assignments_mission_id_idx
  ON platform.mission_assignments (mission_id);

CREATE INDEX IF NOT EXISTS mission_assignments_user_id_idx
  ON platform.mission_assignments (user_id);

CREATE INDEX IF NOT EXISTS mission_assignments_subject_id_idx
  ON platform.mission_assignments (subject_id);

CREATE INDEX IF NOT EXISTS mission_assignments_status_idx
  ON platform.mission_assignments (status);

CREATE INDEX IF NOT EXISTS mission_assignments_assigned_at_idx
  ON platform.mission_assignments (assigned_at);

CREATE UNIQUE INDEX IF NOT EXISTS mission_assignments_active_user_mission_key
  ON platform.mission_assignments (mission_id, user_id)
  WHERE subject_id IS NULL
    AND status IN ('assigned', 'in_progress');

CREATE UNIQUE INDEX IF NOT EXISTS mission_assignments_active_user_subject_mission_key
  ON platform.mission_assignments (mission_id, user_id, subject_id)
  WHERE subject_id IS NOT NULL
    AND status IN ('assigned', 'in_progress');

CREATE TABLE IF NOT EXISTS platform.mission_progress (
  id uuid DEFAULT gen_random_uuid(),
  mission_assignment_id uuid NOT NULL,
  current_value bigint NOT NULL DEFAULT 0,
  target_value bigint NOT NULL,
  last_event_type text,
  last_resource_reference uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_progress_pkey PRIMARY KEY (id),
  CONSTRAINT mission_progress_mission_assignment_id_key UNIQUE (mission_assignment_id),
  CONSTRAINT mission_progress_mission_assignment_id_fkey
    FOREIGN KEY (mission_assignment_id) REFERENCES platform.mission_assignments(id) ON DELETE CASCADE,
  CONSTRAINT mission_progress_current_value_check
    CHECK (current_value >= 0),
  CONSTRAINT mission_progress_target_value_check
    CHECK (target_value > 0),
  CONSTRAINT mission_progress_current_target_check
    CHECK (current_value <= target_value),
  CONSTRAINT mission_progress_last_event_type_check
    CHECK (last_event_type IS NULL OR last_event_type ~ '^[A-Z][A-Za-z0-9]*$')
);

COMMENT ON TABLE platform.mission_progress IS
'Mission progress state for an assigned mission. Event references are stored without full event payloads.';
COMMENT ON COLUMN platform.mission_progress.id IS
'Mission Progress UUID.';
COMMENT ON COLUMN platform.mission_progress.mission_assignment_id IS
'Unique Mission Assignment reference.';
COMMENT ON COLUMN platform.mission_progress.current_value IS
'Current non-negative progress value.';
COMMENT ON COLUMN platform.mission_progress.target_value IS
'Positive target value for completion.';
COMMENT ON COLUMN platform.mission_progress.last_event_type IS
'Optional canonical event name for the most recent progress update.';
COMMENT ON COLUMN platform.mission_progress.last_resource_reference IS
'Optional UUID reference to the resource associated with the most recent progress update.';
COMMENT ON COLUMN platform.mission_progress.updated_at IS
'Timestamp when the Mission Progress record was last updated.';
COMMENT ON COLUMN platform.mission_progress.created_at IS
'Timestamp when the Mission Progress record was created.';

CREATE INDEX IF NOT EXISTS mission_progress_mission_assignment_id_idx
  ON platform.mission_progress (mission_assignment_id);

CREATE INDEX IF NOT EXISTS mission_progress_current_target_idx
  ON platform.mission_progress (current_value, target_value);

CREATE TABLE IF NOT EXISTS platform.mission_completions (
  id uuid DEFAULT gen_random_uuid(),
  mission_assignment_id uuid NOT NULL,
  completion_event_type text NOT NULL,
  reward_status text NOT NULL DEFAULT 'pending',
  reward_request_reference uuid,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mission_completions_pkey PRIMARY KEY (id),
  CONSTRAINT mission_completions_mission_assignment_id_key UNIQUE (mission_assignment_id),
  CONSTRAINT mission_completions_mission_assignment_id_fkey
    FOREIGN KEY (mission_assignment_id) REFERENCES platform.mission_assignments(id) ON DELETE RESTRICT,
  CONSTRAINT mission_completions_completion_event_type_check
    CHECK (completion_event_type ~ '^[A-Z][A-Za-z0-9]*$'),
  CONSTRAINT mission_completions_reward_status_check
    CHECK (reward_status IN ('pending', 'requested', 'granted', 'failed', 'cancelled'))
);

COMMENT ON TABLE platform.mission_completions IS
'Append-only Mission completion records with completion event and reward request references.';
COMMENT ON COLUMN platform.mission_completions.id IS
'Mission Completion UUID.';
COMMENT ON COLUMN platform.mission_completions.mission_assignment_id IS
'Unique Mission Assignment reference.';
COMMENT ON COLUMN platform.mission_completions.completion_event_type IS
'Canonical event name that completed the mission.';
COMMENT ON COLUMN platform.mission_completions.reward_status IS
'Reward request status. Allowed values are pending, requested, granted, failed, and cancelled.';
COMMENT ON COLUMN platform.mission_completions.reward_request_reference IS
'Optional reward request reference UUID. Reward execution belongs outside this table.';
COMMENT ON COLUMN platform.mission_completions.completed_at IS
'Timestamp when the mission was completed.';
COMMENT ON COLUMN platform.mission_completions.created_at IS
'Timestamp when this Mission Completion record was created.';

CREATE INDEX IF NOT EXISTS mission_completions_reward_status_idx
  ON platform.mission_completions (reward_status);

CREATE INDEX IF NOT EXISTS mission_completions_completed_at_idx
  ON platform.mission_completions (completed_at);

DROP TRIGGER IF EXISTS trg_missions_set_updated_at ON platform.missions;
CREATE TRIGGER trg_missions_set_updated_at
  BEFORE UPDATE ON platform.missions
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_missions_set_updated_at ON platform.missions IS
'Maintains platform.missions.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_mission_assignments_set_updated_at ON platform.mission_assignments;
CREATE TRIGGER trg_mission_assignments_set_updated_at
  BEFORE UPDATE ON platform.mission_assignments
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_mission_assignments_set_updated_at ON platform.mission_assignments IS
'Maintains platform.mission_assignments.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_mission_progress_set_updated_at ON platform.mission_progress;
CREATE TRIGGER trg_mission_progress_set_updated_at
  BEFORE UPDATE ON platform.mission_progress
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_mission_progress_set_updated_at ON platform.mission_progress IS
'Maintains platform.mission_progress.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_mission_completions_reject_update ON platform.mission_completions;
CREATE TRIGGER trg_mission_completions_reject_update
  BEFORE UPDATE ON platform.mission_completions
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_mission_completions_reject_update ON platform.mission_completions IS
'Rejects all UPDATE attempts on append-only Mission Completion records.';

DROP TRIGGER IF EXISTS trg_mission_completions_reject_delete ON platform.mission_completions;
CREATE TRIGGER trg_mission_completions_reject_delete
  BEFORE DELETE ON platform.mission_completions
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_mission_completions_reject_delete ON platform.mission_completions IS
'Rejects all DELETE attempts on append-only Mission Completion records.';

ALTER TABLE platform.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.mission_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.mission_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.mission_completions ENABLE ROW LEVEL SECURITY;

COMMIT;
