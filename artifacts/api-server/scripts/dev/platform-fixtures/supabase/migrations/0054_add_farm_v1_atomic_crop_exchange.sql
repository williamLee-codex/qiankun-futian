BEGIN;

CREATE TABLE IF NOT EXISTS public.farm_v1_exchange_records (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  crop_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  exchange_quantity integer NOT NULL CHECK (exchange_quantity > 0),
  exchange_currency text NOT NULL CHECK (exchange_currency IN ('coin', 'crystal')),
  exchange_value integer NOT NULL CHECK (exchange_value > 0),
  wallet_transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, idempotency_key),
  CONSTRAINT farm_v1_exchange_records_key_check CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT farm_v1_exchange_records_crop_check CHECK (crop_id IN (
    'yao-jin-su', 'yue-hai-tan', 'chi-xue-shen',
    'tian-shu-man', 'tai-wei-lian', 'hun-dun-jing-hua'
  ))
);

ALTER TABLE public.farm_v1_exchange_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.farm_v1_exchange_records FROM anon, authenticated;
GRANT SELECT ON TABLE public.farm_v1_exchange_records TO authenticated;
CREATE POLICY farm_v1_exchange_records_owner_select ON public.farm_v1_exchange_records
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);

CREATE OR REPLACE FUNCTION public.farm_v1_exchange_crop(
  p_owner_id uuid,
  p_crop_id text,
  p_quantity integer,
  p_idempotency_key text,
  p_exchanged_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory public.farm_v1_inventory;
  v_existing public.farm_v1_exchange_records;
  v_existing_operation_type text;
  v_exchange_quantity integer;
  v_exchange_currency text;
  v_exchange_value integer := 1;
  v_wallet_result jsonb;
  v_wallet_status text;
  v_wallet_transaction_id uuid;
  v_inserted boolean := false;
BEGIN
  IF p_owner_id IS NULL OR btrim(COALESCE(p_idempotency_key, '')) = '' OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid farm crop exchange request';
  END IF;

  v_exchange_quantity := CASE p_crop_id
    WHEN 'yao-jin-su' THEN 20
    WHEN 'yue-hai-tan' THEN 8
    WHEN 'chi-xue-shen' THEN 3
    WHEN 'tian-shu-man' THEN 2
    WHEN 'tai-wei-lian' THEN 1
    WHEN 'hun-dun-jing-hua' THEN 1
    ELSE NULL
  END;

  IF v_exchange_quantity IS NULL THEN
    RAISE EXCEPTION 'Unknown farm crop';
  END IF;

  v_exchange_currency := CASE p_crop_id
    WHEN 'hun-dun-jing-hua' THEN 'crystal'
    ELSE 'coin'
  END;

  IF p_quantity % v_exchange_quantity <> 0 THEN
    RAISE EXCEPTION 'Invalid farm crop exchange quantity';
  END IF;

  INSERT INTO public.farm_v1_exchange_records (
    owner_id,
    idempotency_key,
    crop_id,
    quantity,
    exchange_quantity,
    exchange_currency,
    exchange_value,
    created_at
  ) VALUES (
    p_owner_id,
    p_idempotency_key,
    p_crop_id,
    p_quantity,
    v_exchange_quantity,
    v_exchange_currency,
    v_exchange_value,
    p_exchanged_at
  )
  ON CONFLICT (owner_id, idempotency_key) DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT v_inserted THEN
    SELECT * INTO v_existing
    FROM public.farm_v1_exchange_records
    WHERE owner_id = p_owner_id
      AND idempotency_key = p_idempotency_key;

    IF v_existing.crop_id <> p_crop_id
      OR v_existing.quantity <> p_quantity
      OR v_existing.exchange_quantity <> v_exchange_quantity
      OR v_existing.exchange_currency <> v_exchange_currency
      OR v_existing.exchange_value <> v_exchange_value THEN
      RETURN jsonb_build_object('result_status', 'duplicate_conflict');
    END IF;

    RETURN jsonb_build_object(
      'result_status', 'duplicate',
      'crop_id', v_existing.crop_id,
      'quantity', v_existing.quantity,
      'exchange_quantity', v_existing.exchange_quantity,
      'exchange_currency', v_existing.exchange_currency,
      'exchange_value', v_existing.exchange_value,
      'wallet_transaction_id', v_existing.wallet_transaction_id
    );
  END IF;

  INSERT INTO public.farm_v1_operation_records (
    owner_id,
    idempotency_key,
    operation_type,
    recorded_at
  ) VALUES (
    p_owner_id,
    p_idempotency_key,
    'exchange',
    p_exchanged_at
  )
  ON CONFLICT (owner_id, idempotency_key) DO NOTHING;

  SELECT operation_type INTO v_existing_operation_type
  FROM public.farm_v1_operation_records
  WHERE owner_id = p_owner_id
    AND idempotency_key = p_idempotency_key;

  IF v_existing_operation_type <> 'exchange' THEN
    DELETE FROM public.farm_v1_exchange_records
    WHERE owner_id = p_owner_id
      AND idempotency_key = p_idempotency_key;

    RETURN jsonb_build_object('result_status', 'duplicate_conflict');
  END IF;

  SELECT * INTO v_inventory
  FROM public.farm_v1_inventory
  WHERE owner_id = p_owner_id
    AND item_key = p_crop_id
  FOR UPDATE;

  IF NOT FOUND OR v_inventory.quantity < p_quantity THEN
    DELETE FROM public.farm_v1_exchange_records
    WHERE owner_id = p_owner_id
      AND idempotency_key = p_idempotency_key;

    DELETE FROM public.farm_v1_operation_records
    WHERE owner_id = p_owner_id
      AND idempotency_key = p_idempotency_key
      AND operation_type = 'exchange';

    RETURN jsonb_build_object('result_status', 'insufficient_inventory');
  END IF;

  v_wallet_result := public.core_wallet_apply_transaction(
    p_owner_id,
    (p_quantity / v_exchange_quantity) * v_exchange_value,
    v_exchange_currency,
    'credit',
    'farm-exchange:' || p_idempotency_key,
    'farm_exchange',
    p_crop_id,
    'farm_crop',
    NULL
  );

  v_wallet_status := v_wallet_result ->> 'result_status';
  IF v_wallet_status NOT IN ('created', 'duplicate') THEN
    RAISE EXCEPTION 'Farm crop exchange wallet settlement failed: %', COALESCE(v_wallet_status, 'unknown');
  END IF;

  v_wallet_transaction_id := NULLIF(v_wallet_result #>> '{transaction,id}', '')::uuid;

  UPDATE public.farm_v1_inventory
  SET quantity = quantity - p_quantity,
      updated_at = p_exchanged_at
  WHERE owner_id = p_owner_id
    AND item_key = p_crop_id;

  UPDATE public.farm_v1_exchange_records
  SET wallet_transaction_id = v_wallet_transaction_id
  WHERE owner_id = p_owner_id
    AND idempotency_key = p_idempotency_key;

  RETURN jsonb_build_object(
    'result_status', 'created',
    'crop_id', p_crop_id,
    'quantity', p_quantity,
    'exchange_quantity', v_exchange_quantity,
    'exchange_currency', v_exchange_currency,
    'exchange_value', v_exchange_value,
    'wallet_transaction_id', v_wallet_transaction_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.farm_v1_exchange_crop(uuid, text, integer, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_v1_exchange_crop(uuid, text, integer, text, timestamptz) TO service_role;

COMMIT;
