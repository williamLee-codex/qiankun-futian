BEGIN;

REVOKE ALL ON FUNCTION public.farm_v1_save_runtime(
  jsonb,
  text,
  text,
  timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.farm_v1_save_runtime(
  jsonb,
  text,
  text,
  timestamptz
) TO service_role;

COMMIT;
