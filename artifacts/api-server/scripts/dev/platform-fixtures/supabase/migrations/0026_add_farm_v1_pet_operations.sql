BEGIN;

ALTER TABLE public.farm_v1_pet_care
  ADD COLUMN IF NOT EXISTS resident_pet_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'farm_v1_pet_care_resident_pet_check'
      AND conrelid = 'public.farm_v1_pet_care'::regclass
  ) THEN
    ALTER TABLE public.farm_v1_pet_care
      ADD CONSTRAINT farm_v1_pet_care_resident_pet_check
      CHECK (resident_pet_id IS NULL OR resident_pet_id IN (
        'xun-xing-quan', 'bi-xie-suan-ni', 'shi-shi-di-ting', 'qian-kun-qi-lin'
      ));
  END IF;
END;
$$;

ALTER TABLE public.farm_v1_inventory
  DROP CONSTRAINT IF EXISTS farm_v1_inventory_item_check;

ALTER TABLE public.farm_v1_inventory
  ADD CONSTRAINT farm_v1_inventory_item_check CHECK (item_key IN (
    'yao-jin-seed',
    'you-ying-seed',
    'zhu-sha-seed',
    'yao-zi-seed',
    'fei-cui-seed',
    'hun-dun-seed',
    'tai-yi-wu-gu-san',
    'jiu-zhuan-qi-yun-dan',
    'yao-jin-su',
    'yue-hai-tan',
    'chi-xue-shen',
    'tian-shu-man',
    'tai-wei-lian',
    'hun-dun-jing-hua'
  ));

CREATE TABLE IF NOT EXISTS public.farm_v1_pet_patrol_rewards (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_id text NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  reward jsonb NOT NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT farm_v1_pet_patrol_rewards_pet_check CHECK (pet_id IN (
    'xun-xing-quan', 'bi-xie-suan-ni', 'shi-shi-di-ting', 'qian-kun-qi-lin'
  )),
  CONSTRAINT farm_v1_pet_patrol_rewards_completed_check CHECK (completed_at > started_at),
  CONSTRAINT farm_v1_pet_patrol_rewards_reward_check CHECK (jsonb_typeof(reward) = 'object')
);

ALTER TABLE public.farm_v1_pet_patrol_rewards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.farm_v1_pet_patrol_rewards FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.farm_v1_start_pet_patrol(
  p_owner_id uuid,
  p_pet_id text,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_reward jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted boolean;
  v_reward jsonb;
BEGIN
  IF p_owner_id IS NULL
    OR p_pet_id NOT IN ('xun-xing-quan', 'bi-xie-suan-ni', 'shi-shi-di-ting', 'qian-kun-qi-lin')
    OR p_started_at IS NULL
    OR p_completed_at IS NULL
    OR p_completed_at <= p_started_at
    OR jsonb_typeof(p_reward) <> 'object'
    OR coalesce(btrim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Invalid farm V1 pet patrol';
  END IF;

  PERFORM public.initialize_farm_v1_runtime(p_owner_id, p_started_at);

  IF NOT EXISTS (
    SELECT 1 FROM public.farm_v1_owned_pets
    WHERE owner_id = p_owner_id AND pet_id = p_pet_id
  ) THEN
    RAISE EXCEPTION 'Farm V1 pet is not owned';
  END IF;

  INSERT INTO public.farm_v1_operation_records (
    owner_id, idempotency_key, operation_type, recorded_at
  )
  VALUES (p_owner_id, p_idempotency_key, 'pet_patrol_start', p_started_at)
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT coalesce(v_inserted, false) THEN
    SELECT reward INTO v_reward
    FROM public.farm_v1_pet_patrol_rewards
    WHERE owner_id = p_owner_id;
    RETURN coalesce(v_reward, '{}'::jsonb);
  END IF;

  INSERT INTO public.farm_v1_pet_patrol_rewards (
    owner_id, pet_id, started_at, completed_at, reward, claimed_at, updated_at
  )
  VALUES (p_owner_id, p_pet_id, p_started_at, p_completed_at, p_reward, NULL, now())
  ON CONFLICT (owner_id) DO UPDATE
  SET
    pet_id = EXCLUDED.pet_id,
    started_at = EXCLUDED.started_at,
    completed_at = EXCLUDED.completed_at,
    reward = EXCLUDED.reward,
    claimed_at = NULL,
    updated_at = now()
  WHERE public.farm_v1_pet_patrol_rewards.claimed_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Farm V1 pet patrol is already pending';
  END IF;

  UPDATE public.farm_v1_pet_care
  SET patrol_pet_id = p_pet_id,
      patrol_started_at = p_started_at,
      recovery_until = NULL,
      updated_at = now()
  WHERE owner_id = p_owner_id;

  RETURN p_reward;
END;
$$;

CREATE OR REPLACE FUNCTION public.farm_v1_claim_pet_patrol_reward(
  p_owner_id uuid,
  p_idempotency_key text,
  p_claimed_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $farm_claim$
DECLARE
  v_inserted boolean;
  v_reward jsonb;
BEGIN
  IF p_owner_id IS NULL
    OR coalesce(btrim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Invalid farm V1 pet patrol claim';
  END IF;

  INSERT INTO public.farm_v1_operation_records (
    owner_id, idempotency_key, operation_type, recorded_at
  )
  VALUES (p_owner_id, p_idempotency_key, 'pet_patrol_claim', p_claimed_at)
  ON CONFLICT DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT coalesce(v_inserted, false) THEN
    SELECT reward INTO v_reward
    FROM public.farm_v1_pet_patrol_rewards
    WHERE owner_id = p_owner_id;
    IF v_reward IS NULL THEN
      RAISE EXCEPTION 'Farm V1 pet patrol reward is unavailable';
    END IF;
    RETURN v_reward;
  END IF;

  UPDATE public.farm_v1_pet_patrol_rewards
  SET claimed_at = p_claimed_at, updated_at = now()
  WHERE owner_id = p_owner_id
    AND claimed_at IS NULL
    AND completed_at <= p_claimed_at
  RETURNING reward INTO v_reward;

  IF v_reward IS NULL THEN
    RAISE EXCEPTION 'Farm V1 pet patrol reward is unavailable';
  END IF;

  INSERT INTO public.farm_v1_inventory (owner_id, item_key, quantity)
  SELECT p_owner_id, x."itemKey", x.quantity
  FROM jsonb_to_recordset(v_reward->'items') AS x(
    "itemKey" text,
    quantity integer
  )
  ON CONFLICT (owner_id, item_key) DO UPDATE
  SET quantity = public.farm_v1_inventory.quantity + EXCLUDED.quantity,
      updated_at = now();

  RETURN v_reward;
END;
$farm_claim$;

REVOKE ALL ON FUNCTION public.farm_v1_start_pet_patrol(uuid, text, timestamptz, timestamptz, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.farm_v1_claim_pet_patrol_reward(uuid, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_v1_start_pet_patrol(uuid, text, timestamptz, timestamptz, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_claim_pet_patrol_reward(uuid, text, timestamptz) TO service_role;


CREATE OR REPLACE FUNCTION public.farm_v1_read_runtime(
  p_owner_id uuid,
  p_initialized_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $farm$
BEGIN
  PERFORM public.initialize_farm_v1_runtime(p_owner_id, p_initialized_at);

  RETURN jsonb_build_object(
    'ownerId', p_owner_id::text,
    'lastChaosSeedGrantedTaiwanDate', (
      SELECT last_chaos_seed_granted_taiwan_date::text
      FROM farm_v1_profiles
      WHERE owner_id = p_owner_id
    ),
    'inventory', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('itemKey', item_key, 'quantity', quantity)
        ORDER BY item_key
      )
      FROM farm_v1_inventory
      WHERE owner_id = p_owner_id
    ), '[]'::jsonb),
    'lands', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'landIndex', land_index,
        'unlockedAt', unlocked_at,
        'plantedAt', planted_at,
        'plantedCropId', planted_crop_id,
        'plantedQuantity', planted_quantity
      ) ORDER BY land_index)
      FROM farm_v1_lands
      WHERE owner_id = p_owner_id
    ), '[]'::jsonb),
    'ownedPetIds', COALESCE((
      SELECT jsonb_agg(pet_id ORDER BY pet_id)
      FROM farm_v1_owned_pets
      WHERE owner_id = p_owner_id
    ), '[]'::jsonb),
    'petCare', COALESCE((
      SELECT jsonb_build_object(
        'fedAt', fed_at,
        'residentPetId', resident_pet_id,
        'patrolPetId', patrol_pet_id,
        'patrolStartedAt', patrol_started_at,
        'recoveryUntil', recovery_until
      )
      FROM farm_v1_pet_care
      WHERE owner_id = p_owner_id
    ), jsonb_build_object(
      'fedAt', null,
      'residentPetId', null,
      'patrolPetId', null,
      'patrolStartedAt', null,
      'recoveryUntil', null
    )),
    'pendingPatrolReward', (
      SELECT jsonb_build_object(
        'petId', pet_id,
        'startedAt', started_at,
        'completedAt', completed_at,
        'reward', reward
      )
      FROM farm_v1_pet_patrol_rewards
      WHERE owner_id = p_owner_id
        AND claimed_at IS NULL
    ),
    'operationRecords', '[]'::jsonb
  );
END;
$farm$;

REVOKE ALL ON FUNCTION public.farm_v1_read_runtime(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_v1_read_runtime(uuid, timestamptz) TO service_role;

-- Preserve camelCase runtime serialization while adding the resident pet state.
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
AS $farm$
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
    resident_pet_id = p_runtime->'petCare'->>'residentPetId',
    patrol_pet_id = p_runtime->'petCare'->>'patrolPetId',
    patrol_started_at = (p_runtime->'petCare'->>'patrolStartedAt')::timestamptz,
    recovery_until = (p_runtime->'petCare'->>'recoveryUntil')::timestamptz,
    updated_at = now()
  WHERE owner_id = v_owner_id;

  RETURN public.farm_v1_read_runtime(v_owner_id, p_recorded_at);
END;
$farm$;

REVOKE ALL ON FUNCTION public.farm_v1_save_runtime(jsonb, text, text, timestamptz)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.farm_v1_save_runtime(jsonb, text, text, timestamptz)
  TO service_role;


COMMIT;
