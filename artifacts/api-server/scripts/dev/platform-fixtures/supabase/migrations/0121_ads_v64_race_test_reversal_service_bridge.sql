-- V6.4: narrowly scoped service-role entrypoint for reversing only
-- explicitly tagged isolated race-test ad credits. It cannot reverse normal
-- game rewards because the underlying function enforces the test game prefix.
CREATE OR REPLACE FUNCTION public.ad_v64_reverse_race_test_credit(p_original_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT platform.reverse_ads_v64_race_test_credit(p_original_id)
$$;
REVOKE ALL ON FUNCTION public.ad_v64_reverse_race_test_credit(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ad_v64_reverse_race_test_credit(uuid)
  TO service_role;
