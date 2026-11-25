BEGIN;

ALTER TABLE platform.admin_operators
  DROP CONSTRAINT IF EXISTS admin_operators_status_check;

ALTER TABLE platform.admin_operators
  ADD CONSTRAINT admin_operators_status_check
  CHECK (status IN ('active', 'disabled', 'suspended'));

COMMENT ON CONSTRAINT admin_operators_status_check ON platform.admin_operators IS
'Allowed Operator lifecycle states for Admin Operator Management.';

CREATE OR REPLACE VIEW platform.admin_operator_directory AS
SELECT
  ao.user_id,
  ao.email,
  ao.status,
  ao.created_at,
  ao.updated_at,
  cu.display_name,
  cu.avatar_url
FROM platform.admin_operators AS ao
JOIN core.users AS cu
  ON ao.user_id = cu.id
WHERE cu.deleted_at IS NULL;

COMMENT ON VIEW platform.admin_operator_directory IS
'Read-only Admin Operator directory projection joining platform.admin_operators to canonical core.users.';

COMMIT;
