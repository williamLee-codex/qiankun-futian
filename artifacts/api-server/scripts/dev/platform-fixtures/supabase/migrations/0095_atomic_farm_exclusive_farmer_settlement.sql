BEGIN;

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

COMMIT;
