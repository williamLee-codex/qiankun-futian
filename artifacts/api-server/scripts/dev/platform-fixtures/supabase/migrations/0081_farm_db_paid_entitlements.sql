BEGIN;

CREATE OR REPLACE FUNCTION public.farm_v1_paid_entitlements(
  p_auth_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,core
AS $paid_entitlements$
DECLARE
  v_paid bigint;
BEGIN
  v_paid:=public.farm_v1_effective_paid_crystals(p_auth_user_id);

  RETURN jsonb_build_object(
    'effective_paid_crystals',v_paid,
    'land4',v_paid>=100,
    'land5',v_paid>=300,
    'diting',v_paid>=450,
    'land6',v_paid>=600,
    'qilin',v_paid>=799,
    'exclusive_farmer',v_paid>=999
  );
END;
$paid_entitlements$;

REVOKE ALL ON FUNCTION public.farm_v1_paid_entitlements(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_paid_entitlements(uuid)
TO service_role;

COMMIT;
