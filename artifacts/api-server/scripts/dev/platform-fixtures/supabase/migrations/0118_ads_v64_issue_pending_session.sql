-- V6.4: trusted backend may issue an UNVERIFIED pending ad session.
-- This function cannot mark a session verified or settle a reward.
CREATE OR REPLACE FUNCTION platform.issue_pending_ad_session_v64(
 p_account_id uuid,
 p_game_id text,
 p_server_id text,
 p_character_id text,
 p_provider text,
 p_reward_amount integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_session_id uuid; v_event_id text; v_expires timestamptz;
BEGIN
 IF p_account_id IS NULL
 OR p_game_id IS NULL OR btrim(p_game_id)=''
 OR p_server_id IS NULL OR btrim(p_server_id)=''
 OR p_character_id IS NULL OR btrim(p_character_id)=''
 OR p_provider IS NULL OR btrim(p_provider)=''
 OR p_reward_amount IS NULL OR p_reward_amount <= 0
 THEN RAISE EXCEPTION 'INVALID_AD_SESSION_INPUT'; END IF;

 IF NOT platform.ad_is_registered_character_v64(
   p_account_id,p_game_id,p_server_id,p_character_id
 ) THEN
   RETURN jsonb_build_object('result_status','not_eligible');
 END IF;

 v_session_id := gen_random_uuid();
 v_event_id := gen_random_uuid()::text;
 v_expires := clock_timestamp() + interval '10 minutes';

 INSERT INTO platform.ad_verified_sessions(
   session_id,user_id,game_id,server_id,character_id,ad_event_id,
   provider,reward_kind,reward_amount,expires_at
 ) VALUES (
   v_session_id,p_account_id,p_game_id,p_server_id,p_character_id,
   v_event_id,p_provider,'coin',p_reward_amount,v_expires
 );

 RETURN jsonb_build_object(
   'result_status','created',
   'session_id',v_session_id,
   'ad_event_id',v_event_id,
   'expires_at',v_expires
 );
END $$;
REVOKE ALL ON FUNCTION platform.issue_pending_ad_session_v64(uuid,text,text,text,text,integer)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ad_issue_pending_session_v64(
 p_account_id uuid,p_game_id text,p_server_id text,p_character_id text,
 p_provider text,p_reward_amount integer
) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
 SELECT platform.issue_pending_ad_session_v64(
  p_account_id,p_game_id,p_server_id,p_character_id,p_provider,p_reward_amount
 )
$$;
REVOKE ALL ON FUNCTION public.ad_issue_pending_session_v64(uuid,text,text,text,text,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ad_issue_pending_session_v64(uuid,text,text,text,text,integer)
 TO service_role;
