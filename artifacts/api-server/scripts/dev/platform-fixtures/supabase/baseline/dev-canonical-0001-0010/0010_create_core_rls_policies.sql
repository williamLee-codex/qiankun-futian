BEGIN;

CREATE OR REPLACE FUNCTION system.current_core_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog, core, auth
AS $$
  SELECT u.id
  FROM core.users AS u
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION system.current_core_user_id() IS
'Resolves the current authenticated Supabase Auth user to the Imperial Compass core.users aggregate UUID.';

REVOKE ALL ON FUNCTION system.current_core_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION system.current_core_user_id() TO authenticated;

DROP POLICY IF EXISTS core_users_select_owner ON core.users;
CREATE POLICY core_users_select_owner
  ON core.users
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS core_users_update_owner ON core.users;
CREATE POLICY core_users_update_owner
  ON core.users
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

DROP POLICY IF EXISTS core_accounts_select_owner ON core.accounts;
CREATE POLICY core_accounts_select_owner
  ON core.accounts
  FOR SELECT
  TO authenticated
  USING (user_id = system.current_core_user_id());

DROP POLICY IF EXISTS core_sessions_select_owner ON core.sessions;
CREATE POLICY core_sessions_select_owner
  ON core.sessions
  FOR SELECT
  TO authenticated
  USING (user_id = system.current_core_user_id());

DROP POLICY IF EXISTS core_subjects_select_owner ON core.subjects;
CREATE POLICY core_subjects_select_owner
  ON core.subjects
  FOR SELECT
  TO authenticated
  USING (owner_user_id = system.current_core_user_id());

DROP POLICY IF EXISTS core_subjects_insert_owner ON core.subjects;
CREATE POLICY core_subjects_insert_owner
  ON core.subjects
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = system.current_core_user_id());

DROP POLICY IF EXISTS core_subjects_update_owner ON core.subjects;
CREATE POLICY core_subjects_update_owner
  ON core.subjects
  FOR UPDATE
  TO authenticated
  USING (owner_user_id = system.current_core_user_id())
  WITH CHECK (owner_user_id = system.current_core_user_id());

DROP POLICY IF EXISTS core_subjects_delete_owner ON core.subjects;
CREATE POLICY core_subjects_delete_owner
  ON core.subjects
  FOR DELETE
  TO authenticated
  USING (owner_user_id = system.current_core_user_id());

DROP POLICY IF EXISTS core_birth_data_select_subject_owner ON core.birth_data;
CREATE POLICY core_birth_data_select_subject_owner
  ON core.birth_data
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM core.subjects AS s
      WHERE s.id = subject_id
        AND s.owner_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_birth_data_insert_subject_owner ON core.birth_data;
CREATE POLICY core_birth_data_insert_subject_owner
  ON core.birth_data
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM core.subjects AS s
      WHERE s.id = subject_id
        AND s.owner_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_birth_data_update_subject_owner ON core.birth_data;
CREATE POLICY core_birth_data_update_subject_owner
  ON core.birth_data
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM core.subjects AS s
      WHERE s.id = subject_id
        AND s.owner_user_id = system.current_core_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM core.subjects AS s
      WHERE s.id = subject_id
        AND s.owner_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_birth_data_delete_subject_owner ON core.birth_data;
CREATE POLICY core_birth_data_delete_subject_owner
  ON core.birth_data
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM core.subjects AS s
      WHERE s.id = subject_id
        AND s.owner_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_residences_select_subject_owner ON core.residences;
CREATE POLICY core_residences_select_subject_owner
  ON core.residences
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM core.subjects AS s
      WHERE s.id = subject_id
        AND s.owner_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_residences_insert_subject_owner ON core.residences;
CREATE POLICY core_residences_insert_subject_owner
  ON core.residences
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM core.subjects AS s
      WHERE s.id = subject_id
        AND s.owner_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_residences_update_subject_owner ON core.residences;
CREATE POLICY core_residences_update_subject_owner
  ON core.residences
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM core.subjects AS s
      WHERE s.id = subject_id
        AND s.owner_user_id = system.current_core_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM core.subjects AS s
      WHERE s.id = subject_id
        AND s.owner_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_residences_delete_subject_owner ON core.residences;
CREATE POLICY core_residences_delete_subject_owner
  ON core.residences
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM core.subjects AS s
      WHERE s.id = subject_id
        AND s.owner_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_consents_select_grantor ON core.consents;
CREATE POLICY core_consents_select_grantor
  ON core.consents
  FOR SELECT
  TO authenticated
  USING (grantor_user_id = system.current_core_user_id());

DROP POLICY IF EXISTS core_consents_insert_grantor ON core.consents;
CREATE POLICY core_consents_insert_grantor
  ON core.consents
  FOR INSERT
  TO authenticated
  WITH CHECK (grantor_user_id = system.current_core_user_id());

DROP POLICY IF EXISTS core_consents_update_grantor ON core.consents;
CREATE POLICY core_consents_update_grantor
  ON core.consents
  FOR UPDATE
  TO authenticated
  USING (grantor_user_id = system.current_core_user_id())
  WITH CHECK (grantor_user_id = system.current_core_user_id());

DROP POLICY IF EXISTS core_consent_scopes_select_grantor ON core.consent_scopes;
CREATE POLICY core_consent_scopes_select_grantor
  ON core.consent_scopes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM core.consents AS c
      WHERE c.id = consent_id
        AND c.grantor_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_consent_scopes_insert_grantor ON core.consent_scopes;
CREATE POLICY core_consent_scopes_insert_grantor
  ON core.consent_scopes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM core.consents AS c
      WHERE c.id = consent_id
        AND c.grantor_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_consent_scopes_update_grantor ON core.consent_scopes;
CREATE POLICY core_consent_scopes_update_grantor
  ON core.consent_scopes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM core.consents AS c
      WHERE c.id = consent_id
        AND c.grantor_user_id = system.current_core_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM core.consents AS c
      WHERE c.id = consent_id
        AND c.grantor_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_consent_scopes_delete_grantor ON core.consent_scopes;
CREATE POLICY core_consent_scopes_delete_grantor
  ON core.consent_scopes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM core.consents AS c
      WHERE c.id = consent_id
        AND c.grantor_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_data_grants_select_consent_grantor ON core.data_grants;
CREATE POLICY core_data_grants_select_consent_grantor
  ON core.data_grants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM core.consents AS c
      WHERE c.id = consent_id
        AND c.grantor_user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_wallets_select_owner ON core.wallets;
CREATE POLICY core_wallets_select_owner
  ON core.wallets
  FOR SELECT
  TO authenticated
  USING (user_id = system.current_core_user_id());

DROP POLICY IF EXISTS core_wallet_ledgers_select_wallet_owner ON core.wallet_ledgers;
CREATE POLICY core_wallet_ledgers_select_wallet_owner
  ON core.wallet_ledgers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM core.wallets AS w
      WHERE w.id = wallet_id
        AND w.user_id = system.current_core_user_id()
    )
  );

DROP POLICY IF EXISTS core_journeys_select_owner ON core.journeys;
CREATE POLICY core_journeys_select_owner
  ON core.journeys
  FOR SELECT
  TO authenticated
  USING (user_id = system.current_core_user_id());

DROP POLICY IF EXISTS core_milestones_select_journey_owner ON core.milestones;
CREATE POLICY core_milestones_select_journey_owner
  ON core.milestones
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM core.journeys AS j
      WHERE j.id = journey_id
        AND j.user_id = system.current_core_user_id()
    )
  );

COMMIT;
