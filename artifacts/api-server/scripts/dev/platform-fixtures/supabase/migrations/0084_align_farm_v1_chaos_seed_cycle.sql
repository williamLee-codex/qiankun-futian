BEGIN;

ALTER TABLE public.farm_v1_profiles
  ADD COLUMN IF NOT EXISTS last_chaos_seed_claimed_cycle integer;

ALTER TABLE public.farm_v1_profiles
  DROP CONSTRAINT IF EXISTS farm_v1_profiles_chaos_cycle_check;

ALTER TABLE public.farm_v1_profiles
  ADD CONSTRAINT farm_v1_profiles_chaos_cycle_check
  CHECK (last_chaos_seed_claimed_cycle IS NULL OR last_chaos_seed_claimed_cycle >= 0);

CREATE OR REPLACE FUNCTION public.farm_v1_read_runtime(
  p_owner_id uuid,
  p_initialized_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.initialize_farm_v1_runtime(p_owner_id, p_initialized_at);

  RETURN jsonb_build_object(
    'ownerId', p_owner_id::text,
    'lastChaosSeedClaimedCycle',
      (SELECT last_chaos_seed_claimed_cycle FROM public.farm_v1_profiles WHERE owner_id = p_owner_id),
    'inventory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('itemKey', item_key, 'quantity', quantity) ORDER BY item_key)
      FROM public.farm_v1_inventory WHERE owner_id = p_owner_id
    ), '[]'::jsonb),
    'lands', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'landIndex', land_index, 'unlockedAt', unlocked_at, 'plantedAt', planted_at,
        'plantedCropId', planted_crop_id, 'plantedQuantity', planted_quantity
      ) ORDER BY land_index)
      FROM public.farm_v1_lands WHERE owner_id = p_owner_id
    ), '[]'::jsonb),
    'ownedPetIds', COALESCE((
      SELECT jsonb_agg(pet_id ORDER BY pet_id)
      FROM public.farm_v1_owned_pets WHERE owner_id = p_owner_id
    ), '[]'::jsonb),
    'petCare', COALESCE((
      SELECT jsonb_build_object(
        'fedAt', fed_at, 'patrolPetId', patrol_pet_id,
        'patrolStartedAt', patrol_started_at, 'recoveryUntil', recovery_until
      )
      FROM public.farm_v1_pet_care WHERE owner_id = p_owner_id
    ), jsonb_build_object(
      'fedAt', null, 'patrolPetId', null, 'patrolStartedAt', null, 'recoveryUntil', null
    )),
    'operationRecords', '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.farm_v1_save_runtime(
  p_runtime jsonb,
  p_operation_type text,
  p_idempotency_key text,
  p_recorded_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id uuid := (p_runtime->>'ownerId')::uuid;
  v_inserted boolean;
  v_existing_fingerprint text;
  v_request_fingerprint text;
BEGIN
  IF v_owner_id IS NULL
    OR coalesce(btrim(p_operation_type), '') = ''
    OR coalesce(btrim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Invalid farm V1 operation';
  END IF;

  v_request_fingerprint := encode(
    extensions.digest(convert_to(p_operation_type || ':' || p_runtime::text, 'UTF8'), 'sha256'),
    'hex'
  );

  PERFORM public.initialize_farm_v1_runtime(v_owner_id, p_recorded_at);

  INSERT INTO public.farm_v1_operation_records(
    owner_id, idempotency_key, operation_type, request_fingerprint, recorded_at
  )
  VALUES(v_owner_id, p_idempotency_key, p_operation_type, v_request_fingerprint, p_recorded_at)
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT coalesce(v_inserted, false) THEN
    SELECT request_fingerprint INTO v_existing_fingerprint
    FROM public.farm_v1_operation_records
    WHERE owner_id = v_owner_id AND idempotency_key = p_idempotency_key;

    IF v_existing_fingerprint = v_request_fingerprint THEN
      RETURN public.farm_v1_read_runtime(v_owner_id, p_recorded_at);
    END IF;
    RETURN jsonb_build_object('result_status', 'duplicate_conflict');
  END IF;

  INSERT INTO public.farm_v1_lands(
    owner_id, land_index, unlocked_at, planted_at, planted_crop_id, planted_quantity
  )
  SELECT v_owner_id,
    (land->>'landIndex')::smallint,
    nullif(land->>'unlockedAt', '')::timestamptz,
    nullif(land->>'plantedAt', '')::timestamptz,
    nullif(land->>'plantedCropId', ''),
    (land->>'plantedQuantity')::integer
  FROM jsonb_array_elements(p_runtime->'lands') AS land
  ON CONFLICT(owner_id, land_index) DO UPDATE
  SET unlocked_at=EXCLUDED.unlocked_at, planted_at=EXCLUDED.planted_at,
      planted_crop_id=EXCLUDED.planted_crop_id, planted_quantity=EXCLUDED.planted_quantity,
      updated_at=now();

  INSERT INTO public.farm_v1_inventory(owner_id, item_key, quantity)
  SELECT v_owner_id, item->>'itemKey', (item->>'quantity')::integer
  FROM jsonb_array_elements(p_runtime->'inventory') AS item
  ON CONFLICT(owner_id, item_key) DO UPDATE
  SET quantity=EXCLUDED.quantity, updated_at=now();

  UPDATE public.farm_v1_profiles
  SET last_chaos_seed_claimed_cycle =
        nullif(p_runtime->>'lastChaosSeedClaimedCycle', '')::integer,
      updated_at=now()
  WHERE owner_id=v_owner_id;

  UPDATE public.farm_v1_pet_care
  SET fed_at=(p_runtime->'petCare'->>'fedAt')::timestamptz,
      patrol_pet_id=p_runtime->'petCare'->>'patrolPetId',
      patrol_started_at=(p_runtime->'petCare'->>'patrolStartedAt')::timestamptz,
      recovery_until=(p_runtime->'petCare'->>'recoveryUntil')::timestamptz,
      updated_at=now()
  WHERE owner_id=v_owner_id;

  RETURN public.farm_v1_read_runtime(v_owner_id, p_recorded_at);
END;
$$;

REVOKE ALL ON FUNCTION public.farm_v1_read_runtime(uuid, timestamptz),
  public.farm_v1_save_runtime(jsonb, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_read_runtime(uuid, timestamptz),
  public.farm_v1_save_runtime(jsonb, text, text, timestamptz)
  TO service_role;

COMMIT;
