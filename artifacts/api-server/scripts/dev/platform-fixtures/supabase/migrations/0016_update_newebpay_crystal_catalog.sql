BEGIN;

ALTER TABLE platform.payment_orders
  DROP CONSTRAINT payment_orders_package_id_check,
  DROP CONSTRAINT payment_orders_crystal_amount_check,
  DROP CONSTRAINT payment_orders_reference_price_usd_check,
  ALTER COLUMN reference_price_usd DROP NOT NULL;

-- These checks apply to newly written rows without revalidating historical
-- orders created under the prior catalog.
ALTER TABLE platform.payment_orders
  ADD CONSTRAINT payment_orders_package_id_check
    CHECK (package_id IN ('crystal_60', 'crystal_180', 'crystal_360')) NOT VALID,
  ADD CONSTRAINT payment_orders_crystal_amount_check
    CHECK (crystal_amount IN (60, 180, 360)) NOT VALID;

COMMENT ON COLUMN platform.payment_orders.reference_price_usd IS
  'Optional verified USD reference only; null when no verified USD reference exists and never used for runtime conversion.';

COMMIT;