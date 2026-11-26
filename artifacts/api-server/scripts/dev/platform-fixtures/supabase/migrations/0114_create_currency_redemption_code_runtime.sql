BEGIN;

CREATE TABLE IF NOT EXISTS platform.redemption_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_digest text NOT NULL UNIQUE,
  display_label text NOT NULL,
  currency text NOT NULL CHECK (currency IN ('coin', 'crystal')),
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','disabled')),
  payload_version text NOT NULL DEFAULT 'REDEMPTION_CODE_V1.0',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  disabled_at timestamptz
);

COMMENT ON COLUMN platform.redemption_codes.created_by IS
'Must equal platform.admin_bootstrap_state.completed_by and is checked by the privileged admin creation service.';

CREATE TABLE IF NOT EXISTS platform.redemption_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id uuid NOT NULL REFERENCES platform.redemption_codes(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  currency text NOT NULL CHECK (currency IN ('coin','crystal')),
  amount integer NOT NULL CHECK (amount > 0),
  wallet_transaction_id uuid REFERENCES public.core_wallet_ledger(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('succeeded','rejected')),
  rejection_reason text,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code_id, owner_id)
);

CREATE INDEX IF NOT EXISTS redemption_code_redemptions_owner_idx
  ON platform.redemption_code_redemptions(owner_id, redeemed_at DESC);

ALTER TABLE platform.redemption_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.redemption_code_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE platform.redemption_codes, platform.redemption_code_redemptions FROM anon, authenticated;

CREATE OR REPLACE FUNCTION platform.redeem_currency_code(
  p_owner_id uuid,
  p_code_digest text,
  p_request_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = platform, public
AS $$
DECLARE
  v_code platform.redemption_codes;
  v_existing platform.redemption_code_redemptions;
  v_wallet jsonb;
  v_status text;
  v_redemption_id uuid;
  v_tx_id uuid;
BEGIN
  IF p_owner_id IS NULL OR NULLIF(btrim(p_code_digest), '') IS NULL OR NULLIF(btrim(p_request_id), '') IS NULL THEN
    RETURN jsonb_build_object('result_status','invalid_request');
  END IF;

  SELECT * INTO v_code
  FROM platform.redemption_codes
  WHERE code_digest = lower(btrim(p_code_digest))
  FOR UPDATE;

  IF NOT FOUND OR v_code.status <> 'active' THEN
    RETURN jsonb_build_object('result_status','invalid_or_inactive_code');
  END IF;

  SELECT * INTO v_existing
  FROM platform.redemption_code_redemptions
  WHERE code_id = v_code.id AND owner_id = p_owner_id;

  IF FOUND THEN
    RETURN jsonb_build_object('result_status','duplicate','redemption_id',v_existing.id,'wallet_transaction_id',v_existing.wallet_transaction_id,'currency',v_existing.currency,'amount',v_existing.amount);
  END IF;

  v_wallet := public.core_wallet_apply_transaction(
    p_owner_id, v_code.amount, v_code.currency, 'credit',
    format('redemption-code:%s:%s', v_code.id, p_owner_id),
    format('兌換碼 %s', v_code.display_label),
    v_code.id::text, 'redemption_code', NULL
  );
  v_status := v_wallet->>'result_status';

  IF v_status NOT IN ('created','duplicate') THEN
    RAISE EXCEPTION 'REDEMPTION_WALLET_FAILED:%', coalesce(v_status,'null');
  END IF;

  v_tx_id := NULLIF(v_wallet->'transaction'->>'id','')::uuid;

  INSERT INTO platform.redemption_code_redemptions(
    code_id, owner_id, currency, amount, wallet_transaction_id, status
  ) VALUES (
    v_code.id, p_owner_id, v_code.currency, v_code.amount, v_tx_id, 'succeeded'
  ) RETURNING id INTO v_redemption_id;

  RETURN jsonb_build_object('result_status','created','redemption_id',v_redemption_id,'wallet_transaction_id',v_tx_id,'currency',v_code.currency,'amount',v_code.amount);
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing FROM platform.redemption_code_redemptions
    WHERE code_id = v_code.id AND owner_id = p_owner_id;
    IF FOUND THEN
      RETURN jsonb_build_object('result_status','duplicate','redemption_id',v_existing.id,'wallet_transaction_id',v_existing.wallet_transaction_id);
    END IF;
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION platform.redeem_currency_code(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION platform.redeem_currency_code(uuid,text,text) TO service_role;

COMMIT;
