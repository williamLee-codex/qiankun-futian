BEGIN;
CREATE OR REPLACE FUNCTION public.farm_v2_first_purchase_status(p_user_id text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object(
  'plans',coalesce((SELECT jsonb_agg(jsonb_build_object('plan_id',plan_id,'paid_at',paid_at,
   'purchased_crystals',purchased_crystals,'bonus_crystals_total',bonus_crystals_total)
   ORDER BY plan_id) FROM platform.farm_first_purchase_entitlements WHERE user_id=p_user_id),'[]'::jsonb),
  'claimedDays',coalesce((SELECT jsonb_agg(jsonb_build_object('plan_id',plan_id,
   'claim_day',claim_day,'claimed_at',claimed_at) ORDER BY plan_id,claim_day)
   FROM platform.farm_first_purchase_claims WHERE user_id=p_user_id),'[]'::jsonb),
  'resetTimeZone','Asia/Taipei','resetHour',5
 );
$$;
REVOKE ALL ON FUNCTION public.farm_v2_first_purchase_status(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_first_purchase_status(text) TO service_role;
COMMIT;