BEGIN;

CREATE OR REPLACE FUNCTION public.farm_v1_read_runtime(
  p_owner_id uuid,
  p_initialized_at timestamptz DEFAULT now()
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.initialize_farm_v1_runtime(p_owner_id, p_initialized_at);
  RETURN jsonb_build_object(
    'ownerId', p_owner_id::text,
    'lastChaosSeedGrantedTaiwanDate', (SELECT last_chaos_seed_granted_taiwan_date::text FROM farm_v1_profiles WHERE owner_id = p_owner_id),
    'inventory', COALESCE((SELECT jsonb_agg(jsonb_build_object('itemKey', item_key, 'quantity', quantity) ORDER BY item_key) FROM farm_v1_inventory WHERE owner_id = p_owner_id), '[]'::jsonb),
    'lands', COALESCE((SELECT jsonb_agg(jsonb_build_object('landIndex', land_index, 'unlockedAt', unlocked_at, 'plantedAt', planted_at, 'plantedCropId', planted_crop_id, 'plantedQuantity', planted_quantity) ORDER BY land_index) FROM farm_v1_lands WHERE owner_id = p_owner_id), '[]'::jsonb),
    'ownedPetIds', COALESCE((SELECT jsonb_agg(pet_id ORDER BY pet_id) FROM farm_v1_owned_pets WHERE owner_id = p_owner_id), '[]'::jsonb),
    'petCare', COALESCE((SELECT jsonb_build_object('fedAt', fed_at, 'patrolPetId', patrol_pet_id, 'patrolStartedAt', patrol_started_at, 'recoveryUntil', recovery_until) FROM farm_v1_pet_care WHERE owner_id = p_owner_id), jsonb_build_object('fedAt', null, 'patrolPetId', null, 'patrolStartedAt', null, 'recoveryUntil', null)),
    'operationRecords', '[]'::jsonb
  );
END; $$;

CREATE OR REPLACE FUNCTION public.farm_v1_save_runtime(
  p_runtime jsonb,
  p_operation_type text,
  p_idempotency_key text,
  p_recorded_at timestamptz DEFAULT now()
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner_id uuid := (p_runtime->>'ownerId')::uuid; v_inserted boolean;
BEGIN
  IF v_owner_id IS NULL OR coalesce(btrim(p_operation_type), '') = '' OR coalesce(btrim(p_idempotency_key), '') = '' THEN RAISE EXCEPTION 'Invalid farm V1 operation'; END IF;
  PERFORM public.initialize_farm_v1_runtime(v_owner_id, p_recorded_at);
  INSERT INTO farm_v1_operation_records(owner_id, idempotency_key, operation_type, recorded_at) VALUES(v_owner_id, p_idempotency_key, p_operation_type, p_recorded_at) ON CONFLICT DO NOTHING RETURNING true INTO v_inserted;
  IF NOT coalesce(v_inserted, false) THEN RETURN public.farm_v1_read_runtime(v_owner_id, p_recorded_at); END IF;
  INSERT INTO farm_v1_lands(owner_id, land_index, unlocked_at, planted_at, planted_crop_id, planted_quantity)
  SELECT v_owner_id, x.land_index, x.unlocked_at, x.planted_at, x.planted_crop_id, x.planted_quantity FROM jsonb_to_recordset(p_runtime->'lands') AS x(land_index smallint, unlocked_at timestamptz, planted_at timestamptz, planted_crop_id text, planted_quantity integer)
  ON CONFLICT(owner_id, land_index) DO UPDATE SET unlocked_at=EXCLUDED.unlocked_at, planted_at=EXCLUDED.planted_at, planted_crop_id=EXCLUDED.planted_crop_id, planted_quantity=EXCLUDED.planted_quantity, updated_at=now();
  INSERT INTO farm_v1_inventory(owner_id, item_key, quantity)
  SELECT v_owner_id, x.item_key, x.quantity FROM jsonb_to_recordset(p_runtime->'inventory') AS x(item_key text, quantity integer)
  ON CONFLICT(owner_id, item_key) DO UPDATE SET quantity=EXCLUDED.quantity, updated_at=now();
  UPDATE farm_v1_profiles SET last_chaos_seed_granted_taiwan_date = nullif(p_runtime->>'lastChaosSeedGrantedTaiwanDate','')::date, updated_at=now() WHERE owner_id=v_owner_id;
  UPDATE farm_v1_pet_care SET fed_at=(p_runtime->'petCare'->>'fedAt')::timestamptz, patrol_pet_id=p_runtime->'petCare'->>'patrolPetId', patrol_started_at=(p_runtime->'petCare'->>'patrolStartedAt')::timestamptz, recovery_until=(p_runtime->'petCare'->>'recoveryUntil')::timestamptz, updated_at=now() WHERE owner_id=v_owner_id;
  RETURN public.farm_v1_read_runtime(v_owner_id, p_recorded_at);
END; $$;

REVOKE ALL ON FUNCTION public.farm_v1_read_runtime(uuid, timestamptz), public.farm_v1_save_runtime(jsonb, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_v1_read_runtime(uuid, timestamptz), public.farm_v1_save_runtime(jsonb, text, text, timestamptz) TO service_role;

COMMIT;
