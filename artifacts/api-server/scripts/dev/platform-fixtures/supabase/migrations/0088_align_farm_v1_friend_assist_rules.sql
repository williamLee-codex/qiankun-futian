BEGIN;

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

COMMIT;
