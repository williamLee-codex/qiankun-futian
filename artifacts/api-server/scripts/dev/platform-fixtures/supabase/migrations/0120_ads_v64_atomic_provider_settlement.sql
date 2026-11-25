-- V6.4 atomically bind provider transaction proof and settle its coin reward.
CREATE OR REPLACE FUNCTION platform.complete_verified_ad_session_v64(
 p_session_id uuid,p_provider text,p_provider_transaction_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v jsonb; s platform.ad_verified_sessions%ROWTYPE; settled jsonb;
BEGIN
 v:=platform.mark_ad_session_provider_verified_v64(
   p_session_id,p_provider,p_provider_transaction_id
 );
 IF v->>'result_status' NOT IN ('verified','already_verified') THEN
   RETURN v;
 END IF;
 SELECT * INTO s FROM platform.ad_verified_sessions
 WHERE session_id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('result_status','session_not_found'); END IF;
 IF s.reward_kind <> 'coin' THEN
   RETURN jsonb_build_object('result_status','unsupported_reward_kind');
 END IF;
 settled:=platform.settle_verified_ad_session_coin_v64(p_session_id);
 RETURN settled;
END $$;
REVOKE ALL ON FUNCTION platform.complete_verified_ad_session_v64(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ad_complete_verified_session_v64(
 p_session_id uuid,p_provider text,p_provider_transaction_id text
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
 SELECT platform.complete_verified_ad_session_v64(
  p_session_id,p_provider,p_provider_transaction_id
 )
$$;
REVOKE ALL ON FUNCTION public.ad_complete_verified_session_v64(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ad_complete_verified_session_v64(uuid,text,text)
 TO service_role;
