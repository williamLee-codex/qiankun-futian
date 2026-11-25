BEGIN;

-- NewebPay runtime tables are server-authoritative. Browser roles receive no
-- direct write access; only the trusted service role may persist payment state.
GRANT SELECT, INSERT, UPDATE
  ON TABLE platform.payment_orders
  TO service_role;

GRANT SELECT, INSERT
  ON TABLE platform.payment_callbacks
  TO service_role;

COMMIT;
