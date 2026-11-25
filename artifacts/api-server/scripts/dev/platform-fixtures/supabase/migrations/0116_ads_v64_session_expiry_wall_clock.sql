-- V6.4 evaluate expiry at actual lock-acquisition time, not transaction start.
-- Private settlement gate. No grants to API roles.
CREATE OR REPLACE FUNCTION platform.settle_verified_ad_session_coin_v64(p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE s platform.ad_verified_sessions%ROWTYPE; result jsonb;
BEGIN
 IF p_session_id IS NULL THEN RAISE EXCEPTION 'INVALID_SESSION'; END IF;
 SELECT * INTO s FROM platform.ad_verified_sessions WHERE session_id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('result_status','session_not_found'); END IF;
 IF s.reward_kind <> 'coin' OR s.verified_at IS NULL OR s.provider_transaction_id IS NULL
   OR btrim(s.provider_transaction_id) = '' THEN
   RETURN jsonb_build_object('result_status','not_verified');
 END IF;
 IF s.expires_at <= clock_timestamp() AND s.settled_at IS NULL THEN
   RETURN jsonb_build_object('result_status','expired');
 END IF;
 IF s.settled_at IS NOT NULL THEN
   RETURN jsonb_build_object('result_status','duplicate');
 END IF;
 result := platform.settle_verified_ad_coin_v64(s.user_id,s.game_id,s.server_id,s.ad_event_id,s.reward_amount);
 IF result->>'result_status' = 'created' THEN
   UPDATE platform.ad_verified_sessions SET settled_at=now() WHERE session_id=p_session_id;
 ELSIF result->>'result_status' = 'duplicate' THEN
   RAISE EXCEPTION 'AD_SESSION_EVENT_ALREADY_SETTLED';
 END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION platform.settle_verified_ad_session_coin_v64(uuid) FROM PUBLIC,anon,authenticated,service_role;