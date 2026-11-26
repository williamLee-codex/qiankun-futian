BEGIN;

CREATE TABLE IF NOT EXISTS public.farm_v1_friend_action_extra_lands (
  event_id uuid NOT NULL REFERENCES public.farm_v1_friend_action_events(id) ON DELETE CASCADE,
  land_index smallint NOT NULL CHECK (land_index BETWEEN 2 AND 5),
  PRIMARY KEY (event_id, land_index)
);

ALTER TABLE public.farm_v1_friend_action_extra_lands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.farm_v1_friend_action_extra_lands FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.farm_v1_borrow_luck(
  p_helper_id uuid,
  p_owner_id uuid,
  p_idempotency_key text,
  p_allow_second_field boolean,
  p_kirin_protection boolean,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $diting$
DECLARE
  v_today date := timezone('Asia/Taipei', p_now)::date;
  v_land record;
  v_crop record;
  v_event_id uuid;
  v_first_land_index smallint;
  v_helper integer;
  v_owner integer;
  v_total_helper integer := 0;
  v_total_owner integer := 0;
  v_field_count integer := 0;
  v_allow_second_field boolean := false;
  v_owner_loss_rate numeric := 0.30;
  v_kirin_protection boolean := false;
BEGIN
  IF p_helper_id IS NULL OR p_owner_id IS NULL OR p_helper_id = p_owner_id
    OR nullif(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'BORROW_NOT_ALLOWED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.farm_v1_friend_action_events
    WHERE helper_id = p_helper_id AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('status', 'duplicate');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.platform_friendships
    WHERE user_a_id = least(p_helper_id, p_owner_id)
      AND user_b_id = greatest(p_helper_id, p_owner_id)
      AND status = 'active'
  ) THEN RAISE EXCEPTION 'BORROW_NOT_ALLOWED'; END IF;

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

  v_allow_second_field := coalesce(p_allow_second_field, false) AND EXISTS (
    SELECT 1
    FROM public.farm_v1_pet_care care
    JOIN public.farm_v1_owned_pets pet
      ON pet.owner_id = care.owner_id AND pet.pet_id = 'shi-shi-di-ting'
    WHERE care.owner_id = p_helper_id
      AND care.resident_pet_id = 'shi-shi-di-ting'
      AND care.fed_at IS NOT NULL
      AND p_now < care.fed_at + interval '12 hours'
  );

  v_kirin_protection := coalesce(p_kirin_protection, false) AND EXISTS (
    SELECT 1
    FROM public.farm_v1_pet_care care
    JOIN public.farm_v1_owned_pets pet
      ON pet.owner_id = care.owner_id AND pet.pet_id = 'qian-kun-qi-lin'
    WHERE care.owner_id = p_owner_id
      AND care.resident_pet_id = 'qian-kun-qi-lin'
      AND care.fed_at IS NOT NULL
      AND p_now < care.fed_at + interval '12 hours'
  );

  IF v_kirin_protection THEN
    v_owner_loss_rate := 0;
  ELSIF EXISTS (
    SELECT 1
    FROM public.farm_v1_pet_care care
    JOIN public.farm_v1_owned_pets pet
      ON pet.owner_id = care.owner_id AND pet.pet_id = 'bi-xie-suan-ni'
    WHERE care.owner_id = p_owner_id
      AND care.resident_pet_id = 'bi-xie-suan-ni'
      AND care.fed_at IS NOT NULL
      AND p_now < care.fed_at + interval '12 hours'
  ) THEN
    v_owner_loss_rate := 0.21;
  END IF;

  FOR v_land IN
    SELECT land.*
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
      AND NOT EXISTS (
        SELECT 1 FROM public.farm_v1_friend_action_events event
        WHERE event.owner_id = p_owner_id
          AND event.land_index = land.land_index
          AND event.taiwan_date = v_today
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.farm_v1_friend_action_extra_lands extra
        JOIN public.farm_v1_friend_action_events event ON event.id = extra.event_id
        WHERE event.owner_id = p_owner_id
          AND extra.land_index = land.land_index
          AND event.taiwan_date = v_today
      )
    ORDER BY land.planted_quantity DESC, land.land_index ASC
    LIMIT CASE WHEN v_allow_second_field THEN 2 ELSE 1 END
    FOR UPDATE
  LOOP
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
        v_crop.exchange_currency, 'credit',
        p_idempotency_key || ':borrow:' || v_land.land_index,
        'farm_friend_borrow',
        'borrow:' || p_owner_id || ':' || v_land.land_index, 'farm_borrow', NULL
      );
    END IF;

    IF v_first_land_index IS NULL THEN
      v_first_land_index := v_land.land_index;
      INSERT INTO public.farm_v1_friend_action_events(
        helper_id, owner_id, land_index, action_type, crop_id,
        helper_crop_quantity, owner_crop_quantity, taiwan_date, idempotency_key, created_at
      ) VALUES (
        p_helper_id, p_owner_id, v_land.land_index, 'borrow', v_land.planted_crop_id,
        v_helper, v_owner, v_today, p_idempotency_key, p_now
      ) RETURNING id INTO v_event_id;
    ELSE
      INSERT INTO public.farm_v1_friend_action_extra_lands(event_id, land_index)
      VALUES (v_event_id, v_land.land_index);
    END IF;

    v_field_count := v_field_count + 1;
    v_total_helper := v_total_helper + v_helper;
    v_total_owner := v_total_owner + v_owner;
  END LOOP;

  IF v_first_land_index IS NULL THEN RAISE EXCEPTION 'BORROW_NOT_AVAILABLE'; END IF;

  RETURN jsonb_build_object(
    'status', 'created',
    'landIndex', v_first_land_index,
    'helperCropQuantity', v_total_helper,
    'ownerCropQuantity', v_total_owner,
    'secondFieldApplied', v_field_count = 2
  );
END;
$diting$;


CREATE OR REPLACE FUNCTION public.farm_v1_prevent_extra_land_action()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $extra_lock$
BEGIN
  IF NEW.action_type IN ('assist', 'borrow') AND EXISTS (
    SELECT 1
    FROM public.farm_v1_friend_action_extra_lands extra
    JOIN public.farm_v1_friend_action_events event ON event.id = extra.event_id
    WHERE event.owner_id = NEW.owner_id
      AND event.taiwan_date = NEW.taiwan_date
      AND extra.land_index = NEW.land_index
  ) THEN
    RAISE EXCEPTION 'FIELD_ACTIONED_TODAY';
  END IF;

  RETURN NEW;
END;
$extra_lock$;

DROP TRIGGER IF EXISTS farm_v1_prevent_extra_land_action_trigger
  ON public.farm_v1_friend_action_events;

CREATE TRIGGER farm_v1_prevent_extra_land_action_trigger
BEFORE INSERT OR UPDATE ON public.farm_v1_friend_action_events
FOR EACH ROW EXECUTE FUNCTION public.farm_v1_prevent_extra_land_action();



CREATE OR REPLACE FUNCTION public.farm_v1_friend_read_fields(
  p_viewer_id uuid,
  p_owner_id uuid,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $diting_fields$
BEGIN
  IF p_viewer_id IS NULL OR p_owner_id IS NULL OR p_viewer_id = p_owner_id THEN
    RAISE EXCEPTION 'FRIEND_FIELDS_NOT_ALLOWED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.platform_friendships
    WHERE user_a_id = least(p_viewer_id, p_owner_id)
      AND user_b_id = greatest(p_viewer_id, p_owner_id)
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'FRIEND_FIELDS_NOT_ALLOWED';
  END IF;

  PERFORM public.farm_v1_read_runtime(p_owner_id, p_now);

  RETURN jsonb_build_object(
    'ownerId', p_owner_id::text,
    'lands', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'landIndex', land.land_index,
        'unlocked', land.unlocked_at IS NOT NULL,
        'cropId', land.planted_crop_id,
        'cropQuantity', land.planted_quantity,
        'isMature', CASE land.planted_crop_id
          WHEN 'yao-jin-su' THEN p_now >= land.planted_at + interval '4 hours'
          WHEN 'yue-hai-tan' THEN p_now >= land.planted_at + interval '6 hours'
          WHEN 'chi-xue-shen' THEN p_now >= land.planted_at + interval '8 hours'
          WHEN 'tian-shu-man' THEN p_now >= land.planted_at + interval '10 hours'
          WHEN 'tai-wei-lian' THEN p_now >= land.planted_at + interval '12 hours'
          WHEN 'hun-dun-jing-hua' THEN p_now >= land.planted_at + interval '24 hours'
          ELSE false
        END,
        'actionLockedToday', EXISTS (
          SELECT 1 FROM public.farm_v1_friend_action_events event
          WHERE event.owner_id = p_owner_id
            AND event.land_index = land.land_index
            AND event.taiwan_date = timezone('Asia/Taipei', p_now)::date
        ) OR EXISTS (
          SELECT 1 FROM public.farm_v1_friend_action_extra_lands extra
          JOIN public.farm_v1_friend_action_events event ON event.id = extra.event_id
          WHERE event.owner_id = p_owner_id
            AND extra.land_index = land.land_index
            AND event.taiwan_date = timezone('Asia/Taipei', p_now)::date
        ) OR EXISTS (
          SELECT 1 FROM public.farm_v1_assist_events event
          WHERE event.owner_id = p_owner_id
            AND event.land_index = land.land_index
            AND event.taiwan_date = timezone('Asia/Taipei', p_now)::date
        )
      ) ORDER BY land.land_index)
      FROM public.farm_v1_lands land
      WHERE land.owner_id = p_owner_id
    ), '[]'::jsonb)
  );
END;
$diting_fields$;


REVOKE ALL ON FUNCTION public.farm_v1_borrow_luck(uuid, uuid, text, boolean, boolean, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_v1_borrow_luck(uuid, uuid, text, boolean, boolean, timestamptz) TO service_role;

COMMIT;
