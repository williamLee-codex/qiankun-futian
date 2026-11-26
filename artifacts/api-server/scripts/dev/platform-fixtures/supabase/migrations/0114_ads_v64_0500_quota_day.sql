-- V6.4 05:00 Asia/Taipei quota rollover correction. Caller MUST verify ad completion and
-- character ownership on the server before invoking this service_role-only RPC.
BEGIN;
CREATE OR REPLACE FUNCTION platform.settle_verified_ad_coin_v64(
 p_user_id uuid, p_game_id text, p_server_id text, p_ad_event_id text,
 p_reward_amount integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, platform
AS $$
DECLARE
 v_day date := ((now() AT TIME ZONE 'Asia/Taipei') - interval '5 hours')::date;
 v_event platform.ad_reward_events%ROWTYPE;
 v_count integer;
 v_wallet jsonb;
 v_status text;
 v_key text;
BEGIN
 IF p_user_id IS NULL OR nullif(btrim(p_game_id),'') IS NULL
    OR nullif(btrim(p_server_id),'') IS NULL OR nullif(btrim(p_ad_event_id),'') IS NULL
    OR p_reward_amount IS NULL OR p_reward_amount <= 0
     THEN
   RAISE EXCEPTION 'INVALID_AD_SETTLEMENT_INPUT';
 END IF;
 -- Serialize attempts for a single player/game/server across event IDs.
 PERFORM pg_advisory_xact_lock(hashtextextended(
   p_user_id::text || ':' || length(p_game_id) || ':' || p_game_id || ':' ||
   length(p_server_id) || ':' || p_server_id, 0));
 SELECT * INTO v_event FROM platform.ad_reward_events
 WHERE game_id=p_game_id AND server_id=p_server_id AND ad_event_id=p_ad_event_id
 FOR UPDATE;
 IF FOUND THEN
   IF v_event.user_id <> p_user_id OR v_event.reward_kind <> 'coin'
      OR v_event.reward_amount <> p_reward_amount THEN
      RETURN jsonb_build_object('result_status','duplicate_conflict');
   END IF;
   IF v_event.status = 'settled' THEN
      RETURN jsonb_build_object('result_status','duplicate','event_id',v_event.id);
   END IF;
   RETURN jsonb_build_object('result_status','event_not_settled','event_id',v_event.id);
 END IF;
 INSERT INTO platform.ad_daily_quotas(user_id,game_id,server_id,quota_date,claimed_count)
 VALUES(p_user_id,p_game_id,p_server_id,v_day,0)
 ON CONFLICT (user_id,game_id,server_id,quota_date) DO NOTHING;
 SELECT claimed_count INTO v_count FROM platform.ad_daily_quotas
 WHERE user_id=p_user_id AND game_id=p_game_id AND server_id=p_server_id AND quota_date=v_day
 FOR UPDATE;
 IF v_count >= 3 THEN
   RETURN jsonb_build_object('result_status','quota_exceeded','claimed_count',v_count);
 END IF;
 INSERT INTO platform.ad_reward_events(
   user_id,game_id,server_id,ad_event_id,reward_kind,reward_amount,reward_reference,
   status,verified_at)
 VALUES(p_user_id,p_game_id,p_server_id,p_ad_event_id,'coin',p_reward_amount,
   'ad:' || p_game_id || ':' || p_server_id || ':' || p_ad_event_id,
   'pending',now()) RETURNING * INTO v_event;
 v_key := 'ad-v64:' || v_event.id::text;
 v_wallet := public.core_wallet_apply_transaction(
   p_user_id,p_reward_amount,'coin','credit',v_key,
   'verified_rewarded_ad',v_event.id::text,'ad_reward_event',NULL);
 v_status := v_wallet->>'result_status';
 IF v_status <> 'created' THEN
   RAISE EXCEPTION 'AD_WALLET_SETTLEMENT_FAILED: %',coalesce(v_status,'null');
 END IF;
 UPDATE platform.ad_daily_quotas SET claimed_count=claimed_count+1,updated_at=now()
 WHERE user_id=p_user_id AND game_id=p_game_id AND server_id=p_server_id AND quota_date=v_day;
 UPDATE platform.ad_reward_events SET status='settled',settled_at=now()
 WHERE id=v_event.id;
 RETURN jsonb_build_object('result_status','created','event_id',v_event.id,
   'claimed_count',v_count+1,'wallet_transaction',v_wallet->'transaction');
END;
$$;
-- Provider verification is not integrated: preserve the 0103 fail-closed gate.
REVOKE ALL ON FUNCTION platform.settle_verified_ad_coin_v64(uuid,text,text,text,integer)
 FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
