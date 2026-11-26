BEGIN;

CREATE TABLE IF NOT EXISTS core.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT users_status_check CHECK (status IN ('active', 'archived', 'deleted'))
);

COMMENT ON TABLE core.users IS
'Imperial Compass platform users. This table is the Identity aggregate root and must not store birth data, wallet data, or app profiles.';
COMMENT ON COLUMN core.users.id IS
'Platform User aggregate UUID.';
COMMENT ON COLUMN core.users.auth_user_id IS
'Supabase Auth user reference. This is not the platform aggregate identifier.';
COMMENT ON COLUMN core.users.status IS
'User lifecycle status. Allowed values are active, archived, and deleted.';
COMMENT ON COLUMN core.users.display_name IS
'User-visible display name for Identity profile use.';
COMMENT ON COLUMN core.users.avatar_url IS
'Reference URL for the user avatar. Sensitive media content must not be stored in this column.';
COMMENT ON COLUMN core.users.created_at IS
'Timestamp when the platform user record was created.';
COMMENT ON COLUMN core.users.updated_at IS
'Timestamp when the platform user record was last updated.';
COMMENT ON COLUMN core.users.deleted_at IS
'Soft delete timestamp for user-owned lifecycle handling.';

CREATE TABLE IF NOT EXISTS core.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT accounts_provider_check CHECK (provider IN ('google', 'apple', 'email')),
  CONSTRAINT accounts_provider_account_id_key UNIQUE (provider, provider_account_id)
);

COMMENT ON TABLE core.accounts IS
'Identity provider account links under the User aggregate. OAuth tokens and provider secrets must not be stored here.';
COMMENT ON COLUMN core.accounts.id IS
'Account entity UUID.';
COMMENT ON COLUMN core.accounts.user_id IS
'Owning platform User aggregate reference.';
COMMENT ON COLUMN core.accounts.provider IS
'Approved identity provider. Allowed values are google, apple, and email.';
COMMENT ON COLUMN core.accounts.provider_account_id IS
'External provider account reference. This must not store OAuth access tokens, refresh tokens, or secrets.';
COMMENT ON COLUMN core.accounts.created_at IS
'Timestamp when the account link was created.';
COMMENT ON COLUMN core.accounts.updated_at IS
'Timestamp when the account link was last updated.';
COMMENT ON COLUMN core.accounts.deleted_at IS
'Soft delete timestamp for account lifecycle handling.';

CREATE INDEX IF NOT EXISTS accounts_user_id_idx
  ON core.accounts (user_id);

CREATE TABLE IF NOT EXISTS core.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES core.accounts(id) ON DELETE SET NULL,
  session_reference text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_expires_after_created_check CHECK (expires_at > created_at)
);

COMMENT ON TABLE core.sessions IS
'Authenticated session references under the User aggregate. Raw session tokens must not be stored here.';
COMMENT ON COLUMN core.sessions.id IS
'Session entity UUID.';
COMMENT ON COLUMN core.sessions.user_id IS
'Owning platform User aggregate reference.';
COMMENT ON COLUMN core.sessions.account_id IS
'Optional account reference for authentication context.';
COMMENT ON COLUMN core.sessions.session_reference IS
'Safe external session reference. This column must not contain a raw session token.';
COMMENT ON COLUMN core.sessions.expires_at IS
'Timestamp when the session expires.';
COMMENT ON COLUMN core.sessions.revoked_at IS
'Timestamp when the session was revoked, if applicable.';
COMMENT ON COLUMN core.sessions.created_at IS
'Timestamp when the session reference was created.';
COMMENT ON COLUMN core.sessions.updated_at IS
'Timestamp when the session reference was last updated.';

CREATE INDEX IF NOT EXISTS sessions_user_id_idx
  ON core.sessions (user_id);

CREATE INDEX IF NOT EXISTS sessions_account_id_idx
  ON core.sessions (account_id);

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx
  ON core.sessions (expires_at);

ALTER TABLE core.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.sessions ENABLE ROW LEVEL SECURITY;

COMMIT;
