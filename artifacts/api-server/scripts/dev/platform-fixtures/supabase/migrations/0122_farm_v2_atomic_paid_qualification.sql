BEGIN;

-- Single-statement MVCC snapshot for Farm V2 qualification.
-- Only the Core service-role adapter may invoke this function.
CREATE OR REPLACE FUNCTION public.farm_v2_effective_paid_crystals(p_core_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_total numeric;
  v_credit_total numeric;
  v_refund_total numeric;
  v_invalid bigint;
BEGIN
  IF p_core_user_id IS NULL THEN
    RAISE EXCEPTION 'PAID_VALUE_OWNER_REQUIRED';
  END IF;

  SELECT
    COALESCE(SUM(
      CASE
        WHEN l.entry_type = 'credit' THEN l.amount::numeric
        WHEN l.entry_type = 'refund' THEN -l.amount::numeric
        ELSE 0::numeric
      END
    ), 0::numeric),
    COALESCE(SUM(l.amount::numeric) FILTER (WHERE l.entry_type = 'credit'), 0::numeric),
    COALESCE(SUM(l.amount::numeric) FILTER (WHERE l.entry_type = 'refund'), 0::numeric),
    COUNT(*) FILTER (
      WHERE l.id IS NOT NULL AND (
        l.entry_type NOT IN ('credit', 'refund', 'debit')
        OR l.entry_type IS NULL
        OR l.amount IS NULL
        OR l.amount <= 0
      )
    )
  INTO v_total, v_credit_total, v_refund_total, v_invalid
  FROM core.wallets AS w
  LEFT JOIN core.wallet_ledgers AS l
    ON l.wallet_id = w.id AND l.currency_type = 'paid_crystal'
  WHERE w.user_id = p_core_user_id;

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'PAID_VALUE_INVALID_LEDGER';
  END IF;

  -- Reject overflowing intermediate totals even if refunds cancel them out.
  IF v_credit_total > 9007199254740991::numeric
     OR v_refund_total > 9007199254740991::numeric
     OR v_total > 9007199254740991::numeric
     OR v_total < -9007199254740991::numeric THEN
    RAISE EXCEPTION 'PAID_VALUE_TOTAL_OVERFLOW';
  END IF;

  RETURN GREATEST(v_total, 0)::bigint;
END;
$fn$;

REVOKE ALL ON FUNCTION public.farm_v2_effective_paid_crystals(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_effective_paid_crystals(uuid)
  TO service_role;

COMMIT;
