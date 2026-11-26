BEGIN;

-- A fed resident 辟邪狻猊 protects its owner when another player borrows luck.
CREATE OR REPLACE FUNCTION public.farm_v1_borrow_luck(
  p_helper_id uuid,
  p_owner_id uuid,
  p_idempotency_key text,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $borrow_lion$
DECLARE
  v_today date := timezone('Asia/Taipei', p_now)::date;
  v_land public.farm_v1_lands;
  v_crop record;
  v_helper integer;
  v_owner integer;
  v_owner_loss_rate numeric := 0.30;
BEGIN
  IF p_helper_id IS NULL OR p_owner_id IS NULL OR p_helper_id = p_owner_id
    OR nullif(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'BORROW_NOT_ALLOWED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.platform_friendships
    WHERE user_a_id = least(p_helper_id, p_owner_id)
      AND user_b_id = greatest(p_helper_id, p_owner_id)
      AND status = 'active'
  ) THEN RAISE EXCEPTION 'BORROW_NOT_ALLOWED'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.farm_v1_friend_action_events
    WHERE helper_id = p_helper_id AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  IF (
    (SELECT count(*) FROM public.farm_v1_friend_action_events
      WHERE helper_id = p_helper_id AND taiwan_date = v_today)
    + (SELECT count(*) FROM public.farm_v1_assist_events
      WHERE helper_id = p_helper_id AND taiwan_date = v_today)
  ) >= 5 THEN RAISE EXCEPTION 'ACTION_DAILY_LIMIT'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.farm_v1_friend_action_events
    WHERE helper_id = p_helper_id AND owner_id = p_owner_id
      AND created_at > p_now - interval '24 hours'
  ) OR EXISTS (
    SELECT 1 FROM public.farm_v1_assist_events
    WHERE helper_id = p_helper_id AND owner_id = p_owner_id
      AND created_at > p_now - interval '24 hours'
  ) THEN RAISE EXCEPTION 'ACTION_FRIEND_COOLDOWN'; END IF;

  PERFORM public.farm_v1_read_runtime(p_owner_id, p_now);

  IF EXISTS (
    SELECT 1
    FROM public.farm_v1_pet_care care
    JOIN public.farm_v1_owned_pets pet
      ON pet.owner_id = care.owner_id
     AND pet.pet_id = 'bi-xie-suan-ni'
    WHERE care.owner_id = p_owner_id
      AND care.resident_pet_id = 'bi-xie-suan-ni'
      AND care.fed_at IS NOT NULL
      AND p_now < care.fed_at + interval '12 hours'
  ) THEN
    v_owner_loss_rate := 0.21;
  END IF;

  SELECT * INTO v_land
  FROM public.farm_v1_lands land
  WHERE land.owner_id = p_owner_id
    AND land.land_index BETWEEN 2 AND 5
    AND land.planted_quantity > 1
    AND (
      (land.planted_crop_id = 'yue-hai-tan' AND p_now >= land.planted_at + interval '6 hours') OR
      (land.planted_crop_id = 'chi-xue-shen' AND p_now >= land.planted_at + interval '8 hours') OR
      (land.planted_crop_id = 'tian-shu-man' AND p_now >= land.planted_at + interval '10 hours') OR
      (land.planted_crop_id = 'tai-wei-lian' AND p_now >= land.planted_at + interval '12 hours')
    )
  ORDER BY land.planted_quantity DESC, land.land_index ASC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'BORROW_NOT_AVAILABLE'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.farm_v1_friend_action_events
    WHERE owner_id = p_owner_id AND land_index = v_land.land_index AND taiwan_date = v_today
  ) THEN RAISE EXCEPTION 'FIELD_ACTIONED_TODAY'; END IF;

  SELECT exchange_quantity, exchange_value, exchange_currency INTO v_crop
  FROM (VALUES
    ('yue-hai-tan'::text,8,1,'coin'::text),
    ('chi-xue-shen',3,1,'coin'::text),
    ('tian-shu-man',2,1,'coin'::text),
    ('tai-wei-lian',1,1,'coin'::text)
  ) AS crop(crop_id, exchange_quantity, exchange_value, exchange_currency)
  WHERE crop_id = v_land.planted_crop_id;

  v_helper := least(ceil(v_land.planted_quantity * v_owner_loss_rate)::integer, v_land.planted_quantity - 1);
  v_owner := v_land.planted_quantity - v_helper;

  UPDATE public.farm_v1_lands
  SET planted_quantity = v_owner, updated_at = p_now
  WHERE owner_id = p_owner_id AND land_index = v_land.land_index;

  INSERT INTO public.farm_v1_inventory(owner_id, item_key, quantity)
  VALUES (p_helper_id, v_land.planted_crop_id, v_helper % v_crop.exchange_quantity)
  ON CONFLICT(owner_id, item_key) DO UPDATE
  SET quantity = farm_v1_inventory.quantity + excluded.quantity, updated_at = p_now;

  IF floor(v_helper / v_crop.exchange_quantity) * v_crop.exchange_value > 0 THEN
    PERFORM public.core_wallet_apply_transaction(
      p_helper_id,
      (floor(v_helper / v_crop.exchange_quantity) * v_crop.exchange_value)::integer,
      v_crop.exchange_currency,
      'credit',
      p_idempotency_key || ':borrow',
      'farm_friend_borrow',
      'borrow:' || p_owner_id || ':' || v_land.land_index,
      'farm_borrow',
      NULL
    );
  END IF;

  INSERT INTO public.farm_v1_friend_action_events(
    helper_id, owner_id, land_index, action_type, crop_id,
    helper_crop_quantity, owner_crop_quantity, taiwan_date, idempotency_key, created_at
  ) VALUES (
    p_helper_id, p_owner_id, v_land.land_index, 'borrow', v_land.planted_crop_id,
    v_helper, v_owner, v_today, p_idempotency_key, p_now
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'landIndex', v_land.land_index,
    'helperCropQuantity', v_helper,
    'ownerCropQuantity', v_owner
  );
END; $borrow_lion$;

REVOKE ALL ON FUNCTION public.farm_v1_borrow_luck(uuid, uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_v1_borrow_luck(uuid, uuid, text, timestamptz) TO service_role;

COMMIT;
