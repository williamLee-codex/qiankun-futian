-- Narrow public RPC bridge; only service_role can execute.
CREATE OR REPLACE FUNCTION public.ad_is_registered_character_v64(p_account_id uuid,p_game_id text,p_server_id text,p_character_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
SELECT platform.ad_is_registered_character_v64(p_account_id,p_game_id,p_server_id,p_character_id)
$$;
REVOKE ALL ON FUNCTION public.ad_is_registered_character_v64(uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ad_is_registered_character_v64(uuid,text,text,text) TO service_role;
