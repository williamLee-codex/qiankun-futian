BEGIN;

CREATE TABLE IF NOT EXISTS core.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grantor_user_id uuid NOT NULL,
  subject_id uuid,
  grantee_app_id text NOT NULL,
  purpose text NOT NULL,
  status text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT consents_grantor_user_id_fkey
    FOREIGN KEY (grantor_user_id) REFERENCES core.users(id) ON DELETE RESTRICT,
  CONSTRAINT consents_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id) ON DELETE CASCADE,
  CONSTRAINT consents_grantee_app_id_check
    CHECK (btrim(grantee_app_id) <> ''),
  CONSTRAINT consents_purpose_check
    CHECK (btrim(purpose) <> ''),
  CONSTRAINT consents_status_check
    CHECK (status IN ('active', 'expired', 'revoked')),
  CONSTRAINT consents_expires_after_granted_check
    CHECK (expires_at IS NULL OR expires_at > granted_at),
  CONSTRAINT consents_revoked_after_granted_check
    CHECK (revoked_at IS NULL OR revoked_at >= granted_at),
  CONSTRAINT consents_version_check
    CHECK (version >= 1)
);

COMMENT ON TABLE core.consents IS
'Consent and Data Grant aggregate root records. Consent Record is Level 4 Highly Sensitive and must not store secrets or unstructured authorization payloads.';
COMMENT ON COLUMN core.consents.id IS
'Consent aggregate UUID.';
COMMENT ON COLUMN core.consents.grantor_user_id IS
'User who grants permission.';
COMMENT ON COLUMN core.consents.subject_id IS
'Optional Subject governed by this consent.';
COMMENT ON COLUMN core.consents.grantee_app_id IS
'App identifier receiving permission through consent.';
COMMENT ON COLUMN core.consents.purpose IS
'Structured consent purpose. This must not contain secrets or raw private payloads.';
COMMENT ON COLUMN core.consents.status IS
'Consent status. Allowed values are active, expired, and revoked.';
COMMENT ON COLUMN core.consents.granted_at IS
'Timestamp when consent was granted.';
COMMENT ON COLUMN core.consents.expires_at IS
'Timestamp when consent expires, if applicable.';
COMMENT ON COLUMN core.consents.revoked_at IS
'Timestamp when consent was revoked, if applicable.';
COMMENT ON COLUMN core.consents.version IS
'Consent version for traceability.';
COMMENT ON COLUMN core.consents.created_at IS
'Timestamp when the consent record was created.';
COMMENT ON COLUMN core.consents.updated_at IS
'Timestamp when the consent record was last updated.';
COMMENT ON COLUMN core.consents.deleted_at IS
'Soft delete timestamp for consent lifecycle handling.';

CREATE INDEX IF NOT EXISTS consents_grantor_user_id_idx
  ON core.consents (grantor_user_id);

CREATE INDEX IF NOT EXISTS consents_subject_id_idx
  ON core.consents (subject_id);

CREATE INDEX IF NOT EXISTS consents_grantee_app_id_idx
  ON core.consents (grantee_app_id);

CREATE INDEX IF NOT EXISTS consents_status_idx
  ON core.consents (status);

CREATE TABLE IF NOT EXISTS core.consent_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id uuid NOT NULL,
  resource_type text NOT NULL,
  permission_type text NOT NULL,
  scope_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT consent_scopes_consent_id_fkey
    FOREIGN KEY (consent_id) REFERENCES core.consents(id) ON DELETE CASCADE,
  CONSTRAINT consent_scopes_resource_type_check
    CHECK (btrim(resource_type) <> ''),
  CONSTRAINT consent_scopes_permission_type_check
    CHECK (permission_type IN ('read', 'write', 'grant', 'export')),
  CONSTRAINT consent_scopes_scope_key_check
    CHECK (btrim(scope_key) <> '' AND lower(btrim(scope_key)) <> 'all'),
  CONSTRAINT consent_scopes_scope_key UNIQUE (consent_id, resource_type, permission_type, scope_key)
);

COMMENT ON TABLE core.consent_scopes IS
'Scoped permission boundaries attached to Consent records. Scope must be minimized and must not default to all.';
COMMENT ON COLUMN core.consent_scopes.id IS
'Consent Scope entity UUID.';
COMMENT ON COLUMN core.consent_scopes.consent_id IS
'Owning Consent aggregate reference.';
COMMENT ON COLUMN core.consent_scopes.resource_type IS
'Resource type covered by this scope.';
COMMENT ON COLUMN core.consent_scopes.permission_type IS
'Canonical permission type. Allowed values are read, write, grant, and export.';
COMMENT ON COLUMN core.consent_scopes.scope_key IS
'Minimal scope key. The value all is not allowed.';
COMMENT ON COLUMN core.consent_scopes.created_at IS
'Timestamp when the consent scope was created.';
COMMENT ON COLUMN core.consent_scopes.deleted_at IS
'Soft delete timestamp for consent scope lifecycle handling.';

CREATE INDEX IF NOT EXISTS consent_scopes_consent_id_idx
  ON core.consent_scopes (consent_id);

CREATE INDEX IF NOT EXISTS consent_scopes_resource_type_idx
  ON core.consent_scopes (resource_type);

CREATE TABLE IF NOT EXISTS core.data_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consent_id uuid NOT NULL,
  source_app_id text NOT NULL,
  target_app_id text NOT NULL,
  subject_id uuid NOT NULL,
  resource_type text NOT NULL,
  resource_reference uuid NOT NULL,
  scope_key text NOT NULL,
  status text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT data_grants_consent_id_fkey
    FOREIGN KEY (consent_id) REFERENCES core.consents(id) ON DELETE CASCADE,
  CONSTRAINT data_grants_subject_id_fkey
    FOREIGN KEY (subject_id) REFERENCES core.subjects(id) ON DELETE CASCADE,
  CONSTRAINT data_grants_source_app_id_check
    CHECK (btrim(source_app_id) <> ''),
  CONSTRAINT data_grants_target_app_id_check
    CHECK (btrim(target_app_id) <> ''),
  CONSTRAINT data_grants_different_apps_check
    CHECK (source_app_id <> target_app_id),
  CONSTRAINT data_grants_resource_type_check
    CHECK (btrim(resource_type) <> ''),
  CONSTRAINT data_grants_scope_key_check
    CHECK (btrim(scope_key) <> '' AND lower(btrim(scope_key)) <> 'all'),
  CONSTRAINT data_grants_status_check
    CHECK (status IN ('active', 'expired', 'revoked')),
  CONSTRAINT data_grants_expires_after_issued_check
    CHECK (expires_at IS NULL OR expires_at > issued_at),
  CONSTRAINT data_grants_revoked_after_issued_check
    CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);

COMMENT ON TABLE core.data_grants IS
'Cross-app Data Grant records. This table stores only scoped resource references and must not store source app internal data.';
COMMENT ON COLUMN core.data_grants.id IS
'Data Grant entity UUID.';
COMMENT ON COLUMN core.data_grants.consent_id IS
'Owning Consent aggregate reference.';
COMMENT ON COLUMN core.data_grants.source_app_id IS
'App identifier that owns the referenced resource or summary.';
COMMENT ON COLUMN core.data_grants.target_app_id IS
'App identifier receiving the scoped grant.';
COMMENT ON COLUMN core.data_grants.subject_id IS
'Subject governed by this data grant.';
COMMENT ON COLUMN core.data_grants.resource_type IS
'Referenced resource type. This is metadata only, not copied app data.';
COMMENT ON COLUMN core.data_grants.resource_reference IS
'UUID reference to the approved resource or summary. This must not contain app internal payload data.';
COMMENT ON COLUMN core.data_grants.scope_key IS
'Minimal scope key for this grant. The value all is not allowed.';
COMMENT ON COLUMN core.data_grants.status IS
'Data Grant status. Allowed values are active, expired, and revoked.';
COMMENT ON COLUMN core.data_grants.issued_at IS
'Timestamp when the Data Grant was issued.';
COMMENT ON COLUMN core.data_grants.expires_at IS
'Timestamp when the Data Grant expires, if applicable.';
COMMENT ON COLUMN core.data_grants.revoked_at IS
'Timestamp when the Data Grant was revoked, if applicable.';
COMMENT ON COLUMN core.data_grants.created_at IS
'Timestamp when the Data Grant record was created.';
COMMENT ON COLUMN core.data_grants.updated_at IS
'Timestamp when the Data Grant record was last updated.';
COMMENT ON COLUMN core.data_grants.deleted_at IS
'Soft delete timestamp for Data Grant lifecycle handling.';

CREATE INDEX IF NOT EXISTS data_grants_consent_id_idx
  ON core.data_grants (consent_id);

CREATE INDEX IF NOT EXISTS data_grants_subject_id_idx
  ON core.data_grants (subject_id);

CREATE INDEX IF NOT EXISTS data_grants_source_app_id_idx
  ON core.data_grants (source_app_id);

CREATE INDEX IF NOT EXISTS data_grants_target_app_id_idx
  ON core.data_grants (target_app_id);

CREATE INDEX IF NOT EXISTS data_grants_status_idx
  ON core.data_grants (status);

CREATE UNIQUE INDEX IF NOT EXISTS data_grants_active_reference_key
  ON core.data_grants (
    consent_id,
    source_app_id,
    target_app_id,
    subject_id,
    resource_type,
    resource_reference,
    scope_key
  )
  WHERE status = 'active';

ALTER TABLE core.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.consent_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.data_grants ENABLE ROW LEVEL SECURITY;

COMMIT;
