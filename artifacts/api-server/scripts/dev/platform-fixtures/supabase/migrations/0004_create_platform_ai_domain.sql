BEGIN;

CREATE TABLE IF NOT EXISTS platform.ai_sessions (
  id uuid DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject_id uuid,
  source_app_id text NOT NULL,
  capability_key text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  provider_key text,
  model_key text,
  prompt_version text NOT NULL,
  context_manifest_hash text,
  idempotency_key text NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT ai_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT ai_sessions_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE RESTRICT,
  CONSTRAINT ai_sessions_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id) ON DELETE SET NULL,
  CONSTRAINT ai_sessions_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT ai_sessions_source_app_id_check
    CHECK (source_app_id ~ '^[a-z][a-z0-9_-]*$'),
  CONSTRAINT ai_sessions_capability_key_check
    CHECK (capability_key ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT ai_sessions_status_check
    CHECK (status IN ('requested', 'authorized', 'processing', 'completed', 'failed', 'rejected', 'cancelled')),
  CONSTRAINT ai_sessions_provider_key_check
    CHECK (
      provider_key IS NULL
      OR (
        provider_key ~ '^[a-z][a-z0-9_-]*$'
        AND lower(provider_key) NOT LIKE '%secret%'
        AND lower(provider_key) NOT LIKE '%token%'
        AND lower(provider_key) NOT LIKE '%api_key%'
      )
    ),
  CONSTRAINT ai_sessions_model_key_check
    CHECK (
      model_key IS NULL
      OR (
        btrim(model_key) <> ''
        AND lower(model_key) NOT LIKE '%secret%'
        AND lower(model_key) NOT LIKE '%token%'
        AND lower(model_key) NOT LIKE '%api_key%'
      )
    ),
  CONSTRAINT ai_sessions_prompt_version_check
    CHECK (
      prompt_version ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
    ),
  CONSTRAINT ai_sessions_context_manifest_hash_check
    CHECK (context_manifest_hash IS NULL OR context_manifest_hash ~ '^[A-Za-z0-9:_-]{16,256}$'),
  CONSTRAINT ai_sessions_idempotency_key_check
    CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT ai_sessions_time_order_check
    CHECK (
      (started_at IS NULL OR started_at >= requested_at)
      AND (completed_at IS NULL OR completed_at >= requested_at)
      AND (failed_at IS NULL OR failed_at >= requested_at)
    )
);

COMMENT ON TABLE platform.ai_sessions IS
'AI Session aggregate root for authorized AI workflow state, provider routing metadata, model references, prompt version references, and Context Manifest references.';
COMMENT ON COLUMN platform.ai_sessions.id IS
'AI Session aggregate UUID.';
COMMENT ON COLUMN platform.ai_sessions.user_id IS
'Core User reference for the AI workflow requester. Platform AI does not own Core users.';
COMMENT ON COLUMN platform.ai_sessions.subject_id IS
'Optional Core Subject reference for the AI workflow context. Subject deletion clears this reference only.';
COMMENT ON COLUMN platform.ai_sessions.source_app_id IS
'Structured source app key that requested the AI workflow.';
COMMENT ON COLUMN platform.ai_sessions.capability_key IS
'Structured AI capability key requested by the source app.';
COMMENT ON COLUMN platform.ai_sessions.status IS
'AI session lifecycle status. Allowed values are requested, authorized, processing, completed, failed, rejected, and cancelled.';
COMMENT ON COLUMN platform.ai_sessions.provider_key IS
'Optional provider routing key. This must not store provider secrets, API keys, tokens, or credentials.';
COMMENT ON COLUMN platform.ai_sessions.model_key IS
'Optional model routing key. This must not store provider secrets, API keys, tokens, or credentials.';
COMMENT ON COLUMN platform.ai_sessions.prompt_version IS
'Prompt version reference. This must not store full prompt text.';
COMMENT ON COLUMN platform.ai_sessions.context_manifest_hash IS
'Optional Context Manifest digest reference. This must not store context payloads or Level 4 data.';
COMMENT ON COLUMN platform.ai_sessions.idempotency_key IS
'Unique idempotency key for AI workflow request deduplication.';
COMMENT ON COLUMN platform.ai_sessions.requested_at IS
'Timestamp when the AI workflow was requested.';
COMMENT ON COLUMN platform.ai_sessions.started_at IS
'Timestamp when AI processing started.';
COMMENT ON COLUMN platform.ai_sessions.completed_at IS
'Timestamp when AI processing completed.';
COMMENT ON COLUMN platform.ai_sessions.failed_at IS
'Timestamp when AI processing failed.';
COMMENT ON COLUMN platform.ai_sessions.created_at IS
'Timestamp when the AI Session record was created.';
COMMENT ON COLUMN platform.ai_sessions.updated_at IS
'Timestamp when the AI Session record was last updated.';
COMMENT ON COLUMN platform.ai_sessions.deleted_at IS
'Timestamp when the AI Session record was soft deleted.';

CREATE INDEX IF NOT EXISTS ai_sessions_user_id_idx
  ON platform.ai_sessions (user_id);

CREATE INDEX IF NOT EXISTS ai_sessions_subject_id_idx
  ON platform.ai_sessions (subject_id);

CREATE INDEX IF NOT EXISTS ai_sessions_source_app_id_idx
  ON platform.ai_sessions (source_app_id);

CREATE INDEX IF NOT EXISTS ai_sessions_status_idx
  ON platform.ai_sessions (status);

CREATE INDEX IF NOT EXISTS ai_sessions_requested_at_idx
  ON platform.ai_sessions (requested_at);

CREATE INDEX IF NOT EXISTS ai_sessions_source_capability_requested_at_idx
  ON platform.ai_sessions (source_app_id, capability_key, requested_at);

CREATE TABLE IF NOT EXISTS platform.ai_contexts (
  id uuid DEFAULT gen_random_uuid(),
  ai_session_id uuid NOT NULL,
  consent_id uuid,
  data_grant_id uuid,
  resource_type text NOT NULL,
  resource_reference uuid NOT NULL,
  scope_key text NOT NULL,
  classification_level smallint NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_contexts_pkey PRIMARY KEY (id),
  CONSTRAINT ai_contexts_ai_session_id_fkey
    FOREIGN KEY (ai_session_id) REFERENCES platform.ai_sessions(id) ON DELETE CASCADE,
  CONSTRAINT ai_contexts_consent_id_fkey
    FOREIGN KEY (consent_id) REFERENCES core.consents(id) ON DELETE RESTRICT,
  CONSTRAINT ai_contexts_data_grant_id_fkey
    FOREIGN KEY (data_grant_id) REFERENCES core.data_grants(id) ON DELETE RESTRICT,
  CONSTRAINT ai_contexts_session_resource_scope_key
    UNIQUE (ai_session_id, resource_type, resource_reference, scope_key),
  CONSTRAINT ai_contexts_resource_type_check
    CHECK (resource_type ~ '^[a-z][a-z0-9_]*$'),
  CONSTRAINT ai_contexts_scope_key_check
    CHECK (scope_key ~ '^[a-z][a-z0-9_:.-]*$'),
  CONSTRAINT ai_contexts_classification_level_check
    CHECK (classification_level BETWEEN 1 AND 4),
  CONSTRAINT ai_contexts_level4_authorization_check
    CHECK (classification_level < 4 OR consent_id IS NOT NULL OR data_grant_id IS NOT NULL),
  CONSTRAINT ai_contexts_expiry_check
    CHECK (expires_at IS NULL OR expires_at > authorized_at)
);

COMMENT ON TABLE platform.ai_contexts IS
'Append-only Context Manifest resource references authorized for an AI Session. This table stores references and classification metadata only.';
COMMENT ON COLUMN platform.ai_contexts.id IS
'AI Context UUID.';
COMMENT ON COLUMN platform.ai_contexts.ai_session_id IS
'Owning AI Session aggregate reference.';
COMMENT ON COLUMN platform.ai_contexts.consent_id IS
'Optional Core Consent reference authorizing context access.';
COMMENT ON COLUMN platform.ai_contexts.data_grant_id IS
'Optional Core Data Grant reference authorizing cross-domain context access.';
COMMENT ON COLUMN platform.ai_contexts.resource_type IS
'Structured resource type key for the authorized context reference.';
COMMENT ON COLUMN platform.ai_contexts.resource_reference IS
'UUID reference to the authorized resource. This must not store resource content.';
COMMENT ON COLUMN platform.ai_contexts.scope_key IS
'Minimal authorized scope key for AI context usage.';
COMMENT ON COLUMN platform.ai_contexts.classification_level IS
'Data classification level from 1 Public through 4 Highly Sensitive.';
COMMENT ON COLUMN platform.ai_contexts.authorized_at IS
'Timestamp when this AI context reference was authorized.';
COMMENT ON COLUMN platform.ai_contexts.expires_at IS
'Optional timestamp when this AI context authorization expires.';
COMMENT ON COLUMN platform.ai_contexts.created_at IS
'Timestamp when this AI context reference was created.';

CREATE INDEX IF NOT EXISTS ai_contexts_ai_session_id_idx
  ON platform.ai_contexts (ai_session_id);

CREATE INDEX IF NOT EXISTS ai_contexts_consent_id_idx
  ON platform.ai_contexts (consent_id);

CREATE INDEX IF NOT EXISTS ai_contexts_data_grant_id_idx
  ON platform.ai_contexts (data_grant_id);

CREATE INDEX IF NOT EXISTS ai_contexts_classification_level_idx
  ON platform.ai_contexts (classification_level);

CREATE TABLE IF NOT EXISTS platform.ai_reports (
  id uuid DEFAULT gen_random_uuid(),
  ai_session_id uuid NOT NULL,
  report_id uuid,
  report_version_id uuid,
  status text NOT NULL DEFAULT 'generated',
  result_hash text NOT NULL,
  citation_count integer NOT NULL DEFAULT 0,
  safety_status text NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_reports_pkey PRIMARY KEY (id),
  CONSTRAINT ai_reports_ai_session_id_key UNIQUE (ai_session_id),
  CONSTRAINT ai_reports_ai_session_id_fkey
    FOREIGN KEY (ai_session_id) REFERENCES platform.ai_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT ai_reports_report_id_fkey
    FOREIGN KEY (report_id) REFERENCES platform.reports(id) ON DELETE SET NULL,
  CONSTRAINT ai_reports_report_version_id_fkey
    FOREIGN KEY (report_version_id) REFERENCES platform.report_versions(id) ON DELETE SET NULL,
  CONSTRAINT ai_reports_status_check
    CHECK (status IN ('generated', 'accepted', 'rejected', 'superseded')),
  CONSTRAINT ai_reports_result_hash_check
    CHECK (result_hash ~ '^[A-Za-z0-9:_-]{16,256}$'),
  CONSTRAINT ai_reports_citation_count_check
    CHECK (citation_count >= 0),
  CONSTRAINT ai_reports_safety_status_check
    CHECK (safety_status IN ('passed', 'review_required', 'blocked'))
);

COMMENT ON TABLE platform.ai_reports IS
'Append-only AI-generated report reference metadata produced by an authorized AI Session. This table stores result digests and report references, not AI response text.';
COMMENT ON COLUMN platform.ai_reports.id IS
'AI Report UUID.';
COMMENT ON COLUMN platform.ai_reports.ai_session_id IS
'Unique AI Session reference. V1 allows one AI Report metadata record per AI Session.';
COMMENT ON COLUMN platform.ai_reports.report_id IS
'Optional Platform Report aggregate reference for the generated AI report.';
COMMENT ON COLUMN platform.ai_reports.report_version_id IS
'Optional Platform Report Version reference for the generated AI report output.';
COMMENT ON COLUMN platform.ai_reports.status IS
'AI report lifecycle status. Allowed values are generated, accepted, rejected, and superseded.';
COMMENT ON COLUMN platform.ai_reports.result_hash IS
'Digest reference for AI result integrity. This must not store AI response text.';
COMMENT ON COLUMN platform.ai_reports.citation_count IS
'Number of citations associated with the AI report result.';
COMMENT ON COLUMN platform.ai_reports.safety_status IS
'Safety review status. Allowed values are passed, review_required, and blocked.';
COMMENT ON COLUMN platform.ai_reports.generated_at IS
'Timestamp when the AI report result was generated.';
COMMENT ON COLUMN platform.ai_reports.created_at IS
'Timestamp when this AI report metadata record was created.';

CREATE INDEX IF NOT EXISTS ai_reports_report_id_idx
  ON platform.ai_reports (report_id);

CREATE INDEX IF NOT EXISTS ai_reports_report_version_id_idx
  ON platform.ai_reports (report_version_id);

CREATE INDEX IF NOT EXISTS ai_reports_status_idx
  ON platform.ai_reports (status);

CREATE INDEX IF NOT EXISTS ai_reports_generated_at_idx
  ON platform.ai_reports (generated_at);

DROP TRIGGER IF EXISTS trg_ai_sessions_set_updated_at ON platform.ai_sessions;
CREATE TRIGGER trg_ai_sessions_set_updated_at
  BEFORE UPDATE ON platform.ai_sessions
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_ai_sessions_set_updated_at ON platform.ai_sessions IS
'Maintains platform.ai_sessions.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_ai_contexts_reject_update ON platform.ai_contexts;
CREATE TRIGGER trg_ai_contexts_reject_update
  BEFORE UPDATE ON platform.ai_contexts
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_ai_contexts_reject_update ON platform.ai_contexts IS
'Rejects all UPDATE attempts on append-only AI Context records.';

DROP TRIGGER IF EXISTS trg_ai_contexts_reject_delete ON platform.ai_contexts;
CREATE TRIGGER trg_ai_contexts_reject_delete
  BEFORE DELETE ON platform.ai_contexts
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_ai_contexts_reject_delete ON platform.ai_contexts IS
'Rejects all DELETE attempts on append-only AI Context records.';

DROP TRIGGER IF EXISTS trg_ai_reports_reject_update ON platform.ai_reports;
CREATE TRIGGER trg_ai_reports_reject_update
  BEFORE UPDATE ON platform.ai_reports
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_ai_reports_reject_update ON platform.ai_reports IS
'Rejects all UPDATE attempts on append-only AI Report records.';

DROP TRIGGER IF EXISTS trg_ai_reports_reject_delete ON platform.ai_reports;
CREATE TRIGGER trg_ai_reports_reject_delete
  BEFORE DELETE ON platform.ai_reports
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_ai_reports_reject_delete ON platform.ai_reports IS
'Rejects all DELETE attempts on append-only AI Report records.';

ALTER TABLE platform.ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.ai_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.ai_reports ENABLE ROW LEVEL SECURITY;

COMMIT;
