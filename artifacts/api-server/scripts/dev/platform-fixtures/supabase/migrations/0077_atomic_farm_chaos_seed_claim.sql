BEGIN;

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

COMMIT;
