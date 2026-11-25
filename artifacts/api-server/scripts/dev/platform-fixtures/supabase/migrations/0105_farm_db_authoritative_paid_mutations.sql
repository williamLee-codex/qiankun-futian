BEGIN;

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

COMMIT;
