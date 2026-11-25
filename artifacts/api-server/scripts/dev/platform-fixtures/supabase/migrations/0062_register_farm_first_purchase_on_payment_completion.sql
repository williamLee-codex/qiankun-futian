-- Enrol only NEW verified and wallet-credited NewebPay completions.
-- Existing historical orders are deliberately not backfilled.
BEGIN;

CREATE OR REPLACE FUNCTION platform.register_farm_first_purchase_on_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, platform AS $$
DECLARE
  v_plan text;
  v_base integer;
BEGIN
  IF NEW.status <> 'COMPLETED' OR OLD.status = 'COMPLETED'
     OR NEW.callback_verification_status <> 'verified'
     OR NEW.wallet_credited_at IS NULL OR NEW.paid_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT CASE NEW.package_id
    WHEN 'crystal_60' THEN 'A'
    WHEN 'crystal_180' THEN 'B'
    WHEN 'crystal_360' THEN 'C'
    ELSE NULL END INTO v_plan;
  SELECT CASE v_plan WHEN 'A' THEN 60 WHEN 'B' THEN 180 WHEN 'C' THEN 360 END INTO v_base;
  IF v_plan IS NULL OR NEW.crystal_amount <> v_base
    OR (v_plan='A' AND NEW.charge_amount_twd<>390)
    OR (v_plan='B' AND NEW.charge_amount_twd<>990)
    OR (v_plan='C' AND NEW.charge_amount_twd<>1790) THEN
    RETURN NEW;
  END IF;

  INSERT INTO platform.farm_first_purchase_entitlements
    (user_id,plan_id,payment_order_id,purchased_crystals,bonus_crystals_total,paid_at)
  VALUES (NEW.user_id,v_plan,NEW.order_id,v_base,v_base,NEW.paid_at)
  ON CONFLICT (user_id,plan_id) DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_farm_first_purchase_on_payment_completion ON platform.payment_orders;
CREATE TRIGGER trg_farm_first_purchase_on_payment_completion
AFTER UPDATE OF status ON platform.payment_orders
FOR EACH ROW EXECUTE FUNCTION platform.register_farm_first_purchase_on_completion();

COMMENT ON FUNCTION platform.register_farm_first_purchase_on_completion() IS
'Enrol one first-purchase entitlement per plan only after a verified, credited NewebPay order completes. Does not issue bonus gifts or retroactively enrol old orders.';
COMMIT;
