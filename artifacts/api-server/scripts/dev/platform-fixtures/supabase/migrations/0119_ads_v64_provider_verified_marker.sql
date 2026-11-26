-- V6.4 trusted-provider verification marker.
-- This function only records a proof already authenticated by a trusted
-- server-side provider adapter. It never grants coins or settles a session.
CREATE OR REPLACE FUNCTION platform.mark_ad_session_provider_verified_v64(
 p_session_id uuid,
 p_provider text,
 p_provider_transaction_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE s platform.ad_verified_sessions%ROWTYPE;
DECLARE tx_session uuid;
BEGIN
 IF p_session_id IS NULL OR p_provider IS NULL OR btrim(p_provider)=''
 OR p_provider_transaction_id IS NULL OR btrim(p_provider_transaction_id)=''
 THEN RAISE EXCEPTION 'INVALID_PROVIDER_PROOF'; END IF;

 SELECT * INTO s
 FROM platform.ad_verified_sessions
 WHERE session_id=p_session_id
 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('result_status','session_not_found'); END IF;
 IF s.provider <> p_provider THEN
   RETURN jsonb_build_object('result_status','provider_mismatch');
 END IF;
 IF s.expires_at <= clock_timestamp() AND s.verified_at IS NULL THEN
   RETURN jsonb_build_object('result_status','expired');
 END IF;
 IF s.verified_at IS NOT NULL THEN
   IF s.provider_transaction_id = p_provider_transaction_id THEN
     RETURN jsonb_build_object('result_status','already_verified');
   END IF;
   RETURN jsonb_build_object('result_status','session_already_bound');
 END IF;

 SELECT session_id INTO tx_session
 FROM platform.ad_verified_sessions
 WHERE provider=p_provider
 AND provider_transaction_id=p_provider_transaction_id
 FOR UPDATE;
 IF FOUND AND tx_session <> p_session_id THEN
   RETURN jsonb_build_object('result_status','provider_transaction_replayed');
 END IF;

 UPDATE platform.ad_verified_sessions
 SET provider_transaction_id=p_provider_transaction_id,
     verified_at=clock_timestamp()
 WHERE session_id=p_session_id AND verified_at IS NULL;

 RETURN jsonb_build_object('result_status','verified');
EXCEPTION WHEN unique_violation THEN
 RETURN jsonb_build_object('result_status','provider_transaction_replayed');
END $$;
REVOKE ALL ON FUNCTION platform.mark_ad_session_provider_verified_v64(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ad_mark_session_provider_verified_v64(
 p_session_id uuid,p_provider text,p_provider_transaction_id text
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
 SELECT platform.mark_ad_session_provider_verified_v64(
  p_session_id,p_provider,p_provider_transaction_id
 )
$$;
REVOKE ALL ON FUNCTION public.ad_mark_session_provider_verified_v64(uuid,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ad_mark_session_provider_verified_v64(uuid,text,text)
 TO service_role;
