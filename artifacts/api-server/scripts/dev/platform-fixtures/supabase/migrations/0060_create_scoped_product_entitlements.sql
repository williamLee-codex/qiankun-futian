BEGIN;

-- Star Key scoped premium entitlements.
-- Existing profile_unlocks remain unchanged for ordinary permanent single-item unlocks.
-- This table is only for products whose identity includes a business scope such as
-- calendar year or a canonical unordered pair of subject profiles.
CREATE TABLE IF NOT EXISTS platform.scoped_product_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id text NOT NULL,
  product_key text NOT NULL,
  subject_profile_id uuid NOT NULL REFERENCES public.subject_profiles(id) ON DELETE RESTRICT,
  scope_type text NOT NULL CHECK (scope_type IN ('calendar_year', 'subject_pair')),
  scope_key text NOT NULL,
  cost_crystal integer NOT NULL CHECK (cost_crystal > 0),
  wallet_transaction_id uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scoped_product_entitlements_identity_key
    UNIQUE (owner_id, app_id, product_key, subject_profile_id, scope_type, scope_key),
  CONSTRAINT scoped_product_entitlements_app_check CHECK (btrim(app_id) <> ''),
  CONSTRAINT scoped_product_entitlements_product_check CHECK (btrim(product_key) <> ''),
  CONSTRAINT scoped_product_entitlements_scope_key_check CHECK (btrim(scope_key) <> '')
);

CREATE INDEX IF NOT EXISTS scoped_product_entitlements_owner_subject_idx
  ON platform.scoped_product_entitlements (owner_id, subject_profile_id, app_id);

CREATE INDEX IF NOT EXISTS scoped_product_entitlements_scope_idx
  ON platform.scoped_product_entitlements (app_id, product_key, scope_type, scope_key);

ALTER TABLE platform.scoped_product_entitlements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE platform.scoped_product_entitlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE platform.scoped_product_entitlements TO authenticated;

DROP POLICY IF EXISTS scoped_product_entitlements_owner_select
  ON platform.scoped_product_entitlements;
CREATE POLICY scoped_product_entitlements_owner_select
  ON platform.scoped_product_entitlements
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = owner_id);

COMMENT ON TABLE platform.scoped_product_entitlements IS
'Access rights for paid products whose entitlement identity includes a scope. Star Key uses calendar_year for annualDestinyFull and subject_pair for relationshipSynastryDeep.';

COMMENT ON COLUMN platform.scoped_product_entitlements.scope_key IS
'Canonical business scope identity. calendar_year uses YYYY; subject_pair stores the lexicographically later profile UUID while subject_profile_id stores the earlier UUID.';

COMMIT;
