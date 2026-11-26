BEGIN;

CREATE TABLE IF NOT EXISTS core.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL,
  subject_type text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL,
  visibility text NOT NULL DEFAULT 'private',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT subjects_owner_user_id_fkey
    FOREIGN KEY (owner_user_id) REFERENCES core.users(id) ON DELETE RESTRICT,
  CONSTRAINT subjects_subject_type_check
    CHECK (subject_type IN ('person', 'pet', 'residence', 'organization', 'relationship', 'dream', 'name')),
  CONSTRAINT subjects_status_check
    CHECK (status IN ('created', 'validated', 'active', 'updated', 'archived', 'deleted')),
  CONSTRAINT subjects_visibility_check
    CHECK (visibility IN ('private', 'shared')),
  CONSTRAINT subjects_version_check
    CHECK (version >= 1)
);

COMMENT ON TABLE core.subjects IS
'Official Subject aggregate records. Subjects are analysis objects and must not store application analysis results.';
COMMENT ON COLUMN core.subjects.id IS
'Subject aggregate UUID.';
COMMENT ON COLUMN core.subjects.owner_user_id IS
'Subject owner User aggregate reference.';
COMMENT ON COLUMN core.subjects.subject_type IS
'Approved Subject type. Allowed values are person, pet, residence, organization, relationship, dream, and name.';
COMMENT ON COLUMN core.subjects.display_name IS
'Owner-facing Subject display name.';
COMMENT ON COLUMN core.subjects.status IS
'Subject lifecycle status aligned to the platform resource lifecycle.';
COMMENT ON COLUMN core.subjects.visibility IS
'Subject visibility boundary. Private is the default, shared requires permission and consent controls.';
COMMENT ON COLUMN core.subjects.version IS
'Subject aggregate version counter.';
COMMENT ON COLUMN core.subjects.created_at IS
'Timestamp when the Subject was created.';
COMMENT ON COLUMN core.subjects.updated_at IS
'Timestamp when the Subject was last updated.';
COMMENT ON COLUMN core.subjects.archived_at IS
'Timestamp when the Subject was archived, if applicable.';
COMMENT ON COLUMN core.subjects.deleted_at IS
'Soft delete timestamp for Subject lifecycle handling.';

CREATE INDEX IF NOT EXISTS subjects_owner_user_id_idx
  ON core.subjects (owner_user_id);

CREATE INDEX IF NOT EXISTS subjects_subject_type_idx
  ON core.subjects (subject_type);

CREATE INDEX IF NOT EXISTS subjects_status_idx
  ON core.subjects (status);

CREATE TABLE IF NOT EXISTS core.birth_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL,
  birth_date date NOT NULL,
  birth_time time,
  timezone text,
  country_code text,
  city text,
  latitude numeric,
  longitude numeric,
  calendar_type text NOT NULL DEFAULT 'gregorian',
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT birth_data_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id) ON DELETE CASCADE,
  CONSTRAINT birth_data_latitude_check
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT birth_data_longitude_check
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  CONSTRAINT birth_data_calendar_type_check
    CHECK (calendar_type IN ('gregorian')),
  CONSTRAINT birth_data_version_check
    CHECK (version >= 1)
);

COMMENT ON TABLE core.birth_data IS
'Versioned birth-related data under the Subject aggregate. Birth Data is Level 4 Highly Sensitive and must not include a full address.';
COMMENT ON COLUMN core.birth_data.id IS
'Birth Data entity UUID.';
COMMENT ON COLUMN core.birth_data.subject_id IS
'Owning Subject reference. Application logic must allow only person Subjects, this migration does not create cross-table triggers.';
COMMENT ON COLUMN core.birth_data.birth_date IS
'Date of birth. This is Highly Sensitive.';
COMMENT ON COLUMN core.birth_data.birth_time IS
'Time of birth when known. This is Highly Sensitive.';
COMMENT ON COLUMN core.birth_data.timezone IS
'Timezone associated with the birth context.';
COMMENT ON COLUMN core.birth_data.country_code IS
'Country code for birth location context.';
COMMENT ON COLUMN core.birth_data.city IS
'City-level birth location context. Full addresses must not be stored.';
COMMENT ON COLUMN core.birth_data.latitude IS
'Optional birth latitude. This is Highly Sensitive when present.';
COMMENT ON COLUMN core.birth_data.longitude IS
'Optional birth longitude. This is Highly Sensitive when present.';
COMMENT ON COLUMN core.birth_data.calendar_type IS
'Birth calendar type. V1 allows gregorian only.';
COMMENT ON COLUMN core.birth_data.version IS
'Birth Data version number. Historical versions must not be overwritten.';
COMMENT ON COLUMN core.birth_data.created_at IS
'Timestamp when the Birth Data record was created.';
COMMENT ON COLUMN core.birth_data.updated_at IS
'Timestamp when the Birth Data record was last updated.';
COMMENT ON COLUMN core.birth_data.archived_at IS
'Timestamp when this Birth Data version was archived, if applicable.';
COMMENT ON COLUMN core.birth_data.deleted_at IS
'Soft delete timestamp for Birth Data lifecycle handling.';

CREATE INDEX IF NOT EXISTS birth_data_subject_id_idx
  ON core.birth_data (subject_id);

CREATE UNIQUE INDEX IF NOT EXISTS birth_data_active_subject_id_key
  ON core.birth_data (subject_id)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS core.residences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL,
  residence_type text NOT NULL,
  country_code text,
  city text,
  address_label text,
  latitude numeric,
  longitude numeric,
  orientation_degrees numeric,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT residences_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id) ON DELETE CASCADE,
  CONSTRAINT residences_residence_type_check
    CHECK (residence_type IN ('house', 'apartment', 'office', 'storefront', 'land', 'building')),
  CONSTRAINT residences_latitude_check
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT residences_longitude_check
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  CONSTRAINT residences_orientation_degrees_check
    CHECK (orientation_degrees IS NULL OR (orientation_degrees >= 0 AND orientation_degrees < 360)),
  CONSTRAINT residences_version_check
    CHECK (version >= 1)
);

COMMENT ON TABLE core.residences IS
'Residence Subject data and residence context under the Subject aggregate. Exact Residence Location is Level 4 Highly Sensitive when present.';
COMMENT ON COLUMN core.residences.id IS
'Residence entity UUID.';
COMMENT ON COLUMN core.residences.subject_id IS
'Owning Subject reference.';
COMMENT ON COLUMN core.residences.residence_type IS
'Residence type derived from approved Residence Subject examples.';
COMMENT ON COLUMN core.residences.country_code IS
'Country code for residence context.';
COMMENT ON COLUMN core.residences.city IS
'City-level residence context.';
COMMENT ON COLUMN core.residences.address_label IS
'Owner-facing label for recognition only. This must not be treated as a public address.';
COMMENT ON COLUMN core.residences.latitude IS
'Optional residence latitude. Exact Residence Location is Highly Sensitive when present.';
COMMENT ON COLUMN core.residences.longitude IS
'Optional residence longitude. Exact Residence Location is Highly Sensitive when present.';
COMMENT ON COLUMN core.residences.orientation_degrees IS
'Residence orientation in degrees, constrained to 0 inclusive through 360 exclusive.';
COMMENT ON COLUMN core.residences.version IS
'Residence version number. Updates affecting analysis context must preserve version history.';
COMMENT ON COLUMN core.residences.created_at IS
'Timestamp when the Residence record was created.';
COMMENT ON COLUMN core.residences.updated_at IS
'Timestamp when the Residence record was last updated.';
COMMENT ON COLUMN core.residences.archived_at IS
'Timestamp when this Residence version was archived, if applicable.';
COMMENT ON COLUMN core.residences.deleted_at IS
'Soft delete timestamp for Residence lifecycle handling.';

CREATE INDEX IF NOT EXISTS residences_subject_id_idx
  ON core.residences (subject_id);

ALTER TABLE core.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.birth_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.residences ENABLE ROW LEVEL SECURITY;

COMMIT;
