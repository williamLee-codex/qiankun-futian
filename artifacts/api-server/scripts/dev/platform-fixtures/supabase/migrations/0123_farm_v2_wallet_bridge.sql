BEGIN;

-- Farm has no wallet of its own. All effects use the existing Core Wallet
-- atomic transaction mechanism and immutable ledger. Never write paid_crystal
-- qualification credits for earned crop rewards.
CREATE OR REPLACE FUNCTION public.farm_v2_apply_wallet_transaction(
  p_owner_id uuid, p_request_id text, p_amount integer, p_currency text,
  p_direction text, p_reason text, p_reference_id text, p_reference_type text,
  p_original_transaction_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_key text;
  v_original public.core_wallet_ledger;
  v_land integer;
  v_quantity bigint;
  v_unit integer;
  v_reward integer;
  v_result jsonb;
BEGIN
  IF p_owner_id IS NULL OR p_request_id IS NULL
     OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$'
     OR p_amount IS NULL OR p_amount <= 0 OR p_currency IS NULL
     OR p_direction IS NULL OR p_reason IS NULL
     OR p_reference_id IS NULL OR p_reference_type IS NULL THEN
    RETURN jsonb_build_object('result_status','invalid');
  END IF;
  -- Shared owner lock serializes first requests, duplicate probes, reversals,
  -- and primary retries. Core's own row lock still protects all other writers.
  PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-wallet:' || p_owner_id::text, 0));
  v_key := 'farm-v2:' || p_request_id || ':primary';

  IF p_reason = 'farm_wallet_compensation' THEN
    SELECT * INTO v_original FROM public.core_wallet_ledger
      WHERE id=p_original_transaction_id AND owner_id=p_owner_id
        AND idempotency_key=v_key AND reversal_of IS NULL;
    IF NOT FOUND OR v_original.reason NOT IN ('farm_seed_purchase','farm_crop_exchange')
      OR p_reference_type <> 'farm_wallet_compensation' OR p_reference_id <> p_request_id
      OR p_amount <> v_original.amount OR p_currency <> v_original.currency
      OR p_direction <> (CASE v_original.direction WHEN 'debit' THEN 'credit' ELSE 'debit' END) THEN
      RETURN jsonb_build_object('result_status','invalid');
    END IF;
    v_key := 'farm-v2:' || p_request_id || ':compensation';
  ELSE
    IF p_original_transaction_id IS NOT NULL OR p_reference_id !~ '^[1-6]:[1-9][0-9]{0,9}$' THEN
      RETURN jsonb_build_object('result_status','invalid');
    END IF;
    v_land := split_part(p_reference_id, ':', 1)::integer;
    v_quantity := split_part(p_reference_id, ':', 2)::bigint;
    IF v_quantity > 2147483647 THEN RETURN jsonb_build_object('result_status','invalid'); END IF;
    IF p_reason = 'farm_seed_purchase' THEN
      IF p_reference_type <> 'farm_seed_pack' OR p_currency <> 'coin' OR p_direction <> 'debit'
         OR v_land=6 OR p_amount <> v_quantity THEN
        RETURN jsonb_build_object('result_status','invalid');
      END IF;
    ELSIF p_reason = 'farm_crop_exchange' THEN
      v_unit := CASE v_land WHEN 1 THEN 5 WHEN 2 THEN 2 ELSE 1 END;
      v_reward := CASE v_land WHEN 4 THEN 2 WHEN 5 THEN 4 ELSE 1 END;
      IF p_reference_type <> 'farm_crop_exchange' OR p_direction <> 'credit'
        OR p_currency <> (CASE v_land WHEN 6 THEN 'crystal' ELSE 'coin' END)
        OR v_quantity % v_unit <> 0 OR p_amount::bigint <> (v_quantity / v_unit) * v_reward THEN
        RETURN jsonb_build_object('result_status','invalid');
      END IF;
    ELSE RETURN jsonb_build_object('result_status','invalid');
    END IF;
    IF EXISTS (SELECT 1 FROM public.core_wallet_ledger WHERE owner_id=p_owner_id
      AND idempotency_key='farm-v2:' || p_request_id || ':compensation') THEN
      RETURN jsonb_build_object('result_status','compensated');
    END IF;
  END IF;
  -- Check lifecycle under the same row lock used by Core's balance mutation.
  -- A suspension committed while Core waits must not admit a new Farm effect.
  PERFORM 1 FROM public.core_wallets WHERE owner_id=p_owner_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.core_wallets WHERE owner_id=p_owner_id AND status <> 'active') THEN
    RETURN jsonb_build_object('result_status','wallet_not_active');
  END IF;
  v_result := public.core_wallet_apply_transaction(p_owner_id, p_amount, p_currency,
    p_direction, v_key, p_reason, p_reference_id, p_reference_type, p_original_transaction_id);
  -- Core duplicate matching does not promise reversal identity. Farm does.
  IF v_result->>'result_status' IN ('created','duplicate')
     AND v_result->'transaction'->>'reversal_of' IS DISTINCT FROM p_original_transaction_id::text THEN
    RAISE EXCEPTION 'FARM_WALLET_RESULT_CONFLICT';
  END IF;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.farm_v2_apply_wallet_transaction(uuid,text,integer,text,text,text,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_apply_wallet_transaction(uuid,text,integer,text,text,text,text,text,uuid)
  TO service_role;
COMMIT;
