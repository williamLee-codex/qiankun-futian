BEGIN;
-- Align NewebPay persisted order constraints with the approved live catalog.
-- No changes to existing rows, balances or callback records.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM platform.payment_orders
    WHERE (package_id,crystal_amount,charge_amount_twd,reference_price_usd)
      NOT IN (('crystal_60',60,390,'9.99'),('crystal_180',180,990,'24.99'),('crystal_360',360,1790,'49.99'))
  ) THEN
    RAISE EXCEPTION 'Legacy NewebPay orders exist; preserve them and migrate constraints with explicit legacy compatibility';
  END IF;
END $$;

ALTER TABLE platform.payment_orders
  DROP CONSTRAINT IF EXISTS payment_orders_package_id_check,
  DROP CONSTRAINT IF EXISTS payment_orders_crystal_amount_check,
  DROP CONSTRAINT IF EXISTS payment_orders_reference_price_usd_check;

ALTER TABLE platform.payment_orders
  ADD CONSTRAINT payment_orders_package_id_check CHECK (package_id IN ('crystal_60','crystal_180','crystal_360')),
  ADD CONSTRAINT payment_orders_crystal_amount_check CHECK (crystal_amount IN (60,180,360)),
  ADD CONSTRAINT payment_orders_reference_price_usd_check CHECK (reference_price_usd IN ('9.99','24.99','49.99')),
  ADD CONSTRAINT payment_orders_catalog_match_check CHECK (
    (package_id='crystal_60' AND crystal_amount=60 AND charge_amount_twd=390 AND reference_price_usd='9.99')
    OR (package_id='crystal_180' AND crystal_amount=180 AND charge_amount_twd=990 AND reference_price_usd='24.99')
    OR (package_id='crystal_360' AND crystal_amount=360 AND charge_amount_twd=1790 AND reference_price_usd='49.99')
  );
COMMIT;
