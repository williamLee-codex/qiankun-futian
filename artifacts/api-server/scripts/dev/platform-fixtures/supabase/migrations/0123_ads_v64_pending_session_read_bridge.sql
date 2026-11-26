-- Read-only bridge for trusted server callback adapter. Does not authorize rewards.
CREATE OR REPLACE FUNCTION public.ad_read_pending_session_v64(p_session_id uuid)
RETURNS TABLE(user_id uuid,game_id text,server_id text,ad_event_id text,provider text,reward_amount integer,expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT s.user_id,s.game_id,s.server_id,s.ad_event_id,s.provider,s.reward_amount,s.expires_at
 FROM platform.ad_verified_sessions s
 WHERE s.session_id=p_session_id AND s.verified_at IS NULL AND s.settled_at IS NULL AND s.expires_at>clock_timestamp()
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.ad_read_pending_session_v64(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ad_read_pending_session_v64(uuid) TO service_role;
