BEGIN;

CREATE OR REPLACE FUNCTION system.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION system.set_updated_at() IS
'Shared trigger function that sets NEW.updated_at to now() before row updates.';

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON core.users;
CREATE TRIGGER trg_users_set_updated_at
  BEFORE UPDATE ON core.users
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_accounts_set_updated_at ON core.accounts;
CREATE TRIGGER trg_accounts_set_updated_at
  BEFORE UPDATE ON core.accounts
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_sessions_set_updated_at ON core.sessions;
CREATE TRIGGER trg_sessions_set_updated_at
  BEFORE UPDATE ON core.sessions
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_subjects_set_updated_at ON core.subjects;
CREATE TRIGGER trg_subjects_set_updated_at
  BEFORE UPDATE ON core.subjects
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_birth_data_set_updated_at ON core.birth_data;
CREATE TRIGGER trg_birth_data_set_updated_at
  BEFORE UPDATE ON core.birth_data
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_residences_set_updated_at ON core.residences;
CREATE TRIGGER trg_residences_set_updated_at
  BEFORE UPDATE ON core.residences
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_consents_set_updated_at ON core.consents;
CREATE TRIGGER trg_consents_set_updated_at
  BEFORE UPDATE ON core.consents
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_data_grants_set_updated_at ON core.data_grants;
CREATE TRIGGER trg_data_grants_set_updated_at
  BEFORE UPDATE ON core.data_grants
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_wallets_set_updated_at ON core.wallets;
CREATE TRIGGER trg_wallets_set_updated_at
  BEFORE UPDATE ON core.wallets
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

DROP TRIGGER IF EXISTS trg_journeys_set_updated_at ON core.journeys;
CREATE TRIGGER trg_journeys_set_updated_at
  BEFORE UPDATE ON core.journeys
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMIT;
