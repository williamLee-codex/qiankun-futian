BEGIN;

-- This V1 state is independent from the legacy single-plot Spirit Rice flow.
-- Gold and crystals deliberately remain in the central platform Wallet.
CREATE TABLE IF NOT EXISTS public.farm_v1_profiles (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_chaos_seed_granted_taiwan_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.farm_v1_lands (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  land_index smallint NOT NULL,
  unlocked_at timestamptz,
  planted_at timestamptz,
  planted_crop_id text,
  planted_quantity integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, land_index),
  CONSTRAINT farm_v1_lands_index_check CHECK (land_index BETWEEN 1 AND 6),
  CONSTRAINT farm_v1_lands_crop_check CHECK (
    planted_crop_id IS NULL OR planted_crop_id IN (
      'yao-jin-su', 'yue-hai-tan', 'chi-xue-shen',
      'tian-shu-man', 'tai-wei-lian', 'hun-dun-jing-hua'
    )
  ),
  CONSTRAINT farm_v1_lands_quantity_check CHECK (planted_quantity >= 0),
  CONSTRAINT farm_v1_lands_plant_consistency_check CHECK (
    (planted_at IS NULL AND planted_crop_id IS NULL AND planted_quantity = 0)
    OR (planted_at IS NOT NULL AND planted_crop_id IS NOT NULL AND planted_quantity > 0)
  )
);

CREATE TABLE IF NOT EXISTS public.farm_v1_inventory (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  quantity integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, item_key),
  CONSTRAINT farm_v1_inventory_item_check CHECK (item_key IN (
    'yao-jin-seed', 'you-ying-seed', 'zhu-sha-seed', 'yao-zi-seed',
    'fei-cui-seed', 'tai-yi-wu-gu-san', 'yao-jin-su', 'yue-hai-tan',
    'chi-xue-shen', 'tian-shu-man', 'tai-wei-lian', 'hun-dun-jing-hua'
  )),
  CONSTRAINT farm_v1_inventory_quantity_check CHECK (quantity >= 0)
);

CREATE TABLE IF NOT EXISTS public.farm_v1_owned_pets (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_id text NOT NULL,
  obtained_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, pet_id),
  CONSTRAINT farm_v1_owned_pets_id_check CHECK (pet_id IN (
    'xun-xing-quan', 'bi-xie-suan-ni', 'shi-shi-di-ting', 'qian-kun-qi-lin'
  ))
);

CREATE TABLE IF NOT EXISTS public.farm_v1_pet_care (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fed_at timestamptz,
  patrol_pet_id text,
  patrol_started_at timestamptz,
  recovery_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT farm_v1_pet_care_pet_check CHECK (patrol_pet_id IS NULL OR patrol_pet_id IN (
    'xun-xing-quan', 'bi-xie-suan-ni', 'shi-shi-di-ting', 'qian-kun-qi-lin'
  )),
  CONSTRAINT farm_v1_pet_care_patrol_check CHECK (
    (patrol_pet_id IS NULL AND patrol_started_at IS NULL)
    OR (patrol_pet_id IS NOT NULL AND patrol_started_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.farm_v1_operation_records (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  operation_type text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, idempotency_key),
  CONSTRAINT farm_v1_operation_key_check CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT farm_v1_operation_type_check CHECK (btrim(operation_type) <> '')
);

CREATE INDEX IF NOT EXISTS farm_v1_operation_records_owner_recorded_at_idx
  ON public.farm_v1_operation_records (owner_id, recorded_at DESC);

-- The browser may only read its own V1 state. Mutations remain server-only.
ALTER TABLE public.farm_v1_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_v1_lands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_v1_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_v1_owned_pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_v1_pet_care ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_v1_operation_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.farm_v1_profiles, public.farm_v1_lands,
  public.farm_v1_inventory, public.farm_v1_owned_pets, public.farm_v1_pet_care,
  public.farm_v1_operation_records FROM anon, authenticated;

GRANT SELECT ON TABLE public.farm_v1_profiles, public.farm_v1_lands,
  public.farm_v1_inventory, public.farm_v1_owned_pets, public.farm_v1_pet_care,
  public.farm_v1_operation_records TO authenticated;

CREATE POLICY farm_v1_profiles_owner_select ON public.farm_v1_profiles
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY farm_v1_lands_owner_select ON public.farm_v1_lands
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY farm_v1_inventory_owner_select ON public.farm_v1_inventory
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY farm_v1_owned_pets_owner_select ON public.farm_v1_owned_pets
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY farm_v1_pet_care_owner_select ON public.farm_v1_pet_care
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY farm_v1_operation_records_owner_select ON public.farm_v1_operation_records
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);

-- Server-only entry point. It is idempotent, so a refresh cannot duplicate
-- either the six fields or the one-time starter seed pack.
CREATE OR REPLACE FUNCTION public.initialize_farm_v1_runtime(
  p_owner_id uuid,
  p_initialized_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_owner_id IS NULL THEN
    RAISE EXCEPTION 'Farm V1 owner ID is required';
  END IF;

  INSERT INTO public.farm_v1_profiles (owner_id)
  VALUES (p_owner_id)
  ON CONFLICT (owner_id) DO NOTHING;

  INSERT INTO public.farm_v1_lands (
    owner_id, land_index, unlocked_at, planted_at, planted_crop_id, planted_quantity
  )
  SELECT p_owner_id, land_index,
    CASE WHEN land_index = 1 THEN p_initialized_at ELSE NULL END,
    NULL, NULL, 0
  FROM generate_series(1, 6) AS land_index
  ON CONFLICT (owner_id, land_index) DO NOTHING;

  INSERT INTO public.farm_v1_inventory (owner_id, item_key, quantity)
  VALUES (p_owner_id, 'yao-jin-seed', 20)
  ON CONFLICT (owner_id, item_key) DO NOTHING;

  INSERT INTO public.farm_v1_pet_care (owner_id)
  VALUES (p_owner_id)
  ON CONFLICT (owner_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.initialize_farm_v1_runtime(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.initialize_farm_v1_runtime(uuid, timestamptz) TO service_role;

COMMIT;
