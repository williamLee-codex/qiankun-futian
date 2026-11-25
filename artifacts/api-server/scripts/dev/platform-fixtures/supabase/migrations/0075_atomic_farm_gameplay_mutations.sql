BEGIN;

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

COMMIT;
