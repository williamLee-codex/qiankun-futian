BEGIN;

CREATE TABLE IF NOT EXISTS platform.payment_orders (
  order_id text NOT NULL,
  merchant_order_no text NOT NULL,
  user_id text NOT NULL,
  package_id text NOT NULL,
  display_label text NOT NULL,
  crystal_amount integer NOT NULL,
  charge_amount_twd integer NOT NULL,
  reference_price_usd text NOT NULL,
  currency text NOT NULL DEFAULT 'TWD',
  status text NOT NULL,
  provider text NOT NULL DEFAULT 'newebpay',
  provider_transaction_id text,
  callback_verification_status text NOT NULL DEFAULT 'pending',
  idempotency_key text NOT NULL,
  request_id text NOT NULL,
  correlation_id text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  paid_at timestamptz,
  wallet_credited_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT payment_orders_pkey PRIMARY KEY (order_id),
  CONSTRAINT payment_orders_merchant_order_no_key UNIQUE (merchant_order_no),
  CONSTRAINT payment_orders_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT payment_orders_user_id_check CHECK (btrim(user_id) <> ''),
  CONSTRAINT payment_orders_package_id_check CHECK (package_id IN ('crystal_50', 'crystal_160', 'crystal_400')),
  CONSTRAINT payment_orders_display_label_check CHECK (btrim(display_label) <> ''),
  CONSTRAINT payment_orders_crystal_amount_check CHECK (crystal_amount IN (50, 160, 400)),
  CONSTRAINT payment_orders_charge_amount_twd_check CHECK (charge_amount_twd > 0),
  CONSTRAINT payment_orders_reference_price_usd_check CHECK (reference_price_usd IN ('9.99', '24.99', '49.99')),
  CONSTRAINT payment_orders_currency_check CHECK (currency = 'TWD'),
  CONSTRAINT payment_orders_provider_check CHECK (provider = 'newebpay'),
  CONSTRAINT payment_orders_status_check CHECK (status IN (
    'CREATED',
    'PENDING',
    'PAID',
    'WALLET_CREDITED',
    'COMPLETED',
    'FAILED',
    'CANCELLED',
    'EXPIRED',
    'VERIFICATION_FAILED'
  )),
  CONSTRAINT payment_orders_callback_verification_status_check
    CHECK (callback_verification_status IN ('pending', 'verified', 'failed')),
  CONSTRAINT payment_orders_request_id_check CHECK (btrim(request_id) <> ''),
  CONSTRAINT payment_orders_correlation_id_check CHECK (btrim(correlation_id) <> ''),
  CONSTRAINT payment_orders_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE platform.payment_orders IS
'Server-authoritative NewebPay Crystal purchase orders. Client amount and quantity are never trusted.';
COMMENT ON COLUMN platform.payment_orders.charge_amount_twd IS
'Fixed server-authoritative TWD amount approved for the package at order creation time.';
COMMENT ON COLUMN platform.payment_orders.reference_price_usd IS
'Approved reference USD amount only; never used for runtime conversion.';

CREATE INDEX IF NOT EXISTS payment_orders_user_id_idx
  ON platform.payment_orders (user_id);

CREATE INDEX IF NOT EXISTS payment_orders_status_idx
  ON platform.payment_orders (status);

CREATE INDEX IF NOT EXISTS payment_orders_created_at_idx
  ON platform.payment_orders (created_at);

CREATE INDEX IF NOT EXISTS payment_orders_provider_transaction_id_idx
  ON platform.payment_orders (provider_transaction_id);

CREATE INDEX IF NOT EXISTS payment_orders_correlation_id_idx
  ON platform.payment_orders (correlation_id);

CREATE TABLE IF NOT EXISTS platform.payment_callbacks (
  callback_id text NOT NULL,
  merchant_order_no text,
  merchant_id text,
  version text,
  verification_status text NOT NULL,
  payload jsonb,
  redacted_payload jsonb,
  trade_info text NOT NULL,
  trade_sha text NOT NULL,
  received_at timestamptz NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT payment_callbacks_pkey PRIMARY KEY (callback_id),
  CONSTRAINT payment_callbacks_verification_status_check CHECK (verification_status IN ('verified', 'failed')),
  CONSTRAINT payment_callbacks_trade_info_check CHECK (btrim(trade_info) <> ''),
  CONSTRAINT payment_callbacks_trade_sha_check CHECK (btrim(trade_sha) <> ''),
  CONSTRAINT payment_callbacks_payload_check CHECK (payload IS NULL OR jsonb_typeof(payload) = 'object'),
  CONSTRAINT payment_callbacks_redacted_payload_check CHECK (redacted_payload IS NULL OR jsonb_typeof(redacted_payload) = 'object'),
  CONSTRAINT payment_callbacks_metadata_check CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE platform.payment_callbacks IS
'Append-only NewebPay callback receipt store for audit and replay defense.';
COMMENT ON COLUMN platform.payment_callbacks.redacted_payload IS
'Sanitized representation safe for operational audit review; raw TradeInfo remains server-only.';

CREATE INDEX IF NOT EXISTS payment_callbacks_merchant_order_no_idx
  ON platform.payment_callbacks (merchant_order_no);

CREATE INDEX IF NOT EXISTS payment_callbacks_received_at_idx
  ON platform.payment_callbacks (received_at);

CREATE INDEX IF NOT EXISTS payment_callbacks_verification_status_idx
  ON platform.payment_callbacks (verification_status);

ALTER TABLE platform.payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.payment_callbacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_orders_service_role_all ON platform.payment_orders;
CREATE POLICY payment_orders_service_role_all
  ON platform.payment_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS payment_callbacks_service_role_all ON platform.payment_callbacks;
CREATE POLICY payment_callbacks_service_role_all
  ON platform.payment_callbacks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_payment_callbacks_reject_update ON platform.payment_callbacks;
CREATE TRIGGER trg_payment_callbacks_reject_update
  BEFORE UPDATE ON platform.payment_callbacks
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

DROP TRIGGER IF EXISTS trg_payment_callbacks_reject_delete ON platform.payment_callbacks;
CREATE TRIGGER trg_payment_callbacks_reject_delete
  BEFORE DELETE ON platform.payment_callbacks
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMIT;
