-- Trusted backend-only lookup; no direct table privileges.
CREATE OR REPLACE FUNCTION platform.ad_is_registered_character_v64(p_account_id uuid,p_game_id text,p_server_id text,p_character_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
SELECT EXISTS (SELECT 1 FROM platform.game_server_characters r WHERE r.account_id=p_account_id AND r.game_id=p_game_id AND r.server_id=p_server_id AND r.character_id=p_character_id AND r.status='active')
$$;
REVOKE ALL ON FUNCTION platform.ad_is_registered_character_v64(uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION platform.ad_is_registered_character_v64(uuid,text,text,text) TO service_role;
