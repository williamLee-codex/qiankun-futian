BEGIN;

CREATE TABLE IF NOT EXISTS platform.products (
  id uuid DEFAULT gen_random_uuid(),
  product_key text NOT NULL,
  product_type text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_product_key_key UNIQUE (product_key),
  CONSTRAINT products_product_key_check
    CHECK (product_key ~ '^[a-z][a-z0-9_.:-]*$'),
  CONSTRAINT products_product_type_check
    CHECK (product_type IN ('capability', 'app_unlock', 'report_unlock', 'feature_unlock', 'subscription', 'consumable', 'trial', 'gift', 'coupon', 'vip', 'premium')),
  CONSTRAINT products_display_name_check
    CHECK (btrim(display_name) <> ''),
  CONSTRAINT products_status_check
    CHECK (status IN ('draft', 'active', 'inactive', 'deprecated', 'archived'))
);

COMMENT ON TABLE platform.products IS
'Platform product and capability definitions used by Entitlements. This table stores capability metadata only.';
COMMENT ON COLUMN platform.products.id IS
'Product UUID.';
COMMENT ON COLUMN platform.products.product_key IS
'Stable platform product or capability key. This is a secondary identifier and not the primary key.';
COMMENT ON COLUMN platform.products.product_type IS
'Product category. Allowed values are capability, app_unlock, report_unlock, feature_unlock, subscription, consumable, trial, gift, coupon, vip, and premium.';
COMMENT ON COLUMN platform.products.display_name IS
'Human-readable product or capability name.';
COMMENT ON COLUMN platform.products.status IS
'Product lifecycle status. Allowed values are draft, active, inactive, deprecated, and archived.';
COMMENT ON COLUMN platform.products.created_at IS
'Timestamp when the Product record was created.';
COMMENT ON COLUMN platform.products.updated_at IS
'Timestamp when the Product record was last updated.';

CREATE INDEX IF NOT EXISTS products_product_type_idx
  ON platform.products (product_type);

CREATE INDEX IF NOT EXISTS products_status_idx
  ON platform.products (status);

CREATE TABLE IF NOT EXISTS platform.entitlements (
  id uuid DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  entitlement_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlements_pkey PRIMARY KEY (id),
  CONSTRAINT entitlements_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE RESTRICT,
  CONSTRAINT entitlements_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES platform.products(id) ON DELETE RESTRICT,
  CONSTRAINT entitlements_entitlement_type_check
    CHECK (entitlement_type IN ('lifetime', 'subscription', 'consumable', 'trial', 'gift', 'coupon', 'admin_grant')),
  CONSTRAINT entitlements_status_check
    CHECK (status IN ('active', 'trialing', 'consumed', 'expired', 'revoked', 'suspended')),
  CONSTRAINT entitlements_expiry_check
    CHECK (expires_at IS NULL OR expires_at > granted_at),
  CONSTRAINT entitlements_revoked_at_check
    CHECK (revoked_at IS NULL OR revoked_at >= granted_at),
  CONSTRAINT entitlements_revoked_status_check
    CHECK ((revoked_at IS NULL AND status <> 'revoked') OR (revoked_at IS NOT NULL AND status = 'revoked')),
  CONSTRAINT entitlements_consumable_status_check
    CHECK (entitlement_type = 'consumable' OR status <> 'consumed')
);

COMMENT ON TABLE platform.entitlements IS
'Entitlement aggregate root and single source of truth for user access rights to platform products and capabilities. This table stores access rights only.';
COMMENT ON COLUMN platform.entitlements.id IS
'Entitlement aggregate UUID.';
COMMENT ON COLUMN platform.entitlements.user_id IS
'Core User reference for the owner of the entitlement.';
COMMENT ON COLUMN platform.entitlements.product_id IS
'Platform Product reference for the granted capability or unlock.';
COMMENT ON COLUMN platform.entitlements.entitlement_type IS
'Entitlement type. Allowed values are lifetime, subscription, consumable, trial, gift, coupon, and admin_grant.';
COMMENT ON COLUMN platform.entitlements.status IS
'Entitlement lifecycle status. Allowed values are active, trialing, consumed, expired, revoked, and suspended.';
COMMENT ON COLUMN platform.entitlements.granted_at IS
'Timestamp when the entitlement was granted.';
COMMENT ON COLUMN platform.entitlements.expires_at IS
'Optional timestamp when the entitlement expires.';
COMMENT ON COLUMN platform.entitlements.revoked_at IS
'Optional timestamp when the entitlement was revoked.';
COMMENT ON COLUMN platform.entitlements.created_at IS
'Timestamp when the Entitlement aggregate was created.';
COMMENT ON COLUMN platform.entitlements.updated_at IS
'Timestamp when the Entitlement aggregate was last updated.';

CREATE INDEX IF NOT EXISTS entitlements_user_id_idx
  ON platform.entitlements (user_id);

CREATE INDEX IF NOT EXISTS entitlements_product_id_idx
  ON platform.entitlements (product_id);

CREATE INDEX IF NOT EXISTS entitlements_entitlement_type_idx
  ON platform.entitlements (entitlement_type);

CREATE INDEX IF NOT EXISTS entitlements_status_idx
  ON platform.entitlements (status);

CREATE INDEX IF NOT EXISTS entitlements_expires_at_idx
  ON platform.entitlements (expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS entitlements_user_product_active_non_consumable_key
  ON platform.entitlements (user_id, product_id)
  WHERE status IN ('active', 'trialing', 'suspended')
    AND entitlement_type IN ('lifetime', 'subscription', 'trial', 'gift', 'coupon', 'admin_grant');

CREATE TABLE IF NOT EXISTS platform.entitlement_events (
  id uuid DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL,
  event_type text NOT NULL,
  source text NOT NULL,
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlement_events_pkey PRIMARY KEY (id),
  CONSTRAINT entitlement_events_entitlement_id_fkey
    FOREIGN KEY (entitlement_id) REFERENCES platform.entitlements(id) ON DELETE RESTRICT,
  CONSTRAINT entitlement_events_event_type_check
    CHECK (event_type IN ('granted', 'activated', 'renewed', 'consumed', 'expired', 'revoked', 'suspended', 'restored')),
  CONSTRAINT entitlement_events_source_check
    CHECK (source IN ('system', 'purchase', 'subscription', 'trial', 'gift', 'coupon', 'admin', 'app', 'migration')),
  CONSTRAINT entitlement_events_reference_id_source_check
    CHECK (source IN ('system', 'admin') OR reference_id IS NOT NULL)
);

COMMENT ON TABLE platform.entitlement_events IS
'Append-only Entitlement lifecycle event references. This table stores event metadata and source references only.';
COMMENT ON COLUMN platform.entitlement_events.id IS
'Entitlement Event UUID.';
COMMENT ON COLUMN platform.entitlement_events.entitlement_id IS
'Owning Entitlement aggregate reference.';
COMMENT ON COLUMN platform.entitlement_events.event_type IS
'Entitlement event type. Allowed values are granted, activated, renewed, consumed, expired, revoked, suspended, and restored.';
COMMENT ON COLUMN platform.entitlement_events.source IS
'Structured source that caused the entitlement event. This is not a payment record or provider credential.';
COMMENT ON COLUMN platform.entitlement_events.reference_id IS
'Optional UUID reference to the authorized source resource that caused the event.';
COMMENT ON COLUMN platform.entitlement_events.created_at IS
'Timestamp when this Entitlement event record was created.';

CREATE INDEX IF NOT EXISTS entitlement_events_entitlement_id_idx
  ON platform.entitlement_events (entitlement_id);

CREATE INDEX IF NOT EXISTS entitlement_events_event_type_idx
  ON platform.entitlement_events (event_type);

CREATE INDEX IF NOT EXISTS entitlement_events_source_idx
  ON platform.entitlement_events (source);

CREATE INDEX IF NOT EXISTS entitlement_events_created_at_idx
  ON platform.entitlement_events (created_at);

DROP TRIGGER IF EXISTS trg_products_set_updated_at ON platform.products;
CREATE TRIGGER trg_products_set_updated_at
  BEFORE UPDATE ON platform.products
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_products_set_updated_at ON platform.products IS
'Maintains platform.products.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_entitlements_set_updated_at ON platform.entitlements;
CREATE TRIGGER trg_entitlements_set_updated_at
  BEFORE UPDATE ON platform.entitlements
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_entitlements_set_updated_at ON platform.entitlements IS
'Maintains platform.entitlements.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_entitlement_events_reject_update ON platform.entitlement_events;
CREATE TRIGGER trg_entitlement_events_reject_update
  BEFORE UPDATE ON platform.entitlement_events
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_entitlement_events_reject_update ON platform.entitlement_events IS
'Rejects all UPDATE attempts on append-only Entitlement Event records.';

DROP TRIGGER IF EXISTS trg_entitlement_events_reject_delete ON platform.entitlement_events;
CREATE TRIGGER trg_entitlement_events_reject_delete
  BEFORE DELETE ON platform.entitlement_events
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_entitlement_events_reject_delete ON platform.entitlement_events IS
'Rejects all DELETE attempts on append-only Entitlement Event records.';

ALTER TABLE platform.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.entitlement_events ENABLE ROW LEVEL SECURITY;

COMMIT;
