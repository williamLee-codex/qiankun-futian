BEGIN;

-- Production reconciliation after verified 0084-0093 rollout.
-- This preserves the canonical 0094-0109 order and bodies in one atomic transaction.

-- BEGIN reconciled source: 0094_persist_farm_exclusive_farmer_preferences.sql
CREATE TABLE IF NOT EXISTS public.farm_v1_farmer_preferences (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  land_index smallint NOT NULL CHECK (land_index BETWEEN 1 AND 6),
  auto_cultivate boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, land_index)
);

ALTER TABLE public.farm_v1_farmer_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.farm_v1_farmer_preferences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.farm_v1_initialize_farmer_preferences(
  p_owner_id uuid,
  p_now timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF p_owner_id IS NULL THEN RAISE EXCEPTION 'FARM_FARMER_OWNER_REQUIRED'; END IF;

  INSERT INTO public.farm_v1_farmer_preferences(owner_id,land_index,auto_cultivate,updated_at)
  SELECT p_owner_id,land_index,true,p_now
  FROM generate_series(1,6) AS land_index
  ON CONFLICT(owner_id,land_index) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.farm_v1_read_farmer_preferences(
  p_owner_id uuid
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(land_index::text,auto_cultivate ORDER BY land_index),
    '{}'::jsonb
  )
  FROM public.farm_v1_farmer_preferences
  WHERE owner_id=p_owner_id;
$$;

CREATE OR REPLACE FUNCTION public.farm_v1_set_farmer_preference(
  p_owner_id uuid,
  p_land_index smallint,
  p_auto_cultivate boolean,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF p_owner_id IS NULL OR p_land_index NOT BETWEEN 1 AND 6 OR p_auto_cultivate IS NULL
  THEN RAISE EXCEPTION 'FARM_FARMER_PREFERENCE_INVALID'; END IF;

  -- Entitlement verification is intentionally kept outside this persistence primitive.
  -- The server operation that exposes this RPC must verify the effective paid milestone >= 999.
  PERFORM public.farm_v1_initialize_farmer_preferences(p_owner_id,p_now);

  UPDATE public.farm_v1_farmer_preferences
  SET auto_cultivate=p_auto_cultivate,updated_at=p_now
  WHERE owner_id=p_owner_id AND land_index=p_land_index;

  RETURN public.farm_v1_read_farmer_preferences(p_owner_id);
END;
$$;

REVOKE ALL ON FUNCTION public.farm_v1_initialize_farmer_preferences(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.farm_v1_read_farmer_preferences(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.farm_v1_set_farmer_preference(uuid,smallint,boolean,timestamptz) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.farm_v1_initialize_farmer_preferences(uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_read_farmer_preferences(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_set_farmer_preference(uuid,smallint,boolean,timestamptz) TO service_role;
-- END reconciled source: 0094_persist_farm_exclusive_farmer_preferences.sql

-- BEGIN reconciled source: 0095_atomic_farm_exclusive_farmer_settlement.sql
CREATE OR REPLACE FUNCTION public.farm_v1_settle_exclusive_farmer(
  p_owner_id uuid,
  p_exclusive_farmer_entitled boolean,
  p_land4_entitled boolean,
  p_land5_entitled boolean,
  p_land6_entitled boolean,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $farmer$
DECLARE
  v_land public.farm_v1_lands;
  v_growth interval;
  v_seed_key text;
  v_capacity integer;
  v_seed_quantity integer;
  v_harvest_quantity integer;
  v_maturity timestamptz;
  v_blessing boolean;
  v_auto boolean;
BEGIN
  IF p_owner_id IS NULL OR p_exclusive_farmer_entitled IS NULL
    OR p_land4_entitled IS NULL OR p_land5_entitled IS NULL OR p_land6_entitled IS NULL
  THEN RAISE EXCEPTION 'FARM_FARMER_SETTLEMENT_INVALID'; END IF;

  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);
  PERFORM public.farm_v1_initialize_farmer_preferences(p_owner_id,p_now);

  -- One owner profile lock serializes page-entry and friend-triggered settlements.
  PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;

  IF NOT p_exclusive_farmer_entitled THEN
    RETURN public.farm_v1_read_runtime(p_owner_id,p_now);
  END IF;

  FOR v_land IN
    SELECT * FROM public.farm_v1_lands
    WHERE owner_id=p_owner_id
    ORDER BY land_index
    FOR UPDATE
  LOOP
    SELECT auto_cultivate INTO v_auto
    FROM public.farm_v1_farmer_preferences
    WHERE owner_id=p_owner_id AND land_index=v_land.land_index;

    IF NOT coalesce(v_auto,true) OR v_land.unlocked_at IS NULL THEN CONTINUE; END IF;
    IF v_land.land_index=4 AND NOT p_land4_entitled THEN CONTINUE; END IF;
    IF v_land.land_index=5 AND NOT p_land5_entitled THEN CONTINUE; END IF;
    IF v_land.land_index=6 AND NOT p_land6_entitled THEN CONTINUE; END IF;

    v_capacity:=CASE v_land.land_index WHEN 1 THEN 20 WHEN 2 THEN 10 WHEN 3 THEN 6 WHEN 4 THEN 4 WHEN 5 THEN 3 WHEN 6 THEN 1 END;
    v_growth:=CASE v_land.land_index
      WHEN 1 THEN interval '4 hours' WHEN 2 THEN interval '6 hours'
      WHEN 3 THEN interval '8 hours' WHEN 4 THEN interval '10 hours'
      WHEN 5 THEN interval '12 hours' WHEN 6 THEN interval '60 hours' END;
    v_seed_key:=CASE v_land.land_index
      WHEN 1 THEN 'yao-jin-seed' WHEN 2 THEN 'you-ying-seed' WHEN 3 THEN 'zhu-sha-seed'
      WHEN 4 THEN 'yao-zi-seed' WHEN 5 THEN 'fei-cui-seed' WHEN 6 THEN 'hun-dun-seed' END;

    IF v_land.planted_at IS NULL THEN
      SELECT quantity INTO v_seed_quantity FROM public.farm_v1_inventory
      WHERE owner_id=p_owner_id AND item_key=v_seed_key FOR UPDATE;
      IF coalesce(v_seed_quantity,0)<v_capacity THEN CONTINUE; END IF;
      UPDATE public.farm_v1_inventory SET quantity=quantity-v_capacity,updated_at=p_now
      WHERE owner_id=p_owner_id AND item_key=v_seed_key;
      UPDATE public.farm_v1_lands SET planted_at=p_now,
        planted_crop_id=CASE v_land.land_index
          WHEN 1 THEN 'yao-jin-su' WHEN 2 THEN 'yue-hai-tan' WHEN 3 THEN 'chi-xue-shen'
          WHEN 4 THEN 'tian-shu-man' WHEN 5 THEN 'tai-wei-lian' WHEN 6 THEN 'hun-dun-jing-hua' END,
        planted_quantity=v_capacity,updated_at=p_now
      WHERE owner_id=p_owner_id AND land_index=v_land.land_index;
      CONTINUE;
    END IF;

    -- A field mutated by borrowing may hold less than a full batch. The farmer
    -- harvests that remaining crop once, then every automatic replant returns
    -- to the canonical full-batch capacity.
    v_maturity:=v_land.planted_at+v_growth;
    WHILE v_maturity<=p_now LOOP
      v_blessing:=false;
      IF v_land.land_index BETWEEN 1 AND 5 THEN
        SELECT v_maturity>=first_farm_entered_at AND v_maturity<first_farm_entered_at+interval '7 days'
        INTO v_blessing FROM public.farm_v1_profiles WHERE owner_id=p_owner_id;
      END IF;
      -- The exclusive farmer harvests at the scheduled maturity timestamp.
      -- Mature crops do not decay naturally; the separate one-hour rule only
      -- controls when lands 2-5 become eligible for friend borrowing.
      v_harvest_quantity:=v_land.planted_quantity*CASE WHEN v_blessing THEN 6 ELSE 1 END;
      INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity)
      VALUES(p_owner_id,v_land.planted_crop_id,v_harvest_quantity)
      ON CONFLICT(owner_id,item_key) DO UPDATE
      SET quantity=farm_v1_inventory.quantity+excluded.quantity,updated_at=p_now;

      SELECT quantity INTO v_seed_quantity FROM public.farm_v1_inventory
      WHERE owner_id=p_owner_id AND item_key=v_seed_key FOR UPDATE;
      IF coalesce(v_seed_quantity,0)<v_capacity THEN
        UPDATE public.farm_v1_lands SET planted_at=NULL,planted_crop_id=NULL,planted_quantity=0,updated_at=p_now
        WHERE owner_id=p_owner_id AND land_index=v_land.land_index;
        EXIT;
      END IF;

      UPDATE public.farm_v1_inventory SET quantity=quantity-v_capacity,updated_at=p_now
      WHERE owner_id=p_owner_id AND item_key=v_seed_key;
      UPDATE public.farm_v1_lands
      SET planted_at=v_maturity,planted_crop_id=CASE v_land.land_index
            WHEN 1 THEN 'yao-jin-su' WHEN 2 THEN 'yue-hai-tan' WHEN 3 THEN 'chi-xue-shen'
            WHEN 4 THEN 'tian-shu-man' WHEN 5 THEN 'tai-wei-lian' WHEN 6 THEN 'hun-dun-jing-hua' END,
          planted_quantity=v_capacity,updated_at=p_now
      WHERE owner_id=p_owner_id AND land_index=v_land.land_index;
      v_land.planted_at:=v_maturity;
      v_land.planted_crop_id:=CASE v_land.land_index
        WHEN 1 THEN 'yao-jin-su' WHEN 2 THEN 'yue-hai-tan' WHEN 3 THEN 'chi-xue-shen'
        WHEN 4 THEN 'tian-shu-man' WHEN 5 THEN 'tai-wei-lian' WHEN 6 THEN 'hun-dun-jing-hua' END;
      v_land.planted_quantity:=v_capacity;
      v_maturity:=v_maturity+v_growth;
    END LOOP;
  END LOOP;

  RETURN public.farm_v1_read_runtime(p_owner_id,p_now);
END;
$farmer$;

REVOKE ALL ON FUNCTION public.farm_v1_settle_exclusive_farmer(uuid,boolean,boolean,boolean,boolean,timestamptz)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_settle_exclusive_farmer(uuid,boolean,boolean,boolean,boolean,timestamptz)
TO service_role;
-- END reconciled source: 0095_atomic_farm_exclusive_farmer_settlement.sql

-- BEGIN reconciled source: 0096_finalize_farm_friend_farmer_settlement.sql
-- 0063/0064 deliberately define friend operations without depending on the
-- later exclusive-farmer RPC. After 0071 exists, replace those functions with
-- their final V1 bodies so friend mutations settle the owner's farmer first.

-- Retire the immediately previous overload so no caller can bypass the live
-- milestone entitlement flags introduced by this migration.
DROP FUNCTION IF EXISTS public.farm_v1_borrow_luck(uuid,uuid,text,timestamptz);
DROP FUNCTION IF EXISTS public.farm_v1_borrow_luck(uuid,uuid,text,numeric,numeric,timestamptz);

-- Final V1 borrow contract:
-- lands 2-5 only; mature + 1h protection; highest quantity then lower index;
-- 30% floor, guarded Suanni 21% floor; guarded Qilin 50% blocks the whole action;
-- guarded Diting 30% enables at most one second field; one successful action counts once.
CREATE OR REPLACE FUNCTION public.farm_v1_borrow_luck(
  p_helper_id uuid,
  p_owner_id uuid,
  p_idempotency_key text,
  p_diting_entitled boolean,
  p_qilin_entitled boolean,
  p_owner_exclusive_farmer_entitled boolean,
  p_owner_land4_entitled boolean,
  p_owner_land5_entitled boolean,
  p_owner_land6_entitled boolean,
  p_diting_roll numeric,
  p_qilin_roll numeric,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $borrow_final$
DECLARE
  v_today date:=timezone('Asia/Taipei',p_now)::date;
  v_land record; v_event_id uuid; v_first_land smallint;
  v_helper integer; v_owner integer; v_field_count integer:=0;
  v_total_helper integer:=0; v_total_owner integer:=0;
  v_loss numeric:=0.30; v_max_fields integer:=1;
  v_owner_pet text; v_owner_fed timestamptz; v_helper_pet text; v_helper_fed timestamptz;
  v_attempt integer;
BEGIN
  IF p_helper_id IS NULL OR p_owner_id IS NULL OR p_helper_id=p_owner_id OR nullif(btrim(p_idempotency_key),'') IS NULL
    OR p_diting_entitled IS NULL OR p_qilin_entitled IS NULL
    OR p_owner_exclusive_farmer_entitled IS NULL OR p_owner_land4_entitled IS NULL
    OR p_owner_land5_entitled IS NULL OR p_owner_land6_entitled IS NULL
    OR p_diting_roll<0 OR p_diting_roll>=1 OR p_qilin_roll<0 OR p_qilin_roll>=1
  THEN RAISE EXCEPTION 'BORROW_NOT_ALLOWED'; END IF;

  -- Serialize idempotency and quota checks for this helper.
  -- UNIQUE(helper_id,idempotency_key) remains the final database backstop.
  -- Lock both participants in deterministic UUID order to prevent reciprocal
  -- friend actions from deadlocking while farmer settlement locks the owner.
  IF p_helper_id <= p_owner_id THEN
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_helper_id FOR UPDATE;
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_helper_id FOR UPDATE;
  END IF;
  IF EXISTS(SELECT 1 FROM public.farm_v1_friend_action_events WHERE helper_id=p_helper_id AND idempotency_key=p_idempotency_key)
  THEN RETURN jsonb_build_object('status','duplicate'); END IF;


  IF NOT EXISTS(SELECT 1 FROM public.platform_friendships WHERE user_a_id=least(p_helper_id,p_owner_id) AND user_b_id=greatest(p_helper_id,p_owner_id) AND status='active')
  THEN RAISE EXCEPTION 'BORROW_NOT_ALLOWED'; END IF;

  -- Only successful historical actions consume the daily quota. A Qilin block writes no event.
  IF public.farm_v1_borrow_count_today(p_helper_id,p_now)>=5
  THEN RAISE EXCEPTION 'ACTION_DAILY_LIMIT'; END IF;

  PERFORM public.farm_v1_settle_exclusive_farmer(
    p_owner_id,p_owner_exclusive_farmer_entitled,p_owner_land4_entitled,
    p_owner_land5_entitled,p_owner_land6_entitled,p_now
  );
  PERFORM public.farm_v1_read_runtime(p_helper_id,p_now);

  SELECT resident_pet_id,fed_at INTO v_owner_pet,v_owner_fed FROM public.farm_v1_pet_care WHERE owner_id=p_owner_id;
  SELECT resident_pet_id,fed_at INTO v_helper_pet,v_helper_fed FROM public.farm_v1_pet_care WHERE owner_id=p_helper_id;

  IF p_qilin_entitled AND v_owner_pet='qian-kun-qi-lin' AND v_owner_fed IS NOT NULL AND p_now<v_owner_fed+interval '24 hours' AND p_qilin_roll<0.50
  THEN RETURN jsonb_build_object('status','blocked','blockedBy','qian-kun-qi-lin','counted',false); END IF;

  IF v_owner_pet='bi-xie-suan-ni' AND v_owner_fed IS NOT NULL AND p_now<v_owner_fed+interval '24 hours' THEN v_loss:=0.21; END IF;
  IF p_diting_entitled AND v_helper_pet='shi-shi-di-ting' AND v_helper_fed IS NOT NULL AND p_now<v_helper_fed+interval '24 hours' AND p_diting_roll<0.30 THEN v_max_fields:=2; END IF;

  -- Select and lock one field at a time. If Diting activates, the second field is
  -- re-ranked only after the first field mutation has completed.
  FOR v_attempt IN 1..v_max_fields LOOP
    SELECT land.* INTO v_land FROM public.farm_v1_lands land
    WHERE land.owner_id=p_owner_id
      AND land.land_index BETWEEN 2 AND 5
      AND land.planted_quantity>1
      AND (v_first_land IS NULL OR land.land_index<>v_first_land)
      AND p_now>=land.planted_at+CASE land.planted_crop_id
        WHEN 'yue-hai-tan' THEN interval '7 hours'
        WHEN 'chi-xue-shen' THEN interval '9 hours'
        WHEN 'tian-shu-man' THEN interval '11 hours'
        WHEN 'tai-wei-lian' THEN interval '13 hours'
        ELSE interval '100 years' END
    ORDER BY land.planted_quantity DESC,land.land_index ASC
    LIMIT 1 FOR UPDATE;

    IF NOT FOUND THEN EXIT; END IF;

    v_helper:=least(floor(v_land.planted_quantity*v_loss)::integer,v_land.planted_quantity-1);
    IF v_helper<1 THEN EXIT; END IF;
    v_owner:=v_land.planted_quantity-v_helper;

    UPDATE public.farm_v1_lands
    SET planted_quantity=v_owner,updated_at=p_now
    WHERE owner_id=p_owner_id AND land_index=v_land.land_index;

    INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity)
    VALUES(p_helper_id,v_land.planted_crop_id,v_helper)
    ON CONFLICT(owner_id,item_key) DO UPDATE
    SET quantity=farm_v1_inventory.quantity+excluded.quantity,updated_at=p_now;

    IF v_first_land IS NULL THEN
      v_first_land:=v_land.land_index;
      INSERT INTO public.farm_v1_friend_action_events(
        helper_id,owner_id,land_index,action_type,crop_id,helper_crop_quantity,
        owner_crop_quantity,taiwan_date,idempotency_key,created_at
      ) VALUES(
        p_helper_id,p_owner_id,v_land.land_index,'borrow',v_land.planted_crop_id,
        v_helper,v_owner,v_today,p_idempotency_key,p_now
      ) RETURNING id INTO v_event_id;
    ELSE
      INSERT INTO public.farm_v1_friend_action_extra_lands(event_id,land_index)
      VALUES(v_event_id,v_land.land_index);
    END IF;

    v_field_count:=v_field_count+1;
    v_total_helper:=v_total_helper+v_helper;
    v_total_owner:=v_total_owner+v_owner;
  END LOOP;
  IF v_first_land IS NULL THEN RAISE EXCEPTION 'BORROW_NOT_AVAILABLE'; END IF;
  RETURN jsonb_build_object('status','created','landIndex',v_first_land,'helperCropQuantity',v_total_helper,'ownerCropQuantity',v_total_owner,'secondFieldApplied',v_field_count=2,'counted',true);
END; $borrow_final$;

REVOKE ALL ON FUNCTION public.farm_v1_borrow_luck(uuid,uuid,text,boolean,boolean,boolean,boolean,boolean,boolean,numeric,numeric,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_borrow_luck(uuid,uuid,text,boolean,boolean,boolean,boolean,boolean,boolean,numeric,numeric,timestamptz) TO service_role;



-- Final V1 assist contract:
-- lands 1-6; assist is available immediately at maturity;
-- owner receives 100% of actual harvest; helper receives a system-created ceil(10%) bonus
-- for ordinary crops; land 6 helper bonus is always 0.
CREATE OR REPLACE FUNCTION public.farm_v1_friend_assist_harvest(
  p_helper_id uuid,
  p_owner_id uuid,
  p_land_index smallint,
  p_idempotency_key text,
  p_owner_exclusive_farmer_entitled boolean,
  p_owner_land4_entitled boolean,
  p_owner_land5_entitled boolean,
  p_owner_land6_entitled boolean,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $assist_final$
DECLARE
  v_today date:=timezone('Asia/Taipei',p_now)::date;
  v_land public.farm_v1_lands;
  v_growth interval;
  v_owner_quantity integer;
  v_helper_quantity integer;
  v_blessing boolean:=false;
BEGIN
  IF p_helper_id IS NULL OR p_owner_id IS NULL OR p_helper_id=p_owner_id
    OR p_land_index NOT BETWEEN 1 AND 6 OR nullif(btrim(p_idempotency_key),'') IS NULL
    OR p_owner_exclusive_farmer_entitled IS NULL OR p_owner_land4_entitled IS NULL
    OR p_owner_land5_entitled IS NULL OR p_owner_land6_entitled IS NULL
  THEN RAISE EXCEPTION 'ASSIST_NOT_ALLOWED'; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.platform_friendships
    WHERE user_a_id=least(p_helper_id,p_owner_id) AND user_b_id=greatest(p_helper_id,p_owner_id) AND status='active')
  THEN RAISE EXCEPTION 'ASSIST_NOT_ALLOWED'; END IF;

  -- Serialize idempotency and quota checks for this helper.
  -- UNIQUE(helper_id,idempotency_key) remains the final database backstop.
  -- Lock both participants in deterministic UUID order to prevent reciprocal
  -- friend actions from deadlocking while farmer settlement locks the owner.
  IF p_helper_id <= p_owner_id THEN
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_helper_id FOR UPDATE;
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_helper_id FOR UPDATE;
  END IF;
  IF EXISTS(SELECT 1 FROM public.farm_v1_friend_action_events WHERE helper_id=p_helper_id AND idempotency_key=p_idempotency_key)
  THEN RETURN jsonb_build_object('status','duplicate'); END IF;

  IF public.farm_v1_friend_assist_count_today(p_helper_id,p_now)>=5
  THEN RAISE EXCEPTION 'ACTION_DAILY_LIMIT'; END IF;

  PERFORM public.farm_v1_settle_exclusive_farmer(
    p_owner_id,p_owner_exclusive_farmer_entitled,p_owner_land4_entitled,
    p_owner_land5_entitled,p_owner_land6_entitled,p_now
  );
  PERFORM public.farm_v1_read_runtime(p_helper_id,p_now);

  SELECT * INTO v_land FROM public.farm_v1_lands
  WHERE owner_id=p_owner_id AND land_index=p_land_index FOR UPDATE;

  IF NOT FOUND OR v_land.planted_at IS NULL OR v_land.planted_crop_id IS NULL OR v_land.planted_quantity<1
  THEN RAISE EXCEPTION 'ASSIST_NOT_MATURE'; END IF;

  v_growth:=CASE v_land.planted_crop_id
    WHEN 'yao-jin-su' THEN interval '4 hours'
    WHEN 'yue-hai-tan' THEN interval '6 hours'
    WHEN 'chi-xue-shen' THEN interval '8 hours'
    WHEN 'tian-shu-man' THEN interval '10 hours'
    WHEN 'tai-wei-lian' THEN interval '12 hours'
    WHEN 'hun-dun-jing-hua' THEN interval '60 hours'
    ELSE NULL END;
  IF v_growth IS NULL OR p_now<v_land.planted_at+v_growth THEN RAISE EXCEPTION 'ASSIST_NOT_MATURE'; END IF;

  -- Blessing belongs to the owner and is evaluated at the actual assisted harvest timestamp.
  IF p_land_index BETWEEN 1 AND 5 THEN
    SELECT p_now>=first_farm_entered_at AND p_now<first_farm_entered_at+interval '7 days'
    INTO v_blessing FROM public.farm_v1_profiles WHERE owner_id=p_owner_id;
  END IF;

  v_owner_quantity:=v_land.planted_quantity*CASE WHEN coalesce(v_blessing,false) THEN 6 ELSE 1 END;
  v_helper_quantity:=CASE WHEN p_land_index=6 THEN 0 ELSE ceil(v_owner_quantity*0.10)::integer END;

  UPDATE public.farm_v1_lands SET planted_at=NULL,planted_crop_id=NULL,planted_quantity=0,updated_at=p_now
  WHERE owner_id=p_owner_id AND land_index=p_land_index;

  INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity)
  VALUES(p_owner_id,v_land.planted_crop_id,v_owner_quantity)
  ON CONFLICT(owner_id,item_key) DO UPDATE SET quantity=farm_v1_inventory.quantity+excluded.quantity,updated_at=p_now;

  IF v_helper_quantity>0 THEN
    INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity)
    VALUES(p_helper_id,v_land.planted_crop_id,v_helper_quantity)
    ON CONFLICT(owner_id,item_key) DO UPDATE SET quantity=farm_v1_inventory.quantity+excluded.quantity,updated_at=p_now;
  END IF;

  INSERT INTO public.farm_v1_friend_action_events(
    helper_id,owner_id,land_index,action_type,crop_id,helper_crop_quantity,owner_crop_quantity,taiwan_date,idempotency_key,created_at
  ) VALUES(
    p_helper_id,p_owner_id,p_land_index,'assist',v_land.planted_crop_id,
    v_helper_quantity,v_owner_quantity,v_today,p_idempotency_key,p_now
  );

  RETURN jsonb_build_object(
    'status','created','cropId',v_land.planted_crop_id,'landIndex',p_land_index,
    'helperCropQuantity',v_helper_quantity,'ownerCropQuantity',v_owner_quantity,
    'blessingApplied',coalesce(v_blessing,false),'counted',true
  );
END; $assist_final$;

REVOKE ALL ON FUNCTION public.farm_v1_friend_assist_harvest(uuid,uuid,smallint,text,boolean,boolean,boolean,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_friend_assist_harvest(uuid,uuid,smallint,text,boolean,boolean,boolean,boolean,timestamptz) TO service_role;
-- END reconciled source: 0096_finalize_farm_friend_farmer_settlement.sql

-- BEGIN reconciled source: 0097_atomic_farm_market_and_unlock.sql
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
-- END reconciled source: 0097_atomic_farm_market_and_unlock.sql

-- BEGIN reconciled source: 0098_atomic_farm_gameplay_mutations.sql
CREATE OR REPLACE FUNCTION public.farm_v1_plant_land(
  p_owner_id uuid,p_land_index smallint,p_quantity integer,p_idempotency_key text,
  p_land4_entitled boolean,p_land5_entitled boolean,p_land6_entitled boolean,
  p_exclusive_farmer_entitled boolean,p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_land public.farm_v1_lands; v_seed_key text; v_crop_id text; v_capacity integer;
  v_inventory public.farm_v1_inventory; v_fingerprint text; v_existing_type text;
  v_existing_fingerprint text; v_inserted boolean;
BEGIN
  IF p_owner_id IS NULL OR p_land_index NOT BETWEEN 1 AND 6 OR p_quantity IS NULL OR btrim(COALESCE(p_idempotency_key,''))='' THEN RAISE EXCEPTION 'Invalid farm plant request'; END IF;
  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(p_owner_id,COALESCE(p_exclusive_farmer_entitled,false),COALESCE(p_land4_entitled,false),COALESCE(p_land5_entitled,false),COALESCE(p_land6_entitled,false),p_now);
  v_fingerprint:=encode(extensions.digest(convert_to('plant:' || p_land_index::text || ':' || p_quantity::text,'UTF8'),'sha256'),'hex');
  -- Idempotency is checked before mutable plant state so a successful retry
  -- remains a duplicate after the field has become occupied.
  SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_type='plant' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  IF (p_land_index=4 AND NOT COALESCE(p_land4_entitled,false)) OR (p_land_index=5 AND NOT COALESCE(p_land5_entitled,false)) OR (p_land_index=6 AND NOT COALESCE(p_land6_entitled,false)) THEN RETURN jsonb_build_object('result_status','not_entitled'); END IF;
  SELECT * INTO v_land FROM public.farm_v1_lands WHERE owner_id=p_owner_id AND land_index=p_land_index FOR UPDATE;
  IF v_land.unlocked_at IS NULL THEN RETURN jsonb_build_object('result_status','locked'); END IF;
  IF v_land.planted_at IS NOT NULL THEN RETURN jsonb_build_object('result_status','occupied'); END IF;
  SELECT x.seed_key,x.crop_id,x.capacity INTO v_seed_key,v_crop_id,v_capacity FROM (VALUES
    (1::smallint,'yao-jin-seed','yao-jin-su',20),(2::smallint,'you-ying-seed','yue-hai-tan',10),
    (3::smallint,'zhu-sha-seed','chi-xue-shen',6),(4::smallint,'yao-zi-seed','tian-shu-man',4),
    (5::smallint,'fei-cui-seed','tai-wei-lian',3),(6::smallint,'hun-dun-seed','hun-dun-jing-hua',1)
  ) AS x(land_index,seed_key,crop_id,capacity) WHERE x.land_index=p_land_index;
  IF p_quantity<>v_capacity THEN RETURN jsonb_build_object('result_status','invalid_quantity'); END IF;
  SELECT * INTO v_inventory FROM public.farm_v1_inventory WHERE owner_id=p_owner_id AND item_key=v_seed_key FOR UPDATE;
  IF NOT FOUND OR v_inventory.quantity<p_quantity THEN RETURN jsonb_build_object('result_status','insufficient_inventory'); END IF;
  INSERT INTO public.farm_v1_operation_records(owner_id,idempotency_key,operation_type,request_fingerprint,recorded_at) VALUES(p_owner_id,p_idempotency_key,'plant',v_fingerprint,p_now) ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF NOT COALESCE(v_inserted,false) THEN
    SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
    IF v_existing_type='plant' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  UPDATE public.farm_v1_inventory SET quantity=quantity-p_quantity,updated_at=p_now WHERE owner_id=p_owner_id AND item_key=v_seed_key;
  UPDATE public.farm_v1_lands SET planted_at=p_now,planted_crop_id=v_crop_id,planted_quantity=p_quantity,updated_at=p_now WHERE owner_id=p_owner_id AND land_index=p_land_index;
  RETURN jsonb_build_object('result_status','created');
END; $$;

CREATE OR REPLACE FUNCTION public.farm_v1_harvest_land(
  p_owner_id uuid,p_land_index smallint,p_idempotency_key text,
  p_land4_entitled boolean,p_land5_entitled boolean,p_land6_entitled boolean,
  p_exclusive_farmer_entitled boolean,p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_land public.farm_v1_lands; v_first_entered timestamptz; v_growth_hours integer;
  v_output_quantity integer; v_fingerprint text; v_existing_type text; v_existing_fingerprint text; v_inserted boolean;
BEGIN
  IF p_owner_id IS NULL OR p_land_index NOT BETWEEN 1 AND 6 OR btrim(COALESCE(p_idempotency_key,''))='' THEN RAISE EXCEPTION 'Invalid farm harvest request'; END IF;
  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(p_owner_id,COALESCE(p_exclusive_farmer_entitled,false),COALESCE(p_land4_entitled,false),COALESCE(p_land5_entitled,false),COALESCE(p_land6_entitled,false),p_now);
  v_fingerprint:=encode(extensions.digest(convert_to('harvest:' || p_land_index::text,'UTF8'),'sha256'),'hex');
  SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_type='harvest' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  SELECT * INTO v_land FROM public.farm_v1_lands WHERE owner_id=p_owner_id AND land_index=p_land_index FOR UPDATE;
  IF v_land.planted_at IS NULL OR v_land.planted_crop_id IS NULL OR v_land.planted_quantity<1 THEN RETURN jsonb_build_object('result_status','empty'); END IF;
  v_growth_hours:=CASE p_land_index WHEN 1 THEN 4 WHEN 2 THEN 6 WHEN 3 THEN 8 WHEN 4 THEN 10 WHEN 5 THEN 12 WHEN 6 THEN 60 END;
  IF p_now < v_land.planted_at + make_interval(hours=>v_growth_hours) THEN RETURN jsonb_build_object('result_status','not_mature'); END IF;
  SELECT first_farm_entered_at INTO v_first_entered FROM public.farm_v1_profiles WHERE owner_id=p_owner_id;
  v_output_quantity:=v_land.planted_quantity;
  IF p_land_index BETWEEN 1 AND 5 AND v_first_entered IS NOT NULL AND p_now < v_first_entered + interval '7 days' THEN v_output_quantity := v_land.planted_quantity * 6; END IF;
  INSERT INTO public.farm_v1_operation_records(owner_id,idempotency_key,operation_type,request_fingerprint,recorded_at) VALUES(p_owner_id,p_idempotency_key,'harvest',v_fingerprint,p_now) ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF NOT COALESCE(v_inserted,false) THEN
    SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
    IF v_existing_type='harvest' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity) VALUES(p_owner_id,v_land.planted_crop_id,v_output_quantity)
  ON CONFLICT(owner_id,item_key) DO UPDATE SET quantity=public.farm_v1_inventory.quantity+EXCLUDED.quantity,updated_at=p_now;
  UPDATE public.farm_v1_lands SET planted_at = NULL,planted_crop_id=NULL,planted_quantity=0,updated_at=p_now WHERE owner_id=p_owner_id AND land_index=p_land_index;
  RETURN jsonb_build_object('result_status','created');
END; $$;

CREATE OR REPLACE FUNCTION public.farm_v1_feed_pet(
  p_owner_id uuid,p_pet_id text,p_idempotency_key text,
  p_diting_entitled boolean,p_qilin_entitled boolean,
  p_land4_entitled boolean,p_land5_entitled boolean,p_land6_entitled boolean,
  p_exclusive_farmer_entitled boolean,p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_portions integer; v_feed public.farm_v1_inventory; v_fingerprint text;
  v_existing_type text; v_existing_fingerprint text; v_inserted boolean;
BEGIN
  IF p_owner_id IS NULL OR btrim(COALESCE(p_pet_id,''))='' OR btrim(COALESCE(p_idempotency_key,''))='' THEN RAISE EXCEPTION 'Invalid farm pet feed request'; END IF;
  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(p_owner_id,COALESCE(p_exclusive_farmer_entitled,false),COALESCE(p_land4_entitled,false),COALESCE(p_land5_entitled,false),COALESCE(p_land6_entitled,false),p_now);
  v_fingerprint:=encode(extensions.digest(convert_to('feed:' || p_pet_id,'UTF8'),'sha256'),'hex');
  -- Idempotency is checked before live pet entitlement so retrying an already
  -- completed feed cannot fail merely because a paid entitlement was later suspended.
  SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_type='feed' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  IF p_pet_id='shi-shi-di-ting' AND NOT COALESCE(p_diting_entitled,false) THEN RAISE EXCEPTION 'FARM_PET_NOT_ENTITLED'; END IF;
  IF p_pet_id='qian-kun-qi-lin' AND NOT COALESCE(p_qilin_entitled,false) THEN RAISE EXCEPTION 'FARM_PET_NOT_ENTITLED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.farm_v1_owned_pets WHERE owner_id=p_owner_id AND pet_id=p_pet_id) THEN RETURN jsonb_build_object('result_status','not_owned'); END IF;
  v_portions:=CASE p_pet_id WHEN 'xun-xing-quan' THEN 1 WHEN 'bi-xie-suan-ni' THEN 2 WHEN 'shi-shi-di-ting' THEN 3 WHEN 'qian-kun-qi-lin' THEN 4 ELSE NULL END;
  IF v_portions IS NULL THEN RETURN jsonb_build_object('result_status','invalid_pet'); END IF;
  SELECT * INTO v_feed FROM public.farm_v1_inventory WHERE owner_id=p_owner_id AND item_key='tai-yi-wu-gu-san' FOR UPDATE;
  IF NOT FOUND OR v_feed.quantity<v_portions THEN RETURN jsonb_build_object('result_status','insufficient_inventory'); END IF;
  INSERT INTO public.farm_v1_operation_records(owner_id,idempotency_key,operation_type,request_fingerprint,recorded_at) VALUES(p_owner_id,p_idempotency_key,'feed',v_fingerprint,p_now) ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF NOT COALESCE(v_inserted,false) THEN
    SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
    IF v_existing_type='feed' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  UPDATE public.farm_v1_inventory SET quantity=quantity-v_portions,updated_at=p_now WHERE owner_id=p_owner_id AND item_key='tai-yi-wu-gu-san';
  UPDATE public.farm_v1_pet_care SET fed_at=p_now,resident_pet_id=p_pet_id,updated_at=p_now WHERE owner_id=p_owner_id;
  RETURN jsonb_build_object('result_status','created');
END; $$;

REVOKE ALL ON FUNCTION public.farm_v1_plant_land(uuid,smallint,integer,text,boolean,boolean,boolean,boolean,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.farm_v1_harvest_land(uuid,smallint,text,boolean,boolean,boolean,boolean,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.farm_v1_feed_pet(uuid,text,text,boolean,boolean,boolean,boolean,boolean,boolean,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_plant_land(uuid,smallint,integer,text,boolean,boolean,boolean,boolean,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_harvest_land(uuid,smallint,text,boolean,boolean,boolean,boolean,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_feed_pet(uuid,text,text,boolean,boolean,boolean,boolean,boolean,boolean,timestamptz) TO service_role;
-- END reconciled source: 0098_atomic_farm_gameplay_mutations.sql

-- BEGIN reconciled source: 0099_persist_farm_paid_milestone_rewards.sql
CREATE OR REPLACE FUNCTION public.farm_v1_apply_paid_milestones(
  p_owner_id uuid,
  p_land4_entitled boolean,
  p_land5_entitled boolean,
  p_diting_entitled boolean,
  p_land6_entitled boolean,
  p_qilin_entitled boolean,
  p_now timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_owner_id IS NULL
    OR p_land4_entitled IS NULL OR p_land5_entitled IS NULL
    OR p_diting_entitled IS NULL OR p_land6_entitled IS NULL
    OR p_qilin_entitled IS NULL
  THEN RAISE EXCEPTION 'FARM_PAID_MILESTONE_INVALID'; END IF;

  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);

  -- Milestone qualification grants persistent ownership/unlock state once.
  -- Refunds suspend entitlement elsewhere; they never erase persisted state.
  IF p_land4_entitled THEN
    UPDATE public.farm_v1_lands
    SET unlocked_at=COALESCE(unlocked_at,p_now),updated_at=p_now
    WHERE owner_id=p_owner_id AND land_index=4;
  END IF;
  IF p_land5_entitled THEN
    UPDATE public.farm_v1_lands
    SET unlocked_at=COALESCE(unlocked_at,p_now),updated_at=p_now
    WHERE owner_id=p_owner_id AND land_index=5;
  END IF;
  IF p_land6_entitled THEN
    UPDATE public.farm_v1_lands
    SET unlocked_at=COALESCE(unlocked_at,p_now),updated_at=p_now
    WHERE owner_id=p_owner_id AND land_index=6;
  END IF;

  IF p_diting_entitled THEN
    INSERT INTO public.farm_v1_owned_pets(owner_id,pet_id,obtained_at)
    VALUES(p_owner_id,'shi-shi-di-ting',p_now)
    ON CONFLICT(owner_id,pet_id) DO NOTHING;
  END IF;
  IF p_qilin_entitled THEN
    INSERT INTO public.farm_v1_owned_pets(owner_id,pet_id,obtained_at)
    VALUES(p_owner_id,'qian-kun-qi-lin',p_now)
    ON CONFLICT(owner_id,pet_id) DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.farm_v1_apply_paid_milestones(uuid,boolean,boolean,boolean,boolean,boolean,timestamptz)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_apply_paid_milestones(uuid,boolean,boolean,boolean,boolean,boolean,timestamptz)
TO service_role;
-- END reconciled source: 0099_persist_farm_paid_milestone_rewards.sql

-- BEGIN reconciled source: 0100_atomic_farm_chaos_seed_claim.sql
CREATE OR REPLACE FUNCTION public.farm_v1_claim_chaos_seed(
  p_owner_id uuid,
  p_idempotency_key text,
  p_land6_entitled boolean,
  p_exclusive_farmer_entitled boolean,
  p_land4_entitled boolean,
  p_land5_entitled boolean,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_anchor timestamptz;
  v_last_cycle integer;
  v_current_cycle integer;
  v_fingerprint text;
  v_existing_type text;
  v_existing_fingerprint text;
  v_inserted boolean;
BEGIN
  IF p_owner_id IS NULL OR COALESCE(btrim(p_idempotency_key),'')='' THEN
    RAISE EXCEPTION 'FARM_CHAOS_CLAIM_INVALID';
  END IF;

  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(
    p_owner_id,COALESCE(p_exclusive_farmer_entitled,false),
    COALESCE(p_land4_entitled,false),COALESCE(p_land5_entitled,false),
    COALESCE(p_land6_entitled,false),p_now
  );

  v_fingerprint:=encode(extensions.digest(convert_to('claim_chaos_seed','UTF8'),'sha256'),'hex');
  SELECT operation_type,request_fingerprint
  INTO v_existing_type,v_existing_fingerprint
  FROM public.farm_v1_operation_records
  WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_type='claim_chaos_seed' AND v_existing_fingerprint=v_fingerprint THEN
      RETURN jsonb_build_object('result_status','duplicate');
    END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;

  IF NOT COALESCE(p_land6_entitled,false) THEN
    RETURN jsonb_build_object('result_status','not_entitled');
  END IF;

  SELECT unlocked_at INTO v_anchor
  FROM public.farm_v1_lands
  WHERE owner_id=p_owner_id AND land_index=6
  FOR UPDATE;
  IF v_anchor IS NULL THEN RETURN jsonb_build_object('result_status','locked'); END IF;
  IF p_now<v_anchor THEN RETURN jsonb_build_object('result_status','not_claimable'); END IF;

  SELECT last_chaos_seed_claimed_cycle INTO v_last_cycle
  FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;

  v_current_cycle:=floor(extract(epoch FROM (p_now-v_anchor))/extract(epoch FROM interval '72 hours'))::integer;
  IF v_current_cycle<=COALESCE(v_last_cycle,-1) THEN
    RETURN jsonb_build_object('result_status','not_claimable');
  END IF;

  INSERT INTO public.farm_v1_operation_records(owner_id,idempotency_key,operation_type,request_fingerprint,recorded_at)
  VALUES(p_owner_id,p_idempotency_key,'claim_chaos_seed',v_fingerprint,p_now)
  ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF NOT COALESCE(v_inserted,false) THEN
    SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint
    FROM public.farm_v1_operation_records
    WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
    IF v_existing_type='claim_chaos_seed' AND v_existing_fingerprint=v_fingerprint THEN
      RETURN jsonb_build_object('result_status','duplicate');
    END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;

  INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity,updated_at)
  VALUES(p_owner_id,'hun-dun-seed',1,p_now)
  ON CONFLICT(owner_id,item_key) DO UPDATE
  SET quantity=public.farm_v1_inventory.quantity+1,updated_at=p_now;

  UPDATE public.farm_v1_profiles
  SET last_chaos_seed_claimed_cycle=v_current_cycle,updated_at=p_now
  WHERE owner_id=p_owner_id;

  RETURN jsonb_build_object('result_status','created','claimed_cycle',v_current_cycle);
END;
$$;

REVOKE ALL ON FUNCTION public.farm_v1_claim_chaos_seed(uuid,text,boolean,boolean,boolean,boolean,timestamptz)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_claim_chaos_seed(uuid,text,boolean,boolean,boolean,boolean,timestamptz)
TO service_role;
-- END reconciled source: 0100_atomic_farm_chaos_seed_claim.sql

-- BEGIN reconciled source: 0101_minimize_farm_friend_action_context.sql
-- Friend UI does not browse another player's Farm. Keep only the minimum
-- actionability projection needed for the approved assist/borrow actions.
DROP FUNCTION IF EXISTS public.farm_v1_friend_read_fields(uuid,uuid,timestamptz);

CREATE OR REPLACE FUNCTION public.platform_friend_read_context(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $friend_context_minimal$
DECLARE v_code jsonb; v_now timestamptz:=now();
BEGIN
  v_code:=public.platform_friend_profile(p_owner_id);
  RETURN jsonb_build_object(
    'invitationCode',v_code->>'invitationCode',
    'incomingInvites',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',i.id::text,'senderId',i.sender_id::text,
        'senderDisplayName',coalesce(p.display_name,'道友 '||right(p.invitation_code,4)),
        'recipientId',i.recipient_id::text,'message',i.message,'status',i.status,
        'createdAt',i.created_at,'resolvedAt',i.resolved_at
      ) ORDER BY i.created_at DESC)
      FROM public.platform_friend_invites i JOIN public.platform_friend_profiles p ON p.owner_id=i.sender_id
      WHERE i.recipient_id=p_owner_id AND i.status='pending'
    ),'[]'::jsonb),
    'friends',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',f.friend_id::text,
        'displayName',coalesce(p.display_name,'道友 '||right(p.invitation_code,4)),
        'assistableLandIndexes',COALESCE((
          SELECT jsonb_agg(l.land_index ORDER BY l.land_index) FROM public.farm_v1_lands l
          WHERE l.owner_id=f.friend_id AND l.planted_quantity>0 AND CASE l.planted_crop_id
            WHEN 'yao-jin-su' THEN v_now>=l.planted_at+interval '4 hours'
            WHEN 'yue-hai-tan' THEN v_now>=l.planted_at+interval '6 hours'
            WHEN 'chi-xue-shen' THEN v_now>=l.planted_at+interval '8 hours'
            WHEN 'tian-shu-man' THEN v_now>=l.planted_at+interval '10 hours'
            WHEN 'tai-wei-lian' THEN v_now>=l.planted_at+interval '12 hours'
            WHEN 'hun-dun-jing-hua' THEN v_now>=l.planted_at+interval '60 hours'
            ELSE false END
        ),'[]'::jsonb),
        'borrowableLandIndexes',COALESCE((
          SELECT jsonb_agg(l.land_index ORDER BY l.land_index) FROM public.farm_v1_lands l
          WHERE l.owner_id=f.friend_id AND l.land_index BETWEEN 2 AND 5 AND l.planted_quantity>1 AND CASE l.planted_crop_id
            WHEN 'yue-hai-tan' THEN v_now>=l.planted_at+interval '7 hours'
            WHEN 'chi-xue-shen' THEN v_now>=l.planted_at+interval '9 hours'
            WHEN 'tian-shu-man' THEN v_now>=l.planted_at+interval '11 hours'
            WHEN 'tai-wei-lian' THEN v_now>=l.planted_at+interval '13 hours'
            ELSE false END
        ),'[]'::jsonb)
      ))
      FROM (
        SELECT CASE WHEN user_a_id=p_owner_id THEN user_b_id ELSE user_a_id END friend_id
        FROM public.platform_friendships WHERE status='active' AND p_owner_id IN(user_a_id,user_b_id)
      ) f JOIN public.platform_friend_profiles p ON p.owner_id=f.friend_id
    ),'[]'::jsonb),
    'remainingDailyAssists',greatest(0,5-public.farm_v1_friend_assist_count_today(p_owner_id,v_now)),
    'remainingDailyBorrows',greatest(0,5-public.farm_v1_borrow_count_today(p_owner_id,v_now))
  );
END; $friend_context_minimal$;

REVOKE ALL ON FUNCTION public.platform_friend_read_context(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_friend_read_context(uuid) TO service_role;
-- END reconciled source: 0101_minimize_farm_friend_action_context.sql

-- BEGIN reconciled source: 0102_atomic_farmer_preference_transition.sql
DROP FUNCTION IF EXISTS public.farm_v1_set_farmer_preference(uuid,smallint,boolean,timestamptz);

CREATE OR REPLACE FUNCTION public.farm_v1_set_farmer_preference(
  p_owner_id uuid,
  p_land_index smallint,
  p_auto_cultivate boolean,
  p_idempotency_key text,
  p_exclusive_farmer_entitled boolean,
  p_land4_entitled boolean,
  p_land5_entitled boolean,
  p_land6_entitled boolean,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $farmer_preference$
DECLARE
  v_fingerprint text;
  v_existing_type text;
  v_existing_fingerprint text;
  v_inserted boolean;
BEGIN
  IF p_owner_id IS NULL OR p_land_index NOT BETWEEN 1 AND 6
    OR p_auto_cultivate IS NULL OR COALESCE(btrim(p_idempotency_key),'')=''
    OR NOT COALESCE(p_exclusive_farmer_entitled,false)
  THEN RAISE EXCEPTION 'FARM_FARMER_PREFERENCE_INVALID'; END IF;

  v_fingerprint:=encode(
    extensions.digest(
      convert_to('set_farmer_preference:' || p_land_index::text || ':' || p_auto_cultivate::text,'UTF8'),
      'sha256'
    ),
    'hex'
  );

  -- A retry of an already committed switch must not run settlement again.
  SELECT operation_type,request_fingerprint
  INTO v_existing_type,v_existing_fingerprint
  FROM public.farm_v1_operation_records
  WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;

  IF FOUND THEN
    IF v_existing_type='set_farmer_preference' AND v_existing_fingerprint=v_fingerprint THEN
      RETURN jsonb_build_object(
        'result_status','duplicate',
        'preferences',public.farm_v1_read_farmer_preferences(p_owner_id)
      );
    END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;

  PERFORM public.farm_v1_initialize_farmer_preferences(p_owner_id,p_now);

  -- Settle all work due through this instant using the old per-land switches.
  -- Only after that boundary is fixed do we apply the new switch prospectively.
  PERFORM public.farm_v1_settle_exclusive_farmer(
    p_owner_id,
    true,
    COALESCE(p_land4_entitled,false),
    COALESCE(p_land5_entitled,false),
    COALESCE(p_land6_entitled,false),
    p_now
  );

  INSERT INTO public.farm_v1_operation_records(
    owner_id,idempotency_key,operation_type,request_fingerprint,recorded_at
  ) VALUES(
    p_owner_id,p_idempotency_key,'set_farmer_preference',v_fingerprint,p_now
  )
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT COALESCE(v_inserted,false) THEN
    SELECT operation_type,request_fingerprint
    INTO v_existing_type,v_existing_fingerprint
    FROM public.farm_v1_operation_records
    WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;

    IF v_existing_type='set_farmer_preference' AND v_existing_fingerprint=v_fingerprint THEN
      RETURN jsonb_build_object(
        'result_status','duplicate',
        'preferences',public.farm_v1_read_farmer_preferences(p_owner_id)
      );
    END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;

  UPDATE public.farm_v1_farmer_preferences
  SET auto_cultivate=p_auto_cultivate,updated_at=p_now
  WHERE owner_id=p_owner_id AND land_index=p_land_index;

  RETURN jsonb_build_object(
    'result_status','created',
    'preferences',public.farm_v1_read_farmer_preferences(p_owner_id)
  );
END;
$farmer_preference$;

REVOKE ALL ON FUNCTION public.farm_v1_set_farmer_preference(uuid,smallint,boolean,text,boolean,boolean,boolean,boolean,timestamptz)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_set_farmer_preference(uuid,smallint,boolean,text,boolean,boolean,boolean,boolean,timestamptz)
TO service_role;
-- END reconciled source: 0102_atomic_farmer_preference_transition.sql

-- BEGIN reconciled source: 0103_farm_canonical_paid_qualification.sql
CREATE OR REPLACE FUNCTION public.farm_v1_effective_paid_crystals(
  p_auth_user_id uuid
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,core
AS $paid$
DECLARE
  v_adjustment_count bigint;
  v_effective bigint;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'FARM_PAID_QUALIFICATION_OWNER_REQUIRED';
  END IF;

  SELECT COUNT(*)
  INTO v_adjustment_count
  FROM core.users u
  JOIN core.wallets w ON w.user_id=u.id
  JOIN core.wallet_ledgers l ON l.wallet_id=w.id
  WHERE u.auth_user_id=p_auth_user_id
    AND l.currency_type='paid_crystal'
    AND l.entry_type='adjustment';

  -- The canonical schema does not define whether an adjustment grants or
  -- reverses lifetime paid qualification. Never guess that direction.
  IF v_adjustment_count>0 THEN
    RAISE EXCEPTION 'FARM_PAID_QUALIFICATION_ADJUSTMENT_UNDEFINED';
  END IF;

  SELECT COALESCE(
    GREATEST(
      0::bigint,
      SUM(
        CASE
          WHEN l.entry_type='credit' THEN l.amount
          WHEN l.entry_type='refund' THEN -l.amount
          WHEN l.entry_type='debit' THEN 0
          ELSE 0
        END
      )
    ),
    0::bigint
  )
  INTO v_effective
  FROM core.users u
  JOIN core.wallets w ON w.user_id=u.id
  JOIN core.wallet_ledgers l ON l.wallet_id=w.id
  WHERE u.auth_user_id=p_auth_user_id
    AND l.currency_type='paid_crystal';

  RETURN COALESCE(v_effective,0);
END;
$paid$;

REVOKE ALL ON FUNCTION public.farm_v1_effective_paid_crystals(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_effective_paid_crystals(uuid)
TO service_role;
-- END reconciled source: 0103_farm_canonical_paid_qualification.sql

-- BEGIN reconciled source: 0104_farm_db_paid_entitlements.sql
CREATE OR REPLACE FUNCTION public.farm_v1_paid_entitlements(
  p_auth_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,core
AS $paid_entitlements$
DECLARE
  v_paid bigint;
BEGIN
  v_paid:=public.farm_v1_effective_paid_crystals(p_auth_user_id);

  RETURN jsonb_build_object(
    'effective_paid_crystals',v_paid,
    'land4',v_paid>=100,
    'land5',v_paid>=300,
    'diting',v_paid>=450,
    'land6',v_paid>=600,
    'qilin',v_paid>=799,
    'exclusive_farmer',v_paid>=999
  );
END;
$paid_entitlements$;

REVOKE ALL ON FUNCTION public.farm_v1_paid_entitlements(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_paid_entitlements(uuid)
TO service_role;
-- END reconciled source: 0104_farm_db_paid_entitlements.sql

-- BEGIN reconciled source: 0105_farm_db_authoritative_paid_mutations.sql
DROP FUNCTION IF EXISTS public.farm_v1_claim_chaos_seed(uuid,text,boolean,boolean,boolean,boolean,timestamptz);
DROP FUNCTION IF EXISTS public.farm_v1_set_farmer_preference(uuid,smallint,boolean,text,boolean,boolean,boolean,boolean,timestamptz);

CREATE OR REPLACE FUNCTION public.farm_v1_claim_chaos_seed(
  p_owner_id uuid,p_idempotency_key text,p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,core AS $claim$
DECLARE
  v_entitlements jsonb; v_anchor timestamptz; v_last_cycle integer; v_current_cycle integer;
  v_fingerprint text; v_existing_type text; v_existing_fingerprint text; v_inserted boolean;
BEGIN
  IF p_owner_id IS NULL OR COALESCE(btrim(p_idempotency_key),'')='' THEN RAISE EXCEPTION 'FARM_CHAOS_CLAIM_INVALID'; END IF;
  v_fingerprint:=encode(extensions.digest(convert_to('claim_chaos_seed','UTF8'),'sha256'),'hex');
  SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint
  FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_type='claim_chaos_seed' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;

  v_entitlements:=public.farm_v1_paid_entitlements(p_owner_id);
  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(
    p_owner_id,(v_entitlements->>'exclusive_farmer')::boolean,(v_entitlements->>'land4')::boolean,
    (v_entitlements->>'land5')::boolean,(v_entitlements->>'land6')::boolean,p_now
  );
  IF NOT (v_entitlements->>'land6')::boolean THEN RETURN jsonb_build_object('result_status','not_entitled'); END IF;

  SELECT unlocked_at INTO v_anchor FROM public.farm_v1_lands WHERE owner_id=p_owner_id AND land_index=6 FOR UPDATE;
  IF v_anchor IS NULL THEN RETURN jsonb_build_object('result_status','locked'); END IF;
  IF p_now<v_anchor THEN RETURN jsonb_build_object('result_status','not_claimable'); END IF;
  SELECT last_chaos_seed_claimed_cycle INTO v_last_cycle FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;
  v_current_cycle:=floor(extract(epoch FROM (p_now-v_anchor))/extract(epoch FROM interval '72 hours'))::integer;
  IF v_current_cycle<=COALESCE(v_last_cycle,-1) THEN RETURN jsonb_build_object('result_status','not_claimable'); END IF;

  INSERT INTO public.farm_v1_operation_records(owner_id,idempotency_key,operation_type,request_fingerprint,recorded_at)
  VALUES(p_owner_id,p_idempotency_key,'claim_chaos_seed',v_fingerprint,p_now)
  ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF NOT COALESCE(v_inserted,false) THEN
    SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint
    FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
    IF v_existing_type='claim_chaos_seed' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity,updated_at) VALUES(p_owner_id,'hun-dun-seed',1,p_now)
  ON CONFLICT(owner_id,item_key) DO UPDATE SET quantity=public.farm_v1_inventory.quantity+1,updated_at=p_now;
  UPDATE public.farm_v1_profiles SET last_chaos_seed_claimed_cycle=v_current_cycle,updated_at=p_now WHERE owner_id=p_owner_id;
  RETURN jsonb_build_object('result_status','created','claimed_cycle',v_current_cycle);
END;
$claim$;

CREATE OR REPLACE FUNCTION public.farm_v1_set_farmer_preference(
  p_owner_id uuid,p_land_index smallint,p_auto_cultivate boolean,p_idempotency_key text,p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,core AS $pref$
DECLARE
  v_entitlements jsonb; v_fingerprint text; v_existing_type text; v_existing_fingerprint text; v_inserted boolean;
BEGIN
  IF p_owner_id IS NULL OR p_land_index NOT BETWEEN 1 AND 6 OR p_auto_cultivate IS NULL OR COALESCE(btrim(p_idempotency_key),'')='' THEN RAISE EXCEPTION 'FARM_FARMER_PREFERENCE_INVALID'; END IF;
  v_fingerprint:=encode(extensions.digest(convert_to('set_farmer_preference:'||p_land_index::text||':'||p_auto_cultivate::text,'UTF8'),'sha256'),'hex');
  SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_type='set_farmer_preference' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate','preferences',public.farm_v1_read_farmer_preferences(p_owner_id)); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;

  v_entitlements:=public.farm_v1_paid_entitlements(p_owner_id);
  IF NOT (v_entitlements->>'exclusive_farmer')::boolean THEN RETURN jsonb_build_object('result_status','not_entitled'); END IF;
  PERFORM public.farm_v1_initialize_farmer_preferences(p_owner_id,p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(
    p_owner_id,true,(v_entitlements->>'land4')::boolean,(v_entitlements->>'land5')::boolean,(v_entitlements->>'land6')::boolean,p_now
  );

  INSERT INTO public.farm_v1_operation_records(owner_id,idempotency_key,operation_type,request_fingerprint,recorded_at)
  VALUES(p_owner_id,p_idempotency_key,'set_farmer_preference',v_fingerprint,p_now) ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF NOT COALESCE(v_inserted,false) THEN
    SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
    IF v_existing_type='set_farmer_preference' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate','preferences',public.farm_v1_read_farmer_preferences(p_owner_id)); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  UPDATE public.farm_v1_farmer_preferences SET auto_cultivate=p_auto_cultivate,updated_at=p_now WHERE owner_id=p_owner_id AND land_index=p_land_index;
  RETURN jsonb_build_object('result_status','created','preferences',public.farm_v1_read_farmer_preferences(p_owner_id));
END;
$pref$;

REVOKE ALL ON FUNCTION public.farm_v1_claim_chaos_seed(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.farm_v1_set_farmer_preference(uuid,smallint,boolean,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_claim_chaos_seed(uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_set_farmer_preference(uuid,smallint,boolean,text,timestamptz) TO service_role;
-- END reconciled source: 0105_farm_db_authoritative_paid_mutations.sql

-- BEGIN reconciled source: 0106_farm_db_authoritative_gameplay.sql
DROP FUNCTION IF EXISTS public.farm_v1_plant_land(uuid,smallint,integer,text,boolean,boolean,boolean,boolean,timestamptz);
DROP FUNCTION IF EXISTS public.farm_v1_harvest_land(uuid,smallint,text,boolean,boolean,boolean,boolean,timestamptz);
DROP FUNCTION IF EXISTS public.farm_v1_feed_pet(uuid,text,text,boolean,boolean,boolean,boolean,boolean,boolean,timestamptz);

CREATE OR REPLACE FUNCTION public.farm_v1_plant_land(
  p_owner_id uuid,p_land_index smallint,p_quantity integer,p_idempotency_key text,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,core AS $
DECLARE
  v_land public.farm_v1_lands; v_seed_key text; v_crop_id text; v_capacity integer;
  v_inventory public.farm_v1_inventory; v_fingerprint text; v_existing_type text;
  v_existing_fingerprint text; v_inserted boolean; v_entitlements jsonb;
BEGIN
  IF p_owner_id IS NULL OR p_land_index NOT BETWEEN 1 AND 6 OR p_quantity IS NULL OR btrim(COALESCE(p_idempotency_key,''))='' THEN RAISE EXCEPTION 'Invalid farm plant request'; END IF;
  v_entitlements:=public.farm_v1_paid_entitlements(p_owner_id);
  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(p_owner_id,(v_entitlements->>'exclusive_farmer')::boolean,(v_entitlements->>'land4')::boolean,(v_entitlements->>'land5')::boolean,(v_entitlements->>'land6')::boolean,p_now);
  v_fingerprint:=encode(extensions.digest(convert_to('plant:' || p_land_index::text || ':' || p_quantity::text,'UTF8'),'sha256'),'hex');
  -- Idempotency is checked before mutable plant state so a successful retry
  -- remains a duplicate after the field has become occupied.
  SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_type='plant' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  IF (p_land_index=4 AND NOT (v_entitlements->>'land4')::boolean) OR (p_land_index=5 AND NOT (v_entitlements->>'land5')::boolean) OR (p_land_index=6 AND NOT (v_entitlements->>'land6')::boolean) THEN RETURN jsonb_build_object('result_status','not_entitled'); END IF;
  SELECT * INTO v_land FROM public.farm_v1_lands WHERE owner_id=p_owner_id AND land_index=p_land_index FOR UPDATE;
  IF v_land.unlocked_at IS NULL THEN RETURN jsonb_build_object('result_status','locked'); END IF;
  IF v_land.planted_at IS NOT NULL THEN RETURN jsonb_build_object('result_status','occupied'); END IF;
  SELECT x.seed_key,x.crop_id,x.capacity INTO v_seed_key,v_crop_id,v_capacity FROM (VALUES
    (1::smallint,'yao-jin-seed','yao-jin-su',20),(2::smallint,'you-ying-seed','yue-hai-tan',10),
    (3::smallint,'zhu-sha-seed','chi-xue-shen',6),(4::smallint,'yao-zi-seed','tian-shu-man',4),
    (5::smallint,'fei-cui-seed','tai-wei-lian',3),(6::smallint,'hun-dun-seed','hun-dun-jing-hua',1)
  ) AS x(land_index,seed_key,crop_id,capacity) WHERE x.land_index=p_land_index;
  IF p_quantity<>v_capacity THEN RETURN jsonb_build_object('result_status','invalid_quantity'); END IF;
  SELECT * INTO v_inventory FROM public.farm_v1_inventory WHERE owner_id=p_owner_id AND item_key=v_seed_key FOR UPDATE;
  IF NOT FOUND OR v_inventory.quantity<p_quantity THEN RETURN jsonb_build_object('result_status','insufficient_inventory'); END IF;
  INSERT INTO public.farm_v1_operation_records(owner_id,idempotency_key,operation_type,request_fingerprint,recorded_at) VALUES(p_owner_id,p_idempotency_key,'plant',v_fingerprint,p_now) ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF NOT COALESCE(v_inserted,false) THEN
    SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
    IF v_existing_type='plant' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  UPDATE public.farm_v1_inventory SET quantity=quantity-p_quantity,updated_at=p_now WHERE owner_id=p_owner_id AND item_key=v_seed_key;
  UPDATE public.farm_v1_lands SET planted_at=p_now,planted_crop_id=v_crop_id,planted_quantity=p_quantity,updated_at=p_now WHERE owner_id=p_owner_id AND land_index=p_land_index;
  RETURN jsonb_build_object('result_status','created');
END; $$;

CREATE OR REPLACE FUNCTION public.farm_v1_harvest_land(
  p_owner_id uuid,p_land_index smallint,p_idempotency_key text,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,core AS $
DECLARE
  v_land public.farm_v1_lands; v_first_entered timestamptz; v_growth_hours integer;
  v_output_quantity integer; v_fingerprint text; v_existing_type text; v_existing_fingerprint text; v_inserted boolean;
BEGIN
  IF p_owner_id IS NULL OR p_land_index NOT BETWEEN 1 AND 6 OR btrim(COALESCE(p_idempotency_key,''))='' THEN RAISE EXCEPTION 'Invalid farm harvest request'; END IF;
  v_entitlements:=public.farm_v1_paid_entitlements(p_owner_id);
  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(p_owner_id,(v_entitlements->>'exclusive_farmer')::boolean,(v_entitlements->>'land4')::boolean,(v_entitlements->>'land5')::boolean,(v_entitlements->>'land6')::boolean,p_now);
  v_fingerprint:=encode(extensions.digest(convert_to('harvest:' || p_land_index::text,'UTF8'),'sha256'),'hex');
  SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_type='harvest' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  SELECT * INTO v_land FROM public.farm_v1_lands WHERE owner_id=p_owner_id AND land_index=p_land_index FOR UPDATE;
  IF v_land.planted_at IS NULL OR v_land.planted_crop_id IS NULL OR v_land.planted_quantity<1 THEN RETURN jsonb_build_object('result_status','empty'); END IF;
  v_growth_hours:=CASE p_land_index WHEN 1 THEN 4 WHEN 2 THEN 6 WHEN 3 THEN 8 WHEN 4 THEN 10 WHEN 5 THEN 12 WHEN 6 THEN 60 END;
  IF p_now < v_land.planted_at + make_interval(hours=>v_growth_hours) THEN RETURN jsonb_build_object('result_status','not_mature'); END IF;
  SELECT first_farm_entered_at INTO v_first_entered FROM public.farm_v1_profiles WHERE owner_id=p_owner_id;
  v_output_quantity:=v_land.planted_quantity;
  IF p_land_index BETWEEN 1 AND 5 AND v_first_entered IS NOT NULL AND p_now < v_first_entered + interval '7 days' THEN v_output_quantity := v_land.planted_quantity * 6; END IF;
  INSERT INTO public.farm_v1_operation_records(owner_id,idempotency_key,operation_type,request_fingerprint,recorded_at) VALUES(p_owner_id,p_idempotency_key,'harvest',v_fingerprint,p_now) ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF NOT COALESCE(v_inserted,false) THEN
    SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
    IF v_existing_type='harvest' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity) VALUES(p_owner_id,v_land.planted_crop_id,v_output_quantity)
  ON CONFLICT(owner_id,item_key) DO UPDATE SET quantity=public.farm_v1_inventory.quantity+EXCLUDED.quantity,updated_at=p_now;
  UPDATE public.farm_v1_lands SET planted_at = NULL,planted_crop_id=NULL,planted_quantity=0,updated_at=p_now WHERE owner_id=p_owner_id AND land_index=p_land_index;
  RETURN jsonb_build_object('result_status','created');
END; $$;

CREATE OR REPLACE FUNCTION public.farm_v1_feed_pet(
  p_owner_id uuid,p_pet_id text,p_idempotency_key text,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,core AS $
DECLARE
  v_portions integer; v_feed public.farm_v1_inventory; v_fingerprint text;
  v_existing_type text; v_existing_fingerprint text; v_inserted boolean; v_entitlements jsonb;
BEGIN
  IF p_owner_id IS NULL OR btrim(COALESCE(p_pet_id,''))='' OR btrim(COALESCE(p_idempotency_key,''))='' THEN RAISE EXCEPTION 'Invalid farm pet feed request'; END IF;
  v_entitlements:=public.farm_v1_paid_entitlements(p_owner_id);
  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(p_owner_id,(v_entitlements->>'exclusive_farmer')::boolean,(v_entitlements->>'land4')::boolean,(v_entitlements->>'land5')::boolean,(v_entitlements->>'land6')::boolean,p_now);
  v_fingerprint:=encode(extensions.digest(convert_to('feed:' || p_pet_id,'UTF8'),'sha256'),'hex');
  -- Idempotency is checked before live pet entitlement so retrying an already
  -- completed feed cannot fail merely because a paid entitlement was later suspended.
  SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing_type='feed' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  IF p_pet_id='shi-shi-di-ting' AND NOT (v_entitlements->>'diting')::boolean THEN RAISE EXCEPTION 'FARM_PET_NOT_ENTITLED'; END IF;
  IF p_pet_id='qian-kun-qi-lin' AND NOT (v_entitlements->>'qilin')::boolean THEN RAISE EXCEPTION 'FARM_PET_NOT_ENTITLED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.farm_v1_owned_pets WHERE owner_id=p_owner_id AND pet_id=p_pet_id) THEN RETURN jsonb_build_object('result_status','not_owned'); END IF;
  v_portions:=CASE p_pet_id WHEN 'xun-xing-quan' THEN 1 WHEN 'bi-xie-suan-ni' THEN 2 WHEN 'shi-shi-di-ting' THEN 3 WHEN 'qian-kun-qi-lin' THEN 4 ELSE NULL END;
  IF v_portions IS NULL THEN RETURN jsonb_build_object('result_status','invalid_pet'); END IF;
  SELECT * INTO v_feed FROM public.farm_v1_inventory WHERE owner_id=p_owner_id AND item_key='tai-yi-wu-gu-san' FOR UPDATE;
  IF NOT FOUND OR v_feed.quantity<v_portions THEN RETURN jsonb_build_object('result_status','insufficient_inventory'); END IF;
  INSERT INTO public.farm_v1_operation_records(owner_id,idempotency_key,operation_type,request_fingerprint,recorded_at) VALUES(p_owner_id,p_idempotency_key,'feed',v_fingerprint,p_now) ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF NOT COALESCE(v_inserted,false) THEN
    SELECT operation_type,request_fingerprint INTO v_existing_type,v_existing_fingerprint FROM public.farm_v1_operation_records WHERE owner_id=p_owner_id AND idempotency_key=p_idempotency_key;
    IF v_existing_type='feed' AND v_existing_fingerprint=v_fingerprint THEN RETURN jsonb_build_object('result_status','duplicate'); END IF;
    RETURN jsonb_build_object('result_status','duplicate_conflict');
  END IF;
  UPDATE public.farm_v1_inventory SET quantity=quantity-v_portions,updated_at=p_now WHERE owner_id=p_owner_id AND item_key='tai-yi-wu-gu-san';
  UPDATE public.farm_v1_pet_care SET fed_at=p_now,resident_pet_id=p_pet_id,updated_at=p_now WHERE owner_id=p_owner_id;
  RETURN jsonb_build_object('result_status','created');
END; $$;

REVOKE ALL ON FUNCTION public.farm_v1_plant_land(uuid,smallint,integer,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.farm_v1_harvest_land(uuid,smallint,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.farm_v1_feed_pet(uuid,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_plant_land(uuid,smallint,integer,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_harvest_land(uuid,smallint,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_feed_pet(uuid,text,text,timestamptz) TO service_role;
-- END reconciled source: 0106_farm_db_authoritative_gameplay.sql

-- BEGIN reconciled source: 0107_farm_db_authoritative_market_unlock.sql
DROP FUNCTION IF EXISTS public.farm_v1_market_purchase(uuid,text,text,boolean,boolean,boolean,boolean,timestamptz);
DROP FUNCTION IF EXISTS public.farm_v1_unlock_land(uuid,smallint,text,boolean,boolean,boolean,boolean,timestamptz);

CREATE OR REPLACE FUNCTION public.farm_v1_market_purchase(
  p_owner_id uuid,
  p_product_id text,
  p_idempotency_key text,
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, core
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
  v_entitlements jsonb;
BEGIN
  IF p_owner_id IS NULL
    OR btrim(COALESCE(p_product_id, '')) = ''
    OR btrim(COALESCE(p_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'Invalid farm market purchase request';
  END IF;

  v_entitlements := public.farm_v1_paid_entitlements(p_owner_id);
  PERFORM public.initialize_farm_v1_runtime(p_owner_id, p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(
    p_owner_id,
    (v_entitlements->>'exclusive_farmer')::boolean,
    (v_entitlements->>'land4')::boolean,
    (v_entitlements->>'land5')::boolean,
    (v_entitlements->>'land6')::boolean,
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
  p_now timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, core
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
  v_entitlements jsonb;
BEGIN
  IF p_owner_id IS NULL
    OR p_land_index NOT IN (2, 3)
    OR btrim(COALESCE(p_idempotency_key, '')) = '' THEN
    RAISE EXCEPTION 'Invalid farm land unlock request';
  END IF;

  v_entitlements := public.farm_v1_paid_entitlements(p_owner_id);
  PERFORM public.initialize_farm_v1_runtime(p_owner_id, p_now);
  PERFORM public.farm_v1_settle_exclusive_farmer(
    p_owner_id,
    (v_entitlements->>'exclusive_farmer')::boolean,
    (v_entitlements->>'land4')::boolean,
    (v_entitlements->>'land5')::boolean,
    (v_entitlements->>'land6')::boolean,
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

REVOKE ALL ON FUNCTION public.farm_v1_market_purchase(uuid,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.farm_v1_unlock_land(uuid,smallint,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_market_purchase(uuid,text,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_unlock_land(uuid,smallint,text,timestamptz) TO service_role;
-- END reconciled source: 0107_farm_db_authoritative_market_unlock.sql

-- BEGIN reconciled source: 0108_farm_db_authoritative_friend_mutations.sql
DROP FUNCTION IF EXISTS public.farm_v1_borrow_luck(uuid,uuid,text,boolean,boolean,boolean,boolean,boolean,boolean,numeric,numeric,timestamptz);
DROP FUNCTION IF EXISTS public.farm_v1_friend_assist_harvest(uuid,uuid,smallint,text,boolean,boolean,boolean,boolean,timestamptz);

-- 0063/0064 deliberately define friend operations without depending on the
-- later exclusive-farmer RPC. After 0071 exists, replace those functions with
-- their final V1 bodies so friend mutations settle the owner's farmer first.

-- Retire the immediately previous overload so no caller can bypass the live
-- milestone entitlement flags introduced by this migration.
DROP FUNCTION IF EXISTS public.farm_v1_borrow_luck(uuid,uuid,text,timestamptz);
DROP FUNCTION IF EXISTS public.farm_v1_borrow_luck(uuid,uuid,text,numeric,numeric,timestamptz);

-- Final V1 borrow contract:
-- lands 2-5 only; mature + 1h protection; highest quantity then lower index;
-- 30% floor, guarded Suanni 21% floor; guarded Qilin 50% blocks the whole action;
-- guarded Diting 30% enables at most one second field; one successful action counts once.
CREATE OR REPLACE FUNCTION public.farm_v1_borrow_luck(
  p_helper_id uuid,
  p_owner_id uuid,
  p_idempotency_key text,
  p_diting_roll numeric,
  p_qilin_roll numeric,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,core AS $borrow_final$
DECLARE
  v_today date:=timezone('Asia/Taipei',p_now)::date;
  v_land record; v_event_id uuid; v_first_land smallint;
  v_helper integer; v_owner integer; v_field_count integer:=0;
  v_total_helper integer:=0; v_total_owner integer:=0;
  v_loss numeric:=0.30; v_max_fields integer:=1;
  v_owner_pet text; v_owner_fed timestamptz; v_helper_pet text; v_helper_fed timestamptz;
  v_attempt integer;
  v_owner_entitlements jsonb; v_helper_entitlements jsonb;
BEGIN
  IF p_helper_id IS NULL OR p_owner_id IS NULL OR p_helper_id=p_owner_id OR nullif(btrim(p_idempotency_key),'') IS NULL
    OR p_diting_roll<0 OR p_diting_roll>=1 OR p_qilin_roll<0 OR p_qilin_roll>=1
  THEN RAISE EXCEPTION 'BORROW_NOT_ALLOWED'; END IF;

  -- Serialize idempotency and quota checks for this helper.
  -- UNIQUE(helper_id,idempotency_key) remains the final database backstop.
  -- Lock both participants in deterministic UUID order to prevent reciprocal
  -- friend actions from deadlocking while farmer settlement locks the owner.
  IF p_helper_id <= p_owner_id THEN
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_helper_id FOR UPDATE;
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_helper_id FOR UPDATE;
  END IF;
  IF EXISTS(SELECT 1 FROM public.farm_v1_friend_action_events WHERE helper_id=p_helper_id AND idempotency_key=p_idempotency_key)
  THEN RETURN jsonb_build_object('status','duplicate'); END IF;


  IF NOT EXISTS(SELECT 1 FROM public.platform_friendships WHERE user_a_id=least(p_helper_id,p_owner_id) AND user_b_id=greatest(p_helper_id,p_owner_id) AND status='active')
  THEN RAISE EXCEPTION 'BORROW_NOT_ALLOWED'; END IF;

  -- Only successful historical actions consume the daily quota. A Qilin block writes no event.
  IF public.farm_v1_borrow_count_today(p_helper_id,p_now)>=5
  THEN RAISE EXCEPTION 'ACTION_DAILY_LIMIT'; END IF;

  v_owner_entitlements:=public.farm_v1_paid_entitlements(p_owner_id);
  v_helper_entitlements:=public.farm_v1_paid_entitlements(p_helper_id);
  PERFORM public.farm_v1_settle_exclusive_farmer(
    p_owner_id,(v_owner_entitlements->>'exclusive_farmer')::boolean,(v_owner_entitlements->>'land4')::boolean,
    (v_owner_entitlements->>'land5')::boolean,(v_owner_entitlements->>'land6')::boolean,p_now
  );
  PERFORM public.farm_v1_read_runtime(p_helper_id,p_now);

  SELECT resident_pet_id,fed_at INTO v_owner_pet,v_owner_fed FROM public.farm_v1_pet_care WHERE owner_id=p_owner_id;
  SELECT resident_pet_id,fed_at INTO v_helper_pet,v_helper_fed FROM public.farm_v1_pet_care WHERE owner_id=p_helper_id;

  IF (v_owner_entitlements->>'qilin')::boolean AND v_owner_pet='qian-kun-qi-lin' AND v_owner_fed IS NOT NULL AND p_now<v_owner_fed+interval '24 hours' AND p_qilin_roll<0.50
  THEN RETURN jsonb_build_object('status','blocked','blockedBy','qian-kun-qi-lin','counted',false); END IF;

  IF v_owner_pet='bi-xie-suan-ni' AND v_owner_fed IS NOT NULL AND p_now<v_owner_fed+interval '24 hours' THEN v_loss:=0.21; END IF;
  IF (v_helper_entitlements->>'diting')::boolean AND v_helper_pet='shi-shi-di-ting' AND v_helper_fed IS NOT NULL AND p_now<v_helper_fed+interval '24 hours' AND p_diting_roll<0.30 THEN v_max_fields:=2; END IF;

  -- Select and lock one field at a time. If Diting activates, the second field is
  -- re-ranked only after the first field mutation has completed.
  FOR v_attempt IN 1..v_max_fields LOOP
    SELECT land.* INTO v_land FROM public.farm_v1_lands land
    WHERE land.owner_id=p_owner_id
      AND land.land_index BETWEEN 2 AND 5
      AND land.planted_quantity>1
      AND (v_first_land IS NULL OR land.land_index<>v_first_land)
      AND p_now>=land.planted_at+CASE land.planted_crop_id
        WHEN 'yue-hai-tan' THEN interval '7 hours'
        WHEN 'chi-xue-shen' THEN interval '9 hours'
        WHEN 'tian-shu-man' THEN interval '11 hours'
        WHEN 'tai-wei-lian' THEN interval '13 hours'
        ELSE interval '100 years' END
    ORDER BY land.planted_quantity DESC,land.land_index ASC
    LIMIT 1 FOR UPDATE;

    IF NOT FOUND THEN EXIT; END IF;

    v_helper:=least(floor(v_land.planted_quantity*v_loss)::integer,v_land.planted_quantity-1);
    IF v_helper<1 THEN EXIT; END IF;
    v_owner:=v_land.planted_quantity-v_helper;

    UPDATE public.farm_v1_lands
    SET planted_quantity=v_owner,updated_at=p_now
    WHERE owner_id=p_owner_id AND land_index=v_land.land_index;

    INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity)
    VALUES(p_helper_id,v_land.planted_crop_id,v_helper)
    ON CONFLICT(owner_id,item_key) DO UPDATE
    SET quantity=farm_v1_inventory.quantity+excluded.quantity,updated_at=p_now;

    IF v_first_land IS NULL THEN
      v_first_land:=v_land.land_index;
      INSERT INTO public.farm_v1_friend_action_events(
        helper_id,owner_id,land_index,action_type,crop_id,helper_crop_quantity,
        owner_crop_quantity,taiwan_date,idempotency_key,created_at
      ) VALUES(
        p_helper_id,p_owner_id,v_land.land_index,'borrow',v_land.planted_crop_id,
        v_helper,v_owner,v_today,p_idempotency_key,p_now
      ) RETURNING id INTO v_event_id;
    ELSE
      INSERT INTO public.farm_v1_friend_action_extra_lands(event_id,land_index)
      VALUES(v_event_id,v_land.land_index);
    END IF;

    v_field_count:=v_field_count+1;
    v_total_helper:=v_total_helper+v_helper;
    v_total_owner:=v_total_owner+v_owner;
  END LOOP;
  IF v_first_land IS NULL THEN RAISE EXCEPTION 'BORROW_NOT_AVAILABLE'; END IF;
  RETURN jsonb_build_object('status','created','landIndex',v_first_land,'helperCropQuantity',v_total_helper,'ownerCropQuantity',v_total_owner,'secondFieldApplied',v_field_count=2,'counted',true);
END; $borrow_final$;

REVOKE ALL ON FUNCTION public.farm_v1_borrow_luck(uuid,uuid,text,numeric,numeric,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_borrow_luck(uuid,uuid,text,numeric,numeric,timestamptz) TO service_role;



-- Final V1 assist contract:
-- lands 1-6; assist is available immediately at maturity;
-- owner receives 100% of actual harvest; helper receives a system-created ceil(10%) bonus
-- for ordinary crops; land 6 helper bonus is always 0.
CREATE OR REPLACE FUNCTION public.farm_v1_friend_assist_harvest(
  p_helper_id uuid,
  p_owner_id uuid,
  p_land_index smallint,
  p_idempotency_key text,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,core AS $assist_final$
DECLARE
  v_today date:=timezone('Asia/Taipei',p_now)::date;
  v_land public.farm_v1_lands;
  v_growth interval;
  v_owner_quantity integer;
  v_helper_quantity integer;
  v_blessing boolean:=false;
  v_owner_entitlements jsonb;
BEGIN
  IF p_helper_id IS NULL OR p_owner_id IS NULL OR p_helper_id=p_owner_id
    OR p_land_index NOT BETWEEN 1 AND 6 OR nullif(btrim(p_idempotency_key),'') IS NULL
  THEN RAISE EXCEPTION 'ASSIST_NOT_ALLOWED'; END IF;

  IF NOT EXISTS(SELECT 1 FROM public.platform_friendships
    WHERE user_a_id=least(p_helper_id,p_owner_id) AND user_b_id=greatest(p_helper_id,p_owner_id) AND status='active')
  THEN RAISE EXCEPTION 'ASSIST_NOT_ALLOWED'; END IF;

  -- Serialize idempotency and quota checks for this helper.
  -- UNIQUE(helper_id,idempotency_key) remains the final database backstop.
  -- Lock both participants in deterministic UUID order to prevent reciprocal
  -- friend actions from deadlocking while farmer settlement locks the owner.
  IF p_helper_id <= p_owner_id THEN
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_helper_id FOR UPDATE;
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_helper_id FOR UPDATE;
  END IF;
  IF EXISTS(SELECT 1 FROM public.farm_v1_friend_action_events WHERE helper_id=p_helper_id AND idempotency_key=p_idempotency_key)
  THEN RETURN jsonb_build_object('status','duplicate'); END IF;

  IF public.farm_v1_friend_assist_count_today(p_helper_id,p_now)>=5
  THEN RAISE EXCEPTION 'ACTION_DAILY_LIMIT'; END IF;

  v_owner_entitlements:=public.farm_v1_paid_entitlements(p_owner_id);
  PERFORM public.farm_v1_settle_exclusive_farmer(
    p_owner_id,(v_owner_entitlements->>'exclusive_farmer')::boolean,(v_owner_entitlements->>'land4')::boolean,
    (v_owner_entitlements->>'land5')::boolean,(v_owner_entitlements->>'land6')::boolean,p_now
  );
  PERFORM public.farm_v1_read_runtime(p_helper_id,p_now);

  SELECT * INTO v_land FROM public.farm_v1_lands
  WHERE owner_id=p_owner_id AND land_index=p_land_index FOR UPDATE;

  IF NOT FOUND OR v_land.planted_at IS NULL OR v_land.planted_crop_id IS NULL OR v_land.planted_quantity<1
  THEN RAISE EXCEPTION 'ASSIST_NOT_MATURE'; END IF;

  v_growth:=CASE v_land.planted_crop_id
    WHEN 'yao-jin-su' THEN interval '4 hours'
    WHEN 'yue-hai-tan' THEN interval '6 hours'
    WHEN 'chi-xue-shen' THEN interval '8 hours'
    WHEN 'tian-shu-man' THEN interval '10 hours'
    WHEN 'tai-wei-lian' THEN interval '12 hours'
    WHEN 'hun-dun-jing-hua' THEN interval '60 hours'
    ELSE NULL END;
  IF v_growth IS NULL OR p_now<v_land.planted_at+v_growth THEN RAISE EXCEPTION 'ASSIST_NOT_MATURE'; END IF;

  -- Blessing belongs to the owner and is evaluated at the actual assisted harvest timestamp.
  IF p_land_index BETWEEN 1 AND 5 THEN
    SELECT p_now>=first_farm_entered_at AND p_now<first_farm_entered_at+interval '7 days'
    INTO v_blessing FROM public.farm_v1_profiles WHERE owner_id=p_owner_id;
  END IF;

  v_owner_quantity:=v_land.planted_quantity*CASE WHEN coalesce(v_blessing,false) THEN 6 ELSE 1 END;
  v_helper_quantity:=CASE WHEN p_land_index=6 THEN 0 ELSE ceil(v_owner_quantity*0.10)::integer END;

  UPDATE public.farm_v1_lands SET planted_at=NULL,planted_crop_id=NULL,planted_quantity=0,updated_at=p_now
  WHERE owner_id=p_owner_id AND land_index=p_land_index;

  INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity)
  VALUES(p_owner_id,v_land.planted_crop_id,v_owner_quantity)
  ON CONFLICT(owner_id,item_key) DO UPDATE SET quantity=farm_v1_inventory.quantity+excluded.quantity,updated_at=p_now;

  IF v_helper_quantity>0 THEN
    INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity)
    VALUES(p_helper_id,v_land.planted_crop_id,v_helper_quantity)
    ON CONFLICT(owner_id,item_key) DO UPDATE SET quantity=farm_v1_inventory.quantity+excluded.quantity,updated_at=p_now;
  END IF;

  INSERT INTO public.farm_v1_friend_action_events(
    helper_id,owner_id,land_index,action_type,crop_id,helper_crop_quantity,owner_crop_quantity,taiwan_date,idempotency_key,created_at
  ) VALUES(
    p_helper_id,p_owner_id,p_land_index,'assist',v_land.planted_crop_id,
    v_helper_quantity,v_owner_quantity,v_today,p_idempotency_key,p_now
  );

  RETURN jsonb_build_object(
    'status','created','cropId',v_land.planted_crop_id,'landIndex',p_land_index,
    'helperCropQuantity',v_helper_quantity,'ownerCropQuantity',v_owner_quantity,
    'blessingApplied',coalesce(v_blessing,false),'counted',true
  );
END; $assist_final$;

REVOKE ALL ON FUNCTION public.farm_v1_friend_assist_harvest(uuid,uuid,smallint,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_friend_assist_harvest(uuid,uuid,smallint,text,timestamptz) TO service_role;
-- END reconciled source: 0108_farm_db_authoritative_friend_mutations.sql

-- BEGIN reconciled source: 0109_farm_db_authoritative_entry_settlement.sql
DROP FUNCTION IF EXISTS public.farm_v1_settle_exclusive_farmer(uuid,boolean,boolean,boolean,boolean,timestamptz);
DROP FUNCTION IF EXISTS public.farm_v1_apply_paid_milestones(uuid,boolean,boolean,boolean,boolean,boolean,timestamptz);


CREATE OR REPLACE FUNCTION public.farm_v1_settle_exclusive_farmer(
  p_owner_id uuid,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,core
AS $farmer$
DECLARE
  v_land public.farm_v1_lands;
  v_growth interval;
  v_seed_key text;
  v_capacity integer;
  v_seed_quantity integer;
  v_harvest_quantity integer;
  v_maturity timestamptz;
  v_blessing boolean;
  v_auto boolean;
  v_entitlements jsonb;
BEGIN
  IF p_owner_id IS NULL THEN RAISE EXCEPTION 'FARM_FARMER_SETTLEMENT_INVALID'; END IF;

  v_entitlements:=public.farm_v1_paid_entitlements(p_owner_id);

  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);
  PERFORM public.farm_v1_initialize_farmer_preferences(p_owner_id,p_now);

  -- One owner profile lock serializes page-entry and friend-triggered settlements.
  PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;

  IF NOT (v_entitlements->>'exclusive_farmer')::boolean THEN
    RETURN public.farm_v1_read_runtime(p_owner_id,p_now);
  END IF;

  FOR v_land IN
    SELECT * FROM public.farm_v1_lands
    WHERE owner_id=p_owner_id
    ORDER BY land_index
    FOR UPDATE
  LOOP
    SELECT auto_cultivate INTO v_auto
    FROM public.farm_v1_farmer_preferences
    WHERE owner_id=p_owner_id AND land_index=v_land.land_index;

    IF NOT coalesce(v_auto,true) OR v_land.unlocked_at IS NULL THEN CONTINUE; END IF;
    IF v_land.land_index=4 AND NOT (v_entitlements->>'land4')::boolean THEN CONTINUE; END IF;
    IF v_land.land_index=5 AND NOT (v_entitlements->>'land5')::boolean THEN CONTINUE; END IF;
    IF v_land.land_index=6 AND NOT (v_entitlements->>'land6')::boolean THEN CONTINUE; END IF;

    v_capacity:=CASE v_land.land_index WHEN 1 THEN 20 WHEN 2 THEN 10 WHEN 3 THEN 6 WHEN 4 THEN 4 WHEN 5 THEN 3 WHEN 6 THEN 1 END;
    v_growth:=CASE v_land.land_index
      WHEN 1 THEN interval '4 hours' WHEN 2 THEN interval '6 hours'
      WHEN 3 THEN interval '8 hours' WHEN 4 THEN interval '10 hours'
      WHEN 5 THEN interval '12 hours' WHEN 6 THEN interval '60 hours' END;
    v_seed_key:=CASE v_land.land_index
      WHEN 1 THEN 'yao-jin-seed' WHEN 2 THEN 'you-ying-seed' WHEN 3 THEN 'zhu-sha-seed'
      WHEN 4 THEN 'yao-zi-seed' WHEN 5 THEN 'fei-cui-seed' WHEN 6 THEN 'hun-dun-seed' END;

    IF v_land.planted_at IS NULL THEN
      SELECT quantity INTO v_seed_quantity FROM public.farm_v1_inventory
      WHERE owner_id=p_owner_id AND item_key=v_seed_key FOR UPDATE;
      IF coalesce(v_seed_quantity,0)<v_capacity THEN CONTINUE; END IF;
      UPDATE public.farm_v1_inventory SET quantity=quantity-v_capacity,updated_at=p_now
      WHERE owner_id=p_owner_id AND item_key=v_seed_key;
      UPDATE public.farm_v1_lands SET planted_at=p_now,
        planted_crop_id=CASE v_land.land_index
          WHEN 1 THEN 'yao-jin-su' WHEN 2 THEN 'yue-hai-tan' WHEN 3 THEN 'chi-xue-shen'
          WHEN 4 THEN 'tian-shu-man' WHEN 5 THEN 'tai-wei-lian' WHEN 6 THEN 'hun-dun-jing-hua' END,
        planted_quantity=v_capacity,updated_at=p_now
      WHERE owner_id=p_owner_id AND land_index=v_land.land_index;
      CONTINUE;
    END IF;

    -- A field mutated by borrowing may hold less than a full batch. The farmer
    -- harvests that remaining crop once, then every automatic replant returns
    -- to the canonical full-batch capacity.
    v_maturity:=v_land.planted_at+v_growth;
    WHILE v_maturity<=p_now LOOP
      v_blessing:=false;
      IF v_land.land_index BETWEEN 1 AND 5 THEN
        SELECT v_maturity>=first_farm_entered_at AND v_maturity<first_farm_entered_at+interval '7 days'
        INTO v_blessing FROM public.farm_v1_profiles WHERE owner_id=p_owner_id;
      END IF;
      -- The exclusive farmer harvests at the scheduled maturity timestamp.
      -- Mature crops do not decay naturally; the separate one-hour rule only
      -- controls when lands 2-5 become eligible for friend borrowing.
      v_harvest_quantity:=v_land.planted_quantity*CASE WHEN v_blessing THEN 6 ELSE 1 END;
      INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity)
      VALUES(p_owner_id,v_land.planted_crop_id,v_harvest_quantity)
      ON CONFLICT(owner_id,item_key) DO UPDATE
      SET quantity=farm_v1_inventory.quantity+excluded.quantity,updated_at=p_now;

      SELECT quantity INTO v_seed_quantity FROM public.farm_v1_inventory
      WHERE owner_id=p_owner_id AND item_key=v_seed_key FOR UPDATE;
      IF coalesce(v_seed_quantity,0)<v_capacity THEN
        UPDATE public.farm_v1_lands SET planted_at=NULL,planted_crop_id=NULL,planted_quantity=0,updated_at=p_now
        WHERE owner_id=p_owner_id AND land_index=v_land.land_index;
        EXIT;
      END IF;

      UPDATE public.farm_v1_inventory SET quantity=quantity-v_capacity,updated_at=p_now
      WHERE owner_id=p_owner_id AND item_key=v_seed_key;
      UPDATE public.farm_v1_lands
      SET planted_at=v_maturity,planted_crop_id=CASE v_land.land_index
            WHEN 1 THEN 'yao-jin-su' WHEN 2 THEN 'yue-hai-tan' WHEN 3 THEN 'chi-xue-shen'
            WHEN 4 THEN 'tian-shu-man' WHEN 5 THEN 'tai-wei-lian' WHEN 6 THEN 'hun-dun-jing-hua' END,
          planted_quantity=v_capacity,updated_at=p_now
      WHERE owner_id=p_owner_id AND land_index=v_land.land_index;
      v_land.planted_at:=v_maturity;
      v_land.planted_crop_id:=CASE v_land.land_index
        WHEN 1 THEN 'yao-jin-su' WHEN 2 THEN 'yue-hai-tan' WHEN 3 THEN 'chi-xue-shen'
        WHEN 4 THEN 'tian-shu-man' WHEN 5 THEN 'tai-wei-lian' WHEN 6 THEN 'hun-dun-jing-hua' END;
      v_land.planted_quantity:=v_capacity;
      v_maturity:=v_maturity+v_growth;
    END LOOP;
  END LOOP;

  RETURN public.farm_v1_read_runtime(p_owner_id,p_now);
END;
$farmer$;

REVOKE ALL ON FUNCTION public.farm_v1_settle_exclusive_farmer(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_settle_exclusive_farmer(uuid,timestamptz) TO service_role;



CREATE OR REPLACE FUNCTION public.farm_v1_apply_paid_milestones(
  p_owner_id uuid,
  p_now timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,core AS $$
DECLARE
  v_entitlements jsonb;
BEGIN
  IF p_owner_id IS NULL
  THEN RAISE EXCEPTION 'FARM_PAID_MILESTONE_INVALID'; END IF;

  v_entitlements:=public.farm_v1_paid_entitlements(p_owner_id);
  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);

  -- Milestone qualification grants persistent ownership/unlock state once.
  -- Refunds suspend entitlement elsewhere; they never erase persisted state.
  IF (v_entitlements->>'land4')::boolean THEN
    UPDATE public.farm_v1_lands
    SET unlocked_at=COALESCE(unlocked_at,p_now),updated_at=p_now
    WHERE owner_id=p_owner_id AND land_index=4;
  END IF;
  IF (v_entitlements->>'land5')::boolean THEN
    UPDATE public.farm_v1_lands
    SET unlocked_at=COALESCE(unlocked_at,p_now),updated_at=p_now
    WHERE owner_id=p_owner_id AND land_index=5;
  END IF;
  IF (v_entitlements->>'land6')::boolean THEN
    UPDATE public.farm_v1_lands
    SET unlocked_at=COALESCE(unlocked_at,p_now),updated_at=p_now
    WHERE owner_id=p_owner_id AND land_index=6;
  END IF;

  IF (v_entitlements->>'diting')::boolean THEN
    INSERT INTO public.farm_v1_owned_pets(owner_id,pet_id,obtained_at)
    VALUES(p_owner_id,'shi-shi-di-ting',p_now)
    ON CONFLICT(owner_id,pet_id) DO NOTHING;
  END IF;
  IF (v_entitlements->>'qilin')::boolean THEN
    INSERT INTO public.farm_v1_owned_pets(owner_id,pet_id,obtained_at)
    VALUES(p_owner_id,'qian-kun-qi-lin',p_now)
    ON CONFLICT(owner_id,pet_id) DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.farm_v1_apply_paid_milestones(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_apply_paid_milestones(uuid,timestamptz) TO service_role;
-- END reconciled source: 0109_farm_db_authoritative_entry_settlement.sql

COMMIT;
