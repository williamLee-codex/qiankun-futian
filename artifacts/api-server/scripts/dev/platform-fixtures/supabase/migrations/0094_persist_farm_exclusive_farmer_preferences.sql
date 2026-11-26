BEGIN;

CREATE TABLE IF NOT EXISTS public.farm_v1_farmer_preferences (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  land_index smallint NOT NULL CHECK (land_index BETWEEN 1 AND 6),
  auto_cultivate boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, land_index)
);

ALTER TABLE public.farm_v1_farmer_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.farm_v1_farmer_preferences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.farm_v1_initialize_farmer_preferences(
  p_owner_id uuid,
  p_now timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF p_owner_id IS NULL THEN RAISE EXCEPTION 'FARM_FARMER_OWNER_REQUIRED'; END IF;

  INSERT INTO public.farm_v1_farmer_preferences(owner_id,land_index,auto_cultivate,updated_at)
  SELECT p_owner_id,land_index,true,p_now
  FROM generate_series(1,6) AS land_index
  ON CONFLICT(owner_id,land_index) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.farm_v1_read_farmer_preferences(
  p_owner_id uuid
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path=public
AS $$
  SELECT COALESCE(
    jsonb_object_agg(land_index::text,auto_cultivate ORDER BY land_index),
    '{}'::jsonb
  )
  FROM public.farm_v1_farmer_preferences
  WHERE owner_id=p_owner_id;
$$;

CREATE OR REPLACE FUNCTION public.farm_v1_set_farmer_preference(
  p_owner_id uuid,
  p_land_index smallint,
  p_auto_cultivate boolean,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $$
BEGIN
  IF p_owner_id IS NULL OR p_land_index NOT BETWEEN 1 AND 6 OR p_auto_cultivate IS NULL
  THEN RAISE EXCEPTION 'FARM_FARMER_PREFERENCE_INVALID'; END IF;

  -- Entitlement verification is intentionally kept outside this persistence primitive.
  -- The server operation that exposes this RPC must verify the effective paid milestone >= 999.
  PERFORM public.farm_v1_initialize_farmer_preferences(p_owner_id,p_now);

  UPDATE public.farm_v1_farmer_preferences
  SET auto_cultivate=p_auto_cultivate,updated_at=p_now
  WHERE owner_id=p_owner_id AND land_index=p_land_index;

  RETURN public.farm_v1_read_farmer_preferences(p_owner_id);
END;
$$;

REVOKE ALL ON FUNCTION public.farm_v1_initialize_farmer_preferences(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.farm_v1_read_farmer_preferences(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.farm_v1_set_farmer_preference(uuid,smallint,boolean,timestamptz) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.farm_v1_initialize_farmer_preferences(uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_read_farmer_preferences(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_set_farmer_preference(uuid,smallint,boolean,timestamptz) TO service_role;

COMMIT;
