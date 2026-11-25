BEGIN;

CREATE TABLE IF NOT EXISTS core.journeys (
  id uuid DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT journeys_pkey PRIMARY KEY (id),
  CONSTRAINT journeys_user_id_key UNIQUE (user_id),
  CONSTRAINT journeys_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE RESTRICT,
  CONSTRAINT journeys_status_check
    CHECK (status IN ('active', 'archived'))
);

COMMENT ON TABLE core.journeys IS
'Journey aggregate root for user-visible cross-app timeline containers. Journey must not store complete business resource contents.';
COMMENT ON COLUMN core.journeys.id IS
'Journey aggregate UUID.';
COMMENT ON COLUMN core.journeys.user_id IS
'Owning User aggregate reference. V1 allows one Journey per User.';
COMMENT ON COLUMN core.journeys.status IS
'Journey status. Allowed values are active and archived.';
COMMENT ON COLUMN core.journeys.created_at IS
'Timestamp when the Journey was created.';
COMMENT ON COLUMN core.journeys.updated_at IS
'Timestamp when the Journey was last updated.';
COMMENT ON COLUMN core.journeys.archived_at IS
'Timestamp when the Journey was archived, if applicable.';
COMMENT ON COLUMN core.journeys.deleted_at IS
'Soft delete timestamp for Journey lifecycle handling.';

CREATE INDEX IF NOT EXISTS journeys_status_idx
  ON core.journeys (status);

CREATE TABLE IF NOT EXISTS core.milestones (
  id uuid DEFAULT gen_random_uuid(),
  journey_id uuid NOT NULL,
  subject_id uuid,
  event_type text NOT NULL,
  source_domain text NOT NULL,
  resource_type text NOT NULL,
  resource_reference uuid,
  title text NOT NULL,
  summary text,
  occurred_at timestamptz NOT NULL,
  visibility text NOT NULL DEFAULT 'private',
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT milestones_pkey PRIMARY KEY (id),
  CONSTRAINT milestones_journey_id_fkey
    FOREIGN KEY (journey_id) REFERENCES core.journeys(id) ON DELETE CASCADE,
  CONSTRAINT milestones_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id) ON DELETE SET NULL,
  CONSTRAINT milestones_event_type_check
    CHECK (
      event_type IN (
        'SubjectCreated',
        'BirthDataUpdated',
        'ZiweiGenerated',
        'BaziGenerated',
        'DestinyReportCompleted',
        'HoroscopeGenerated',
        'TarotDrawCompleted',
        'DreamRecorded',
        'DreamAnalyzed',
        'ResidenceCreated',
        'FengShuiAnalyzed',
        'RelationshipCreated',
        'CompatibilityCompleted',
        'SeedPlanted',
        'CropMatured',
        'HarvestCompleted',
        'PetFed',
        'FortuneBorrowed',
        'AICompleted',
        'ReportCompleted',
        'ReportGenerated',
        'PDFGenerated'
      )
    ),
  CONSTRAINT milestones_source_domain_check
    CHECK (source_domain ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT milestones_resource_type_check
    CHECK (btrim(resource_type) <> ''),
  CONSTRAINT milestones_title_check
    CHECK (btrim(title) <> ''),
  CONSTRAINT milestones_visibility_check
    CHECK (visibility IN ('private', 'shared'))
);

COMMENT ON TABLE core.milestones IS
'Journey milestone entries storing event summaries and resource references only. Milestones must not store raw Level 4 resource content.';
COMMENT ON COLUMN core.milestones.id IS
'Milestone entity UUID.';
COMMENT ON COLUMN core.milestones.journey_id IS
'Owning Journey aggregate reference.';
COMMENT ON COLUMN core.milestones.subject_id IS
'Optional Subject reference. Subject deletion sets this reference to null rather than cascading milestone deletion.';
COMMENT ON COLUMN core.milestones.event_type IS
'Canonical Event name that is allowed to create or possibly create a Journey milestone.';
COMMENT ON COLUMN core.milestones.source_domain IS
'Structured lower snake case Domain key that emitted the event.';
COMMENT ON COLUMN core.milestones.resource_type IS
'Referenced resource type. This is metadata only, not complete business resource content.';
COMMENT ON COLUMN core.milestones.resource_reference IS
'Optional UUID reference to the business resource or summary.';
COMMENT ON COLUMN core.milestones.title IS
'Short user-visible milestone title.';
COMMENT ON COLUMN core.milestones.summary IS
'Optional user-visible event summary. Summary must be minimized and treated as Highly Sensitive when it reveals Level 4 data.';
COMMENT ON COLUMN core.milestones.occurred_at IS
'Business timestamp when the milestone event occurred.';
COMMENT ON COLUMN core.milestones.visibility IS
'Milestone visibility boundary. Allowed values are private and shared.';
COMMENT ON COLUMN core.milestones.created_at IS
'Timestamp when the Milestone record was created.';
COMMENT ON COLUMN core.milestones.archived_at IS
'Timestamp when the Milestone was archived, if applicable.';
COMMENT ON COLUMN core.milestones.deleted_at IS
'Soft delete timestamp for Milestone lifecycle handling.';

CREATE INDEX IF NOT EXISTS milestones_journey_id_idx
  ON core.milestones (journey_id);

CREATE INDEX IF NOT EXISTS milestones_subject_id_idx
  ON core.milestones (subject_id);

CREATE INDEX IF NOT EXISTS milestones_event_type_idx
  ON core.milestones (event_type);

CREATE INDEX IF NOT EXISTS milestones_source_domain_idx
  ON core.milestones (source_domain);

CREATE INDEX IF NOT EXISTS milestones_occurred_at_idx
  ON core.milestones (occurred_at);

CREATE INDEX IF NOT EXISTS milestones_journey_occurred_at_desc_idx
  ON core.milestones (journey_id, occurred_at DESC);

ALTER TABLE core.journeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.milestones ENABLE ROW LEVEL SECURITY;

COMMIT;
