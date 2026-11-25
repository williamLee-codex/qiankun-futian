BEGIN;

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

COMMIT;
