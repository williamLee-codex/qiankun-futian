BEGIN;

CREATE OR REPLACE FUNCTION public.farm_v1_market_purchase(
  p_owner_id uuid,
  p_product_id text,
  p_idempotency_key text,
  p_exclusive_farmer_entitled boolean,
  p_land4_entitled boolean,
  p_land5_entitled boolean,
  p_land6_entitled boolean,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operation_type text;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_inserted boolean;
  v_item_key text;
  v_quantity integer;
  v_pet_id text;
  v_price integer;
  v_currency text;
  v_wallet_result jsonb;
  v_wallet_status text;
BEGIN
  IF p_owner_id IS NULL
    OR btrim(COALESCE(p_product_id, '')) = ''
    OR btrim(COALESCE(p_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'Invalid farm market purchase request';
  END IF;

  PERFORM public.initialize_farm_v1_runtime(p_owner_id, p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(
    p_owner_id,
    COALESCE(p_exclusive_farmer_entitled, false),
    COALESCE(p_land4_entitled, false),
    COALESCE(p_land5_entitled, false),
    COALESCE(p_land6_entitled, false),
    p_now
  );

  SELECT p.operation_type, p.request_fingerprint
    INTO v_operation_type, v_existing_fingerprint
  FROM public.farm_v1_operation_records p
  WHERE p.owner_id = p_owner_id
    AND p.idempotency_key = p_idempotency_key;

  v_fingerprint := encode(
    extensions.digest(convert_to('market_buy:' || p_product_id, 'UTF8'), 'sha256'),
    'hex'
  );

  IF FOUND THEN
    IF v_operation_type = 'market_buy' AND v_existing_fingerprint = v_fingerprint THEN
      RETURN jsonb_build_object('result_status', 'duplicate');
    END IF;
    RETURN jsonb_build_object('result_status', 'duplicate_conflict');
  END IF;

  CASE p_product_id
    WHEN 'yao-jin-seed-pack' THEN v_item_key := 'yao-jin-seed'; v_quantity := 20; v_price := 1; v_currency := 'coin';
    WHEN 'you-ying-seed-pack' THEN v_item_key := 'you-ying-seed'; v_quantity := 10; v_price := 1; v_currency := 'coin';
    WHEN 'zhu-sha-seed-pack' THEN v_item_key := 'zhu-sha-seed'; v_quantity := 6; v_price := 1; v_currency := 'coin';
    WHEN 'yao-zi-seed-pack' THEN v_item_key := 'yao-zi-seed'; v_quantity := 4; v_price := 1; v_currency := 'coin';
    WHEN 'fei-cui-seed-pack' THEN v_item_key := 'fei-cui-seed'; v_quantity := 3; v_price := 1; v_currency := 'coin';
    WHEN 'tai-yi-wu-gu-san' THEN v_item_key := 'tai-yi-wu-gu-san'; v_quantity := 1; v_price := 1; v_currency := 'coin';
    WHEN 'xun-xing-quan' THEN v_pet_id := 'xun-xing-quan'; v_price := 300; v_currency := 'coin';
    WHEN 'bi-xie-suan-ni' THEN v_pet_id := 'bi-xie-suan-ni'; v_price := 100; v_currency := 'crystal';
    ELSE RAISE EXCEPTION 'FARM_MARKET_PRODUCT_NOT_PURCHASABLE';
  END CASE;

  IF v_pet_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.farm_v1_owned_pets
    WHERE owner_id = p_owner_id AND pet_id = v_pet_id
  ) THEN
    RETURN jsonb_build_object('result_status', 'already_owned');
  END IF;

  INSERT INTO public.farm_v1_operation_records(
    owner_id, idempotency_key, operation_type, request_fingerprint, recorded_at
  ) VALUES (
    p_owner_id, p_idempotency_key, 'market_buy', v_fingerprint, p_now
  )
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT COALESCE(v_inserted, false) THEN
    SELECT p.operation_type, p.request_fingerprint
      INTO v_operation_type, v_existing_fingerprint
    FROM public.farm_v1_operation_records p
    WHERE p.owner_id = p_owner_id
      AND p.idempotency_key = p_idempotency_key;

    IF v_operation_type = 'market_buy' AND v_existing_fingerprint = v_fingerprint THEN
      RETURN jsonb_build_object('result_status', 'duplicate');
    END IF;
    RETURN jsonb_build_object('result_status', 'duplicate_conflict');
  END IF;

  v_wallet_result := public.core_wallet_apply_transaction(
    p_owner_id,
    v_price,
    v_currency,
    'debit',
    'farm-market:' || p_idempotency_key,
    'farm_market_purchase',
    p_product_id,
    'farm_market_product',
    NULL
  );
  v_wallet_status := v_wallet_result->>'result_status';

  IF v_wallet_status = 'insufficient_funds' THEN
    DELETE FROM public.farm_v1_operation_records
    WHERE owner_id = p_owner_id AND idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('result_status', 'insufficient_funds');
  END IF;
  IF v_wallet_status NOT IN ('created', 'duplicate') THEN
    RAISE EXCEPTION 'Farm market wallet settlement failed: %', COALESCE(v_wallet_status, 'unknown');
  END IF;

  IF v_item_key IS NOT NULL THEN
    INSERT INTO public.farm_v1_inventory(owner_id, item_key, quantity)
    VALUES (p_owner_id, v_item_key, v_quantity)
    ON CONFLICT(owner_id, item_key) DO UPDATE
      SET quantity = public.farm_v1_inventory.quantity + EXCLUDED.quantity,
          updated_at = p_now;
  ELSE
    INSERT INTO public.farm_v1_owned_pets(owner_id, pet_id, obtained_at)
    VALUES (p_owner_id, v_pet_id, p_now)
    ON CONFLICT(owner_id, pet_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('result_status', 'created');
END;
$$;

CREATE OR REPLACE FUNCTION public.farm_v1_unlock_land(
  p_owner_id uuid,
  p_land_index smallint,
  p_idempotency_key text,
  p_exclusive_farmer_entitled boolean,
  p_land4_entitled boolean,
  p_land5_entitled boolean,
  p_land6_entitled boolean,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_land public.farm_v1_lands;
  v_operation_type text;
  v_existing_fingerprint text;
  v_fingerprint text;
  v_inserted boolean;
  v_price integer;
  v_wallet_result jsonb;
  v_wallet_status text;
BEGIN
  IF p_owner_id IS NULL
    OR p_land_index NOT IN (2, 3)
    OR btrim(COALESCE(p_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'Invalid farm land unlock request';
  END IF;

  PERFORM public.initialize_farm_v1_runtime(p_owner_id, p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(
    p_owner_id,
    COALESCE(p_exclusive_farmer_entitled, false),
    COALESCE(p_land4_entitled, false),
    COALESCE(p_land5_entitled, false),
    COALESCE(p_land6_entitled, false),
    p_now
  );

  v_fingerprint := encode(
    extensions.digest(convert_to('unlock_land:' || p_land_index::text, 'UTF8'), 'sha256'),
    'hex'
  );

  SELECT p.operation_type, p.request_fingerprint
    INTO v_operation_type, v_existing_fingerprint
  FROM public.farm_v1_operation_records p
  WHERE p.owner_id = p_owner_id
    AND p.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_operation_type = 'unlock_land' AND v_existing_fingerprint = v_fingerprint THEN
      RETURN jsonb_build_object('result_status', 'duplicate');
    END IF;
    RETURN jsonb_build_object('result_status', 'duplicate_conflict');
  END IF;

  SELECT * INTO v_land
  FROM public.farm_v1_lands
  WHERE owner_id = p_owner_id
    AND land_index = p_land_index
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FARM_LAND_NOT_FOUND';
  END IF;
  IF v_land.unlocked_at IS NOT NULL THEN
    RETURN jsonb_build_object('result_status', 'already_unlocked');
  END IF;

  v_price := CASE p_land_index WHEN 2 THEN 88 WHEN 3 THEN 888 END;

  INSERT INTO public.farm_v1_operation_records(
    owner_id, idempotency_key, operation_type, request_fingerprint, recorded_at
  ) VALUES (
    p_owner_id, p_idempotency_key, 'unlock_land', v_fingerprint, p_now
  )
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT COALESCE(v_inserted, false) THEN
    SELECT p.operation_type, p.request_fingerprint
      INTO v_operation_type, v_existing_fingerprint
    FROM public.farm_v1_operation_records p
    WHERE p.owner_id = p_owner_id
      AND p.idempotency_key = p_idempotency_key;
    IF v_operation_type = 'unlock_land' AND v_existing_fingerprint = v_fingerprint THEN
      RETURN jsonb_build_object('result_status', 'duplicate');
    END IF;
    RETURN jsonb_build_object('result_status', 'duplicate_conflict');
  END IF;

  v_wallet_result := public.core_wallet_apply_transaction(
    p_owner_id,
    v_price,
    'coin',
    'debit',
    'farm-unlock:' || p_idempotency_key,
    'farm_land_unlock',
    'land:' || p_land_index::text,
    'farm_land',
    NULL
  );
  v_wallet_status := v_wallet_result->>'result_status';

  IF v_wallet_status = 'insufficient_funds' THEN
    DELETE FROM public.farm_v1_operation_records
    WHERE owner_id = p_owner_id AND idempotency_key = p_idempotency_key;
    RETURN jsonb_build_object('result_status', 'insufficient_funds');
  END IF;
  IF v_wallet_status NOT IN ('created', 'duplicate') THEN
    RAISE EXCEPTION 'Farm land unlock wallet settlement failed: %', COALESCE(v_wallet_status, 'unknown');
  END IF;

  UPDATE public.farm_v1_lands
  SET unlocked_at = p_now, updated_at = p_now
  WHERE owner_id = p_owner_id
    AND land_index = p_land_index;

  RETURN jsonb_build_object('result_status', 'created');
END;
$$;

REVOKE ALL ON FUNCTION public.farm_v1_market_purchase(uuid, text, text, boolean, boolean, boolean, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.farm_v1_unlock_land(uuid, smallint, text, boolean, boolean, boolean, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_market_purchase(uuid, text, text, boolean, boolean, boolean, boolean, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_unlock_land(uuid, smallint, text, boolean, boolean, boolean, boolean, timestamptz) TO service_role;

COMMIT;
