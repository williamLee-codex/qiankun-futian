BEGIN;
-- PostgREST exposes public by default. Service-only wrappers keep internal
-- entitlement and reward tables in the platform schema.
BEGIN;
CREATE OR REPLACE FUNCTION public.farm_v2_request_first_purchase_reward(
 p_user_id text,p_plan_id text,p_claim_day integer
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT platform.request_farm_first_purchase_reward(p_user_id,p_plan_id,p_claim_day,now());
$$;
CREATE OR REPLACE FUNCTION public.farm_v2_deliver_first_purchase_reward(
 p_user_id text,p_plan_id text,p_claim_day integer
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT platform.deliver_farm_first_purchase_reward(p_user_id,p_plan_id,p_claim_day);
$$;
REVOKE ALL ON FUNCTION public.farm_v2_request_first_purchase_reward(text,text,integer),
 public.farm_v2_deliver_first_purchase_reward(text,text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_request_first_purchase_reward(text,text,integer),
 public.farm_v2_deliver_first_purchase_reward(text,text,integer)
 TO service_role;
COMMIT;
