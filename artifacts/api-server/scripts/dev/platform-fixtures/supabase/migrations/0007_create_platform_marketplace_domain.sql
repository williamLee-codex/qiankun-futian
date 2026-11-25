BEGIN;

CREATE TABLE IF NOT EXISTS platform.marketplace_items (
  id uuid DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  item_key text NOT NULL,
  display_name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft',
  visibility text NOT NULL DEFAULT 'private',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT marketplace_items_pkey PRIMARY KEY (id),
  CONSTRAINT marketplace_items_product_id_key UNIQUE (product_id),
  CONSTRAINT marketplace_items_item_key_key UNIQUE (item_key),
  CONSTRAINT marketplace_items_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES platform.products(id) ON DELETE RESTRICT,
  CONSTRAINT marketplace_items_item_key_check
    CHECK (item_key ~ '^[a-z][a-z0-9_.:-]*$'),
  CONSTRAINT marketplace_items_display_name_check
    CHECK (btrim(display_name) <> ''),
  CONSTRAINT marketplace_items_description_check
    CHECK (description IS NULL OR btrim(description) <> ''),
  CONSTRAINT marketplace_items_status_check
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  CONSTRAINT marketplace_items_visibility_check
    CHECK (visibility IN ('private', 'authenticated', 'public')),
  CONSTRAINT marketplace_items_sort_order_check
    CHECK (sort_order >= 0),
  CONSTRAINT marketplace_items_archive_delete_order_check
    CHECK (
      deleted_at IS NULL
      OR archived_at IS NULL
      OR deleted_at >= archived_at
    )
);

COMMENT ON TABLE platform.marketplace_items IS
'Marketplace item aggregate root for exposing platform products as catalog items.';
COMMENT ON COLUMN platform.marketplace_items.id IS
'Marketplace Item UUID.';
COMMENT ON COLUMN platform.marketplace_items.product_id IS
'Unique Platform Product reference. Marketplace items expose products but do not own product capability definitions.';
COMMENT ON COLUMN platform.marketplace_items.item_key IS
'Stable marketplace item key. This is a secondary identifier and not the primary key.';
COMMENT ON COLUMN platform.marketplace_items.display_name IS
'Human-readable marketplace item name.';
COMMENT ON COLUMN platform.marketplace_items.description IS
'Optional marketplace item description.';
COMMENT ON COLUMN platform.marketplace_items.status IS
'Marketplace item lifecycle status. Allowed values are draft, active, paused, and archived.';
COMMENT ON COLUMN platform.marketplace_items.visibility IS
'Marketplace item visibility. Allowed values are private, authenticated, and public.';
COMMENT ON COLUMN platform.marketplace_items.sort_order IS
'Non-negative marketplace display ordering value.';
COMMENT ON COLUMN platform.marketplace_items.created_at IS
'Timestamp when the Marketplace Item record was created.';
COMMENT ON COLUMN platform.marketplace_items.updated_at IS
'Timestamp when the Marketplace Item record was last updated.';
COMMENT ON COLUMN platform.marketplace_items.archived_at IS
'Timestamp when the Marketplace Item record was archived.';
COMMENT ON COLUMN platform.marketplace_items.deleted_at IS
'Timestamp when the Marketplace Item record was soft deleted.';

CREATE INDEX IF NOT EXISTS marketplace_items_product_id_idx
  ON platform.marketplace_items (product_id);

CREATE INDEX IF NOT EXISTS marketplace_items_status_idx
  ON platform.marketplace_items (status);

CREATE INDEX IF NOT EXISTS marketplace_items_visibility_idx
  ON platform.marketplace_items (visibility);

CREATE INDEX IF NOT EXISTS marketplace_items_sort_order_idx
  ON platform.marketplace_items (sort_order);

CREATE TABLE IF NOT EXISTS platform.marketplace_prices (
  id uuid DEFAULT gen_random_uuid(),
  marketplace_item_id uuid NOT NULL,
  currency_type text NOT NULL,
  amount bigint NOT NULL,
  billing_period text,
  status text NOT NULL DEFAULT 'active',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_prices_pkey PRIMARY KEY (id),
  CONSTRAINT marketplace_prices_marketplace_item_id_fkey
    FOREIGN KEY (marketplace_item_id) REFERENCES platform.marketplace_items(id) ON DELETE CASCADE,
  CONSTRAINT marketplace_prices_item_currency_period_effective_key
    UNIQUE (marketplace_item_id, currency_type, billing_period, effective_from),
  CONSTRAINT marketplace_prices_currency_type_check
    CHECK (currency_type IN ('gold', 'paid_crystal', 'gifted_crystal', 'farm_bound_crystal', 'twd', 'usd')),
  CONSTRAINT marketplace_prices_amount_check
    CHECK (amount > 0),
  CONSTRAINT marketplace_prices_billing_period_check
    CHECK (billing_period IS NULL OR billing_period IN ('one_time', 'day', 'month', 'year')),
  CONSTRAINT marketplace_prices_status_check
    CHECK (status IN ('active', 'scheduled', 'expired', 'withdrawn')),
  CONSTRAINT marketplace_prices_effective_window_check
    CHECK (effective_until IS NULL OR effective_until > effective_from)
);

COMMENT ON TABLE platform.marketplace_prices IS
'Append-only marketplace price records for marketplace items. This table stores configured amount metadata only.';
COMMENT ON COLUMN platform.marketplace_prices.id IS
'Marketplace Price UUID.';
COMMENT ON COLUMN platform.marketplace_prices.marketplace_item_id IS
'Owning Marketplace Item reference.';
COMMENT ON COLUMN platform.marketplace_prices.currency_type IS
'Marketplace currency type. Allowed values are gold, paid_crystal, gifted_crystal, farm_bound_crystal, twd, and usd.';
COMMENT ON COLUMN platform.marketplace_prices.amount IS
'Positive amount for the configured currency type.';
COMMENT ON COLUMN platform.marketplace_prices.billing_period IS
'Optional billing period. Allowed values are one_time, day, month, year, or NULL.';
COMMENT ON COLUMN platform.marketplace_prices.status IS
'Marketplace price lifecycle status. Allowed values are active, scheduled, expired, and withdrawn.';
COMMENT ON COLUMN platform.marketplace_prices.effective_from IS
'Timestamp when the price starts being effective.';
COMMENT ON COLUMN platform.marketplace_prices.effective_until IS
'Optional timestamp when the price stops being effective.';
COMMENT ON COLUMN platform.marketplace_prices.created_at IS
'Timestamp when this Marketplace Price record was created.';

CREATE INDEX IF NOT EXISTS marketplace_prices_marketplace_item_id_idx
  ON platform.marketplace_prices (marketplace_item_id);

CREATE INDEX IF NOT EXISTS marketplace_prices_currency_type_idx
  ON platform.marketplace_prices (currency_type);

CREATE INDEX IF NOT EXISTS marketplace_prices_status_idx
  ON platform.marketplace_prices (status);

CREATE INDEX IF NOT EXISTS marketplace_prices_effective_from_idx
  ON platform.marketplace_prices (effective_from);

CREATE INDEX IF NOT EXISTS marketplace_prices_item_currency_effective_idx
  ON platform.marketplace_prices (marketplace_item_id, currency_type, effective_from);

CREATE TABLE IF NOT EXISTS platform.marketplace_offers (
  id uuid DEFAULT gen_random_uuid(),
  offer_key text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  starts_at timestamptz,
  ends_at timestamptz,
  eligibility_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT marketplace_offers_pkey PRIMARY KEY (id),
  CONSTRAINT marketplace_offers_offer_key_key UNIQUE (offer_key),
  CONSTRAINT marketplace_offers_offer_key_check
    CHECK (offer_key ~ '^[a-z][a-z0-9_.:-]*$'),
  CONSTRAINT marketplace_offers_display_name_check
    CHECK (btrim(display_name) <> ''),
  CONSTRAINT marketplace_offers_status_check
    CHECK (status IN ('draft', 'scheduled', 'active', 'ended', 'archived')),
  CONSTRAINT marketplace_offers_time_window_check
    CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT marketplace_offers_eligibility_key_check
    CHECK (eligibility_key IS NULL OR eligibility_key ~ '^[a-z][a-z0-9_.:-]*$'),
  CONSTRAINT marketplace_offers_archive_delete_order_check
    CHECK (
      deleted_at IS NULL
      OR archived_at IS NULL
      OR deleted_at >= archived_at
    )
);

COMMENT ON TABLE platform.marketplace_offers IS
'Marketplace offer aggregate root for grouping marketplace items under governed eligibility and time windows.';
COMMENT ON COLUMN platform.marketplace_offers.id IS
'Marketplace Offer UUID.';
COMMENT ON COLUMN platform.marketplace_offers.offer_key IS
'Stable marketplace offer key. This is a secondary identifier and not the primary key.';
COMMENT ON COLUMN platform.marketplace_offers.display_name IS
'Human-readable marketplace offer name.';
COMMENT ON COLUMN platform.marketplace_offers.status IS
'Marketplace offer lifecycle status. Allowed values are draft, scheduled, active, ended, and archived.';
COMMENT ON COLUMN platform.marketplace_offers.starts_at IS
'Optional timestamp when the marketplace offer starts.';
COMMENT ON COLUMN platform.marketplace_offers.ends_at IS
'Optional timestamp when the marketplace offer ends.';
COMMENT ON COLUMN platform.marketplace_offers.eligibility_key IS
'Optional structured eligibility key evaluated by the owning application service.';
COMMENT ON COLUMN platform.marketplace_offers.created_at IS
'Timestamp when the Marketplace Offer record was created.';
COMMENT ON COLUMN platform.marketplace_offers.updated_at IS
'Timestamp when the Marketplace Offer record was last updated.';
COMMENT ON COLUMN platform.marketplace_offers.archived_at IS
'Timestamp when the Marketplace Offer record was archived.';
COMMENT ON COLUMN platform.marketplace_offers.deleted_at IS
'Timestamp when the Marketplace Offer record was soft deleted.';

CREATE INDEX IF NOT EXISTS marketplace_offers_status_idx
  ON platform.marketplace_offers (status);

CREATE INDEX IF NOT EXISTS marketplace_offers_starts_at_idx
  ON platform.marketplace_offers (starts_at);

CREATE INDEX IF NOT EXISTS marketplace_offers_ends_at_idx
  ON platform.marketplace_offers (ends_at);

CREATE TABLE IF NOT EXISTS platform.marketplace_offer_items (
  id uuid DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL,
  marketplace_item_id uuid NOT NULL,
  price_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketplace_offer_items_pkey PRIMARY KEY (id),
  CONSTRAINT marketplace_offer_items_offer_id_fkey
    FOREIGN KEY (offer_id) REFERENCES platform.marketplace_offers(id) ON DELETE CASCADE,
  CONSTRAINT marketplace_offer_items_marketplace_item_id_fkey
    FOREIGN KEY (marketplace_item_id) REFERENCES platform.marketplace_items(id) ON DELETE RESTRICT,
  CONSTRAINT marketplace_offer_items_price_id_fkey
    FOREIGN KEY (price_id) REFERENCES platform.marketplace_prices(id) ON DELETE RESTRICT,
  CONSTRAINT marketplace_offer_items_offer_item_key
    UNIQUE (offer_id, marketplace_item_id)
);

COMMENT ON TABLE platform.marketplace_offer_items IS
'Junction table linking Marketplace Offers to Marketplace Items and optional Marketplace Price references.';
COMMENT ON COLUMN platform.marketplace_offer_items.id IS
'Marketplace Offer Item UUID.';
COMMENT ON COLUMN platform.marketplace_offer_items.offer_id IS
'Owning Marketplace Offer reference.';
COMMENT ON COLUMN platform.marketplace_offer_items.marketplace_item_id IS
'Marketplace Item reference included in the offer.';
COMMENT ON COLUMN platform.marketplace_offer_items.price_id IS
'Optional Marketplace Price reference selected for the offer item.';
COMMENT ON COLUMN platform.marketplace_offer_items.created_at IS
'Timestamp when this Marketplace Offer Item record was created.';

CREATE INDEX IF NOT EXISTS marketplace_offer_items_offer_id_idx
  ON platform.marketplace_offer_items (offer_id);

CREATE INDEX IF NOT EXISTS marketplace_offer_items_marketplace_item_id_idx
  ON platform.marketplace_offer_items (marketplace_item_id);

CREATE INDEX IF NOT EXISTS marketplace_offer_items_price_id_idx
  ON platform.marketplace_offer_items (price_id);

DROP TRIGGER IF EXISTS trg_marketplace_items_set_updated_at ON platform.marketplace_items;
CREATE TRIGGER trg_marketplace_items_set_updated_at
  BEFORE UPDATE ON platform.marketplace_items
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_marketplace_items_set_updated_at ON platform.marketplace_items IS
'Maintains platform.marketplace_items.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_marketplace_offers_set_updated_at ON platform.marketplace_offers;
CREATE TRIGGER trg_marketplace_offers_set_updated_at
  BEFORE UPDATE ON platform.marketplace_offers
  FOR EACH ROW
  EXECUTE FUNCTION system.set_updated_at();

COMMENT ON TRIGGER trg_marketplace_offers_set_updated_at ON platform.marketplace_offers IS
'Maintains platform.marketplace_offers.updated_at using the shared system.set_updated_at() trigger function.';

DROP TRIGGER IF EXISTS trg_marketplace_prices_reject_update ON platform.marketplace_prices;
CREATE TRIGGER trg_marketplace_prices_reject_update
  BEFORE UPDATE ON platform.marketplace_prices
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_marketplace_prices_reject_update ON platform.marketplace_prices IS
'Rejects all UPDATE attempts on append-only Marketplace Price records.';

DROP TRIGGER IF EXISTS trg_marketplace_prices_reject_delete ON platform.marketplace_prices;
CREATE TRIGGER trg_marketplace_prices_reject_delete
  BEFORE DELETE ON platform.marketplace_prices
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_marketplace_prices_reject_delete ON platform.marketplace_prices IS
'Rejects all DELETE attempts on append-only Marketplace Price records.';

ALTER TABLE platform.marketplace_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.marketplace_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.marketplace_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.marketplace_offer_items ENABLE ROW LEVEL SECURITY;

COMMIT;
