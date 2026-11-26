BEGIN;

CREATE OR REPLACE FUNCTION platform.bootstrap_admin_operator(
  input_core_user_id uuid,
  input_email text,
  input_request_id text,
  input_completed_at timestamptz DEFAULT now()
)
RETURNS TABLE (
  user_id uuid,
  role text,
  bootstrap_completed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, core, public
AS $$
DECLARE
  core_user_exists boolean;
  operator_exists boolean;
  super_admin_exists boolean;
  state_enabled boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('platform.admin.bootstrap'));

  SELECT EXISTS (
    SELECT 1
    FROM core.users AS cu
    WHERE cu.id = input_core_user_id
      AND cu.deleted_at IS NULL
  )
  INTO core_user_exists;

  IF core_user_exists IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'CORE_USER_NOT_FOUND';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM platform.admin_role_assignments AS ara
    WHERE ara.role = 'SUPER_ADMIN'
      AND ara.revoked_at IS NULL
  )
  INTO super_admin_exists;

  INSERT INTO platform.admin_bootstrap_state (
    bootstrap_key,
    enabled,
    never_reopen,
    version
  )
  VALUES (
    'global',
    NOT super_admin_exists,
    true,
    1
  )
  ON CONFLICT (bootstrap_key) DO NOTHING;

  SELECT abs.enabled
  INTO state_enabled
  FROM platform.admin_bootstrap_state AS abs
  WHERE abs.bootstrap_key = 'global'
  FOR UPDATE;

  IF state_enabled IS DISTINCT FROM true OR super_admin_exists THEN
    RAISE EXCEPTION 'ADMIN_BOOTSTRAP_CLOSED';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM platform.admin_operators AS ao
    WHERE ao.user_id = input_core_user_id
       OR ao.email = input_email
  )
  INTO operator_exists;

  IF operator_exists THEN
    RAISE EXCEPTION 'ADMIN_OPERATOR_ALREADY_EXISTS';
  END IF;

  INSERT INTO platform.admin_operators (
    user_id,
    email,
    status,
    request_id,
    created_at,
    updated_at
  )
  VALUES (
    input_core_user_id,
    input_email,
    'active',
    input_request_id,
    input_completed_at,
    input_completed_at
  );

  INSERT INTO platform.admin_role_assignments (
    user_id,
    role,
    source,
    request_id,
    assigned_at,
    assigned_by
  )
  VALUES (
    input_core_user_id,
    'SUPER_ADMIN',
    'bootstrap',
    input_request_id,
    input_completed_at,
    input_core_user_id
  );

  UPDATE platform.admin_bootstrap_state AS abs
  SET
    enabled = false,
    completed_at = input_completed_at,
    completed_by = input_core_user_id,
    version = abs.version + 1,
    updated_at = input_completed_at
  WHERE abs.bootstrap_key = 'global';

  RETURN QUERY
  SELECT input_core_user_id, 'SUPER_ADMIN', true;
END;
$$;

COMMENT ON FUNCTION platform.bootstrap_admin_operator(uuid, text, text, timestamptz) IS
'Atomically creates the one-time bootstrap SUPER_ADMIN from a canonical Core User id and permanently disables bootstrap.';

COMMIT;
