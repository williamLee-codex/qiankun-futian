BEGIN;

-- The application serializes Farm V1 runtime with camelCase property names.
-- jsonb_to_recordset matches key names exactly, so map those names explicitly
-- before upserting the snake_case database columns.
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
BEGIN
  IF v_owner_id IS NULL
    OR coalesce(btrim(p_operation_type), '') = ''
    OR coalesce(btrim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Invalid farm V1 operation';
  END IF;

  PERFORM public.initialize_farm_v1_runtime(v_owner_id, p_recorded_at);

  INSERT INTO farm_v1_operation_records (
    owner_id,
    idempotency_key,
    operation_type,
    recorded_at
  )
  VALUES (v_owner_id, p_idempotency_key, p_operation_type, p_recorded_at)
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT coalesce(v_inserted, false) THEN
    RETURN public.farm_v1_read_runtime(v_owner_id, p_recorded_at);
  END IF;

  INSERT INTO farm_v1_lands (
    owner_id,
    land_index,
    unlocked_at,
    planted_at,
    planted_crop_id,
    planted_quantity
  )
  SELECT
    v_owner_id,
    x."landIndex",
    x."unlockedAt",
    x."plantedAt",
    x."plantedCropId",
    x."plantedQuantity"
  FROM jsonb_to_recordset(p_runtime->'lands') AS x(
    "landIndex" smallint,
    "unlockedAt" timestamptz,
    "plantedAt" timestamptz,
    "plantedCropId" text,
    "plantedQuantity" integer
  )
  ON CONFLICT (owner_id, land_index) DO UPDATE
  SET
    unlocked_at = EXCLUDED.unlocked_at,
    planted_at = EXCLUDED.planted_at,
    planted_crop_id = EXCLUDED.planted_crop_id,
    planted_quantity = EXCLUDED.planted_quantity,
    updated_at = now();

  INSERT INTO farm_v1_inventory (owner_id, item_key, quantity)
  SELECT v_owner_id, x."itemKey", x.quantity
  FROM jsonb_to_recordset(p_runtime->'inventory') AS x(
    "itemKey" text,
    quantity integer
  )
  ON CONFLICT (owner_id, item_key) DO UPDATE
  SET quantity = EXCLUDED.quantity, updated_at = now();

  UPDATE farm_v1_profiles
  SET
    last_chaos_seed_granted_taiwan_date =
      nullif(p_runtime->>'lastChaosSeedGrantedTaiwanDate', '')::date,
    updated_at = now()
  WHERE owner_id = v_owner_id;

  UPDATE farm_v1_pet_care
  SET
    fed_at = (p_runtime->'petCare'->>'fedAt')::timestamptz,
    patrol_pet_id = p_runtime->'petCare'->>'patrolPetId',
    patrol_started_at = (p_runtime->'petCare'->>'patrolStartedAt')::timestamptz,
    recovery_until = (p_runtime->'petCare'->>'recoveryUntil')::timestamptz,
    updated_at = now()
  WHERE owner_id = v_owner_id;

  RETURN public.farm_v1_read_runtime(v_owner_id, p_recorded_at);
END;
$$;

REVOKE ALL ON FUNCTION public.farm_v1_save_runtime(jsonb, text, text, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_v1_save_runtime(jsonb, text, text, timestamptz)
  TO service_role;

COMMIT;
