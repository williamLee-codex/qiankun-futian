-- Private atomic sync function. No public execute grants.
CREATE OR REPLACE FUNCTION platform.record_verified_game_server_registration_v64(
 p_account_id uuid,p_game_id text,p_server_id text,p_character_id text,
 p_status text,p_source_event_id text,p_source_version bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE prior platform.game_server_registration_events%ROWTYPE;
DECLARE current_version bigint;
BEGIN
 IF p_account_id IS NULL OR p_game_id IS NULL OR btrim(p_game_id)='' OR p_server_id IS NULL OR btrim(p_server_id)='' OR p_character_id IS NULL OR btrim(p_character_id)='' OR p_source_event_id IS NULL OR btrim(p_source_event_id)='' OR p_status NOT IN ('active','suspended','archived') OR p_status IS NULL OR p_source_version IS NULL OR p_source_version < 1 THEN
  RAISE EXCEPTION 'invalid registration input';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_game_id||':'||p_server_id||':'||p_character_id,0));
 SELECT * INTO prior FROM platform.game_server_registration_events WHERE source_event_id=p_source_event_id;
 IF FOUND THEN
  IF prior.account_id=p_account_id AND prior.game_id=p_game_id AND prior.server_id=p_server_id AND prior.character_id=p_character_id AND prior.status=p_status AND prior.source_version=p_source_version THEN RETURN 'duplicate'; END IF;
  RAISE EXCEPTION 'registration event id conflict';
 END IF;
 SELECT source_version INTO current_version FROM platform.game_server_characters WHERE game_id=p_game_id AND server_id=p_server_id AND character_id=p_character_id FOR UPDATE;
 IF FOUND AND p_source_version <= current_version THEN RETURN 'stale'; END IF;
 INSERT INTO platform.game_server_registration_events(source_event_id,game_id,server_id,character_id,account_id,status,source_version)
 VALUES(p_source_event_id,p_game_id,p_server_id,p_character_id,p_account_id,p_status,p_source_version);
 INSERT INTO platform.game_server_characters(game_id,server_id,character_id,account_id,status,source_version)
 VALUES(p_game_id,p_server_id,p_character_id,p_account_id,p_status,p_source_version)
 ON CONFLICT(game_id,server_id,character_id) DO UPDATE
 SET account_id=EXCLUDED.account_id,status=EXCLUDED.status,source_version=EXCLUDED.source_version,updated_at=now()
 WHERE platform.game_server_characters.source_version < EXCLUDED.source_version;
 RETURN 'applied';
END; $$;
REVOKE ALL ON FUNCTION platform.record_verified_game_server_registration_v64(uuid,text,text,text,text,text,bigint) FROM PUBLIC,anon,authenticated,service_role;
