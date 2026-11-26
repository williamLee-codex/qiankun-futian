BEGIN;

CREATE TABLE IF NOT EXISTS public.farm_v1_friend_action_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  land_index smallint NOT NULL CHECK (land_index BETWEEN 2 AND 5),
  action_type text NOT NULL CHECK (action_type IN ('assist', 'borrow')),
  crop_id text NOT NULL,
  helper_crop_quantity integer NOT NULL CHECK (helper_crop_quantity > 0),
  owner_crop_quantity integer NOT NULL CHECK (owner_crop_quantity >= 0),
  taiwan_date date NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (helper_id, idempotency_key),
  UNIQUE (owner_id, land_index, taiwan_date)
);

CREATE INDEX IF NOT EXISTS farm_v1_friend_action_events_helper_day_idx
  ON public.farm_v1_friend_action_events(helper_id, taiwan_date);

CREATE INDEX IF NOT EXISTS farm_v1_friend_action_events_helper_owner_idx
  ON public.farm_v1_friend_action_events(helper_id, owner_id, created_at DESC);

ALTER TABLE public.farm_v1_friend_action_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.farm_v1_friend_read_fields(
  p_viewer_id uuid,
  p_owner_id uuid,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $friend_fields$
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
END; $friend_fields$;

CREATE OR REPLACE FUNCTION public.farm_v1_borrow_luck(
  p_helper_id uuid,
  p_owner_id uuid,
  p_idempotency_key text,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $borrow_luck$
DECLARE
  v_today date := timezone('Asia/Taipei', p_now)::date;
  v_land public.farm_v1_lands;
  v_crop record;
  v_helper integer;
  v_owner integer;
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

  v_helper := least(ceil(v_land.planted_quantity * 0.30)::integer, v_land.planted_quantity - 1);
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
END; $borrow_luck$;


CREATE OR REPLACE FUNCTION public.platform_friend_read_context(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $friend_context$
DECLARE v_code jsonb; v_today date := timezone('Asia/Taipei', now())::date;
BEGIN
  v_code := public.platform_friend_profile(p_owner_id);
  RETURN jsonb_build_object(
    'invitationCode', v_code->>'invitationCode',
    'incomingInvites', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', invite.id::text, 'senderId', invite.sender_id::text,
        'senderDisplayName', coalesce(profile.display_name, '道友 ' || right(profile.invitation_code, 4)),
        'recipientId', invite.recipient_id::text, 'message', invite.message,
        'status', invite.status, 'createdAt', invite.created_at, 'resolvedAt', invite.resolved_at
      ) ORDER BY invite.created_at DESC)
      FROM public.platform_friend_invites invite
      JOIN public.platform_friend_profiles profile ON profile.owner_id = invite.sender_id
      WHERE invite.recipient_id = p_owner_id AND invite.status = 'pending'
    ), '[]'::jsonb),
    'friends', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', friends.friend_id::text,
        'displayName', coalesce(profile.display_name, '道友 ' || right(profile.invitation_code, 4)),
        'cooldownUntil', (
          SELECT max(created_at) + interval '24 hours' FROM (
            SELECT created_at FROM public.farm_v1_assist_events
            WHERE helper_id = p_owner_id AND owner_id = friends.friend_id
            UNION ALL
            SELECT created_at FROM public.farm_v1_friend_action_events
            WHERE helper_id = p_owner_id AND owner_id = friends.friend_id
          ) actions
        ),
        'matureLandIndexes', '[]'::jsonb
      ))
      FROM (
        SELECT CASE WHEN user_a_id = p_owner_id THEN user_b_id ELSE user_a_id END AS friend_id
        FROM public.platform_friendships
        WHERE status = 'active' AND p_owner_id IN (user_a_id, user_b_id)
      ) friends
      JOIN public.platform_friend_profiles profile ON profile.owner_id = friends.friend_id
    ), '[]'::jsonb),
    'remainingDailyAssists', greatest(0, 5 - (
      (SELECT count(*) FROM public.farm_v1_assist_events
       WHERE helper_id = p_owner_id AND taiwan_date = v_today)
      + (SELECT count(*) FROM public.farm_v1_friend_action_events
         WHERE helper_id = p_owner_id AND taiwan_date = v_today)
    ))
  );
END; $friend_context$;

CREATE OR REPLACE FUNCTION public.farm_v1_friend_assist_harvest(
  p_helper_id uuid,
  p_owner_id uuid,
  p_land_index smallint,
  p_idempotency_key text,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $friend_assist$
DECLARE
  v_land public.farm_v1_lands;
  v_total integer;
  v_helper integer;
  v_owner integer;
  v_crop record;
  v_today date := timezone('Asia/Taipei', p_now)::date;
BEGIN
  IF p_helper_id IS NULL OR p_owner_id IS NULL OR p_helper_id = p_owner_id
    OR p_land_index NOT BETWEEN 2 AND 5 OR nullif(btrim(p_idempotency_key), '') IS NULL THEN
    RAISE EXCEPTION 'ASSIST_NOT_ALLOWED';
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
      AND user_b_id = greatest(p_helper_id, p_owner_id) AND status = 'active'
  ) THEN RAISE EXCEPTION 'ASSIST_NOT_ALLOWED'; END IF;

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
  PERFORM public.farm_v1_read_runtime(p_helper_id, p_now);

  SELECT * INTO v_land FROM public.farm_v1_lands
  WHERE owner_id = p_owner_id AND land_index = p_land_index FOR UPDATE;

  IF NOT FOUND OR v_land.planted_at IS NULL OR v_land.planted_crop_id IS NULL
    OR v_land.planted_quantity < 1 THEN RAISE EXCEPTION 'ASSIST_NOT_MATURE'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.farm_v1_friend_action_events
    WHERE owner_id = p_owner_id AND land_index = p_land_index AND taiwan_date = v_today
  ) OR EXISTS (
    SELECT 1 FROM public.farm_v1_assist_events
    WHERE owner_id = p_owner_id AND land_index = p_land_index AND taiwan_date = v_today
  ) THEN RAISE EXCEPTION 'FIELD_ACTIONED_TODAY'; END IF;

  SELECT exchange_quantity, exchange_value, exchange_currency, growth INTO v_crop
  FROM (VALUES
    ('yue-hai-tan'::text, 8, 1, 'coin'::text, interval '6 hours'),
    ('chi-xue-shen', 3, 1, 'coin'::text, interval '8 hours'),
    ('tian-shu-man', 2, 1, 'coin'::text, interval '10 hours'),
    ('tai-wei-lian', 1, 1, 'coin'::text, interval '12 hours')
  ) AS crop(crop_id, exchange_quantity, exchange_value, exchange_currency, growth)
  WHERE crop_id = v_land.planted_crop_id;

  IF v_crop.crop_id IS NULL OR p_now < v_land.planted_at + v_crop.growth THEN
    RAISE EXCEPTION 'ASSIST_NOT_MATURE';
  END IF;

  v_total := v_land.planted_quantity;
  v_helper := ceil(v_total * 0.10);
  v_owner := v_total - v_helper;

  UPDATE public.farm_v1_lands
  SET planted_at = NULL, planted_crop_id = NULL, planted_quantity = 0, updated_at = p_now
  WHERE owner_id = p_owner_id AND land_index = p_land_index;

  INSERT INTO public.farm_v1_inventory(owner_id, item_key, quantity)
  VALUES (p_helper_id, v_land.planted_crop_id, v_helper % v_crop.exchange_quantity)
  ON CONFLICT(owner_id, item_key) DO UPDATE
  SET quantity = farm_v1_inventory.quantity + excluded.quantity, updated_at = p_now;

  INSERT INTO public.farm_v1_inventory(owner_id, item_key, quantity)
  VALUES (p_owner_id, v_land.planted_crop_id, v_owner % v_crop.exchange_quantity)
  ON CONFLICT(owner_id, item_key) DO UPDATE
  SET quantity = farm_v1_inventory.quantity + excluded.quantity, updated_at = p_now;

  IF floor(v_helper / v_crop.exchange_quantity) * v_crop.exchange_value > 0 THEN
    PERFORM public.core_wallet_apply_transaction(
      p_helper_id, (floor(v_helper / v_crop.exchange_quantity) * v_crop.exchange_value)::integer,
      v_crop.exchange_currency, 'credit', p_idempotency_key || ':helper', 'farm_friend_assist',
      'assist:' || p_owner_id || ':' || p_land_index, 'farm_assist', NULL
    );
  END IF;

  IF floor(v_owner / v_crop.exchange_quantity) * v_crop.exchange_value > 0 THEN
    PERFORM public.core_wallet_apply_transaction(
      p_owner_id, (floor(v_owner / v_crop.exchange_quantity) * v_crop.exchange_value)::integer,
      v_crop.exchange_currency, 'credit', p_idempotency_key || ':owner', 'farm_friend_assist',
      'assist:' || p_helper_id || ':' || p_land_index, 'farm_assist', NULL
    );
  END IF;

  INSERT INTO public.farm_v1_friend_action_events(
    helper_id, owner_id, land_index, action_type, crop_id,
    helper_crop_quantity, owner_crop_quantity, taiwan_date, idempotency_key, created_at
  ) VALUES (
    p_helper_id, p_owner_id, p_land_index, 'assist', v_land.planted_crop_id,
    v_helper, v_owner, v_today, p_idempotency_key, p_now
  );

  RETURN jsonb_build_object(
    'status', 'created', 'cropId', v_land.planted_crop_id, 'landIndex', p_land_index,
    'helperCropQuantity', v_helper, 'ownerCropQuantity', v_owner,
    'remainingDailyAssists', greatest(0, 4 - (
      (SELECT count(*) FROM public.farm_v1_friend_action_events
       WHERE helper_id = p_helper_id AND taiwan_date = v_today)
      + (SELECT count(*) FROM public.farm_v1_assist_events
         WHERE helper_id = p_helper_id AND taiwan_date = v_today)
    ))
  );
END; $friend_assist$;


REVOKE ALL ON TABLE public.farm_v1_friend_action_events FROM PUBLIC;
REVOKE ALL ON FUNCTION public.farm_v1_friend_read_fields(uuid, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.farm_v1_borrow_luck(uuid, uuid, text, timestamptz), public.farm_v1_friend_assist_harvest(uuid, uuid, smallint, text, timestamptz), public.platform_friend_read_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_v1_friend_read_fields(uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_borrow_luck(uuid, uuid, text, timestamptz), public.farm_v1_friend_assist_harvest(uuid, uuid, smallint, text, timestamptz), public.platform_friend_read_context(uuid) TO service_role;

COMMIT;
