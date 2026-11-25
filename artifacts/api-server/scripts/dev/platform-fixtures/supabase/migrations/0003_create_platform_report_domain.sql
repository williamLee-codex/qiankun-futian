BEGIN;

CREATE TABLE IF NOT EXISTS platform.reports (
  id uuid DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  report_type text NOT NULL,
  source_app text NOT NULL,
  report_status text NOT NULL DEFAULT 'requested',
  current_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT reports_pkey PRIMARY KEY (id),
  CONSTRAINT reports_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE RESTRICT,
  CONSTRAINT reports_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id) ON DELETE RESTRICT,
  CONSTRAINT reports_report_type_check
    CHECK (report_type ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT reports_source_app_check
    CHECK (source_app ~ '^[a-z][a-z0-9_-]*$'),
  CONSTRAINT reports_report_status_check
    CHECK (report_status IN ('requested', 'generating', 'completed', 'archived', 'expired', 'failed')),
  CONSTRAINT reports_current_version_check
    CHECK (current_version >= 0),
  CONSTRAINT reports_archive_delete_order_check
    CHECK (
      deleted_at IS NULL
      OR archived_at IS NULL
      OR deleted_at >= archived_at
    )
);

COMMENT ON TABLE platform.reports IS
'Report aggregate root for shared platform report workflow state. Report contents are versioned through platform.report_versions.';
COMMENT ON COLUMN platform.reports.id IS
'Report aggregate UUID.';
COMMENT ON COLUMN platform.reports.user_id IS
'Core User reference for the report owner or requester. Platform reports do not own Core users.';
COMMENT ON COLUMN platform.reports.subject_id IS
'Core Subject reference for the report subject. Platform reports do not own Core subjects.';
COMMENT ON COLUMN platform.reports.report_type IS
'Structured report type key such as destiny, dream, relationship, fengshui, naming, or app-specific approved report categories.';
COMMENT ON COLUMN platform.reports.source_app IS
'Structured source app key that requested or produced this report.';
COMMENT ON COLUMN platform.reports.report_status IS
'Report lifecycle status. Allowed values are requested, generating, completed, archived, expired, and failed.';
COMMENT ON COLUMN platform.reports.current_version IS
'Current completed report version number. Report version rows remain append-only.';
COMMENT ON COLUMN platform.reports.created_at IS
'Timestamp when the Report aggregate was created.';
COMMENT ON COLUMN platform.reports.updated_at IS
'Timestamp when the Report aggregate was last updated.';
COMMENT ON COLUMN platform.reports.archived_at IS
'Timestamp when the Report aggregate was archived.';
COMMENT ON COLUMN platform.reports.deleted_at IS
'Timestamp when the Report aggregate was soft deleted.';

CREATE INDEX IF NOT EXISTS reports_user_id_idx
  ON platform.reports (user_id);

CREATE INDEX IF NOT EXISTS reports_subject_id_idx
  ON platform.reports (subject_id);

CREATE INDEX IF NOT EXISTS reports_report_type_idx
  ON platform.reports (report_type);

CREATE INDEX IF NOT EXISTS reports_source_app_idx
  ON platform.reports (source_app);

CREATE INDEX IF NOT EXISTS reports_report_status_idx
  ON platform.reports (report_status);

CREATE INDEX IF NOT EXISTS reports_subject_status_created_at_idx
  ON platform.reports (subject_id, report_status, created_at);

CREATE TABLE IF NOT EXISTS platform.report_versions (
  id uuid DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL,
  version_number integer NOT NULL,
  content_hash text NOT NULL,
  ai_model text,
  prompt_version text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_versions_pkey PRIMARY KEY (id),
  CONSTRAINT report_versions_report_id_fkey
    FOREIGN KEY (report_id) REFERENCES platform.reports(id) ON DELETE RESTRICT,
  CONSTRAINT report_versions_report_version_key
    UNIQUE (report_id, version_number),
  CONSTRAINT report_versions_content_hash_check
    CHECK (content_hash ~ '^[A-Za-z0-9:_-]{16,256}$'),
  CONSTRAINT report_versions_version_number_check
    CHECK (version_number >= 1),
  CONSTRAINT report_versions_ai_model_check
    CHECK (ai_model IS NULL OR btrim(ai_model) <> ''),
  CONSTRAINT report_versions_prompt_version_check
    CHECK (prompt_version IS NULL OR btrim(prompt_version) <> '')
);

COMMENT ON TABLE platform.report_versions IS
'Append-only Report version records. This table stores report version metadata and content hashes, not raw report body or output payloads.';
COMMENT ON COLUMN platform.report_versions.id IS
'Report Version UUID.';
COMMENT ON COLUMN platform.report_versions.report_id IS
'Owning Report aggregate reference.';
COMMENT ON COLUMN platform.report_versions.version_number IS
'Monotonic report version number scoped to the owning Report.';
COMMENT ON COLUMN platform.report_versions.content_hash IS
'Hash or structured digest reference for generated report content. This must not store raw report content.';
COMMENT ON COLUMN platform.report_versions.ai_model IS
'Optional AI model identifier used to generate this version.';
COMMENT ON COLUMN platform.report_versions.prompt_version IS
'Optional prompt version identifier used to generate this version.';
COMMENT ON COLUMN platform.report_versions.generated_at IS
'Timestamp when this report version was generated.';
COMMENT ON COLUMN platform.report_versions.created_at IS
'Timestamp when this report version record was created.';

CREATE INDEX IF NOT EXISTS report_versions_report_id_idx
  ON platform.report_versions (report_id);

CREATE INDEX IF NOT EXISTS report_versions_generated_at_idx
  ON platform.report_versions (generated_at);

CREATE TABLE IF NOT EXISTS platform.report_outputs (
  id uuid DEFAULT gen_random_uuid(),
  report_version_id uuid NOT NULL,
  output_type text NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  checksum text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_outputs_pkey PRIMARY KEY (id),
  CONSTRAINT report_outputs_report_version_id_fkey
    FOREIGN KEY (report_version_id) REFERENCES platform.report_versions(id) ON DELETE RESTRICT,
  CONSTRAINT report_outputs_version_output_type_key
    UNIQUE (report_version_id, output_type),
  CONSTRAINT report_outputs_output_type_check
    CHECK (output_type IN ('pdf', 'html', 'json', 'markdown', 'image', 'audio', 'video')),
  CONSTRAINT report_outputs_storage_bucket_check
    CHECK (storage_bucket ~ '^[a-z][a-z0-9_-]*$'),
  CONSTRAINT report_outputs_storage_path_check
    CHECK (btrim(storage_path) <> ''),
  CONSTRAINT report_outputs_mime_type_check
    CHECK (mime_type ~ '^[a-z0-9][a-z0-9.+-]*/[a-z0-9][a-z0-9.+-]*$'),
  CONSTRAINT report_outputs_checksum_check
    CHECK (checksum ~ '^[A-Za-z0-9:_-]{16,256}$')
);

COMMENT ON TABLE platform.report_outputs IS
'Report output file references for PDF, HTML, JSON, Markdown, image, audio, and video outputs. File content must remain in Storage, not in this table.';
COMMENT ON COLUMN platform.report_outputs.id IS
'Report Output UUID.';
COMMENT ON COLUMN platform.report_outputs.report_version_id IS
'Report Version reference for the generated output.';
COMMENT ON COLUMN platform.report_outputs.output_type IS
'Generated output type. Allowed values are pdf, html, json, markdown, image, audio, and video.';
COMMENT ON COLUMN platform.report_outputs.storage_bucket IS
'Supabase Storage bucket name for the output object reference.';
COMMENT ON COLUMN platform.report_outputs.storage_path IS
'Supabase Storage object path for the output object reference. This is a reference, not file content.';
COMMENT ON COLUMN platform.report_outputs.mime_type IS
'MIME type for the referenced output object.';
COMMENT ON COLUMN platform.report_outputs.checksum IS
'Checksum or structured digest for output integrity verification.';
COMMENT ON COLUMN platform.report_outputs.expires_at IS
'Optional timestamp when this output reference expires or should no longer be available.';
COMMENT ON COLUMN platform.report_outputs.created_at IS
'Timestamp when this report output reference was created.';

CREATE INDEX IF NOT EXISTS report_outputs_report_version_id_idx
  ON platform.report_outputs (report_version_id);

CREATE INDEX IF NOT EXISTS report_outputs_output_type_idx
  ON platform.report_outputs (output_type);

CREATE INDEX IF NOT EXISTS report_outputs_expires_at_idx
  ON platform.report_outputs (expires_at);

DROP TRIGGER IF EXISTS trg_reports_set_updated_at ON platform.reports;
CREATE TRIGGER trg_reports_set_updated_at
  BEFORE UPDATE ON platform.reports
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_reports_set_updated_at ON platform.reports IS
'Maintains platform.reports.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_report_versions_reject_update ON platform.report_versions;
CREATE TRIGGER trg_report_versions_reject_update
  BEFORE UPDATE ON platform.report_versions
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_report_versions_reject_update ON platform.report_versions IS
'Rejects all UPDATE attempts on append-only Report Version records.';

DROP TRIGGER IF EXISTS trg_report_versions_reject_delete ON platform.report_versions;
CREATE TRIGGER trg_report_versions_reject_delete
  BEFORE DELETE ON platform.report_versions
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_report_versions_reject_delete ON platform.report_versions IS
'Rejects all DELETE attempts on append-only Report Version records.';

ALTER TABLE platform.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.report_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.report_outputs ENABLE ROW LEVEL SECURITY;

COMMIT;
