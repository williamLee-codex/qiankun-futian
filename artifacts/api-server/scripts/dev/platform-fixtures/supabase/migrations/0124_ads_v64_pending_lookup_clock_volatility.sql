-- V6.4: pending-session lookup uses clock_timestamp(), which is VOLATILE.
-- Keep the SECURITY DEFINER body and API role grants unchanged.
ALTER FUNCTION public.ad_read_pending_session_v64(uuid) VOLATILE;
DO $assert$
BEGIN
 IF (SELECT p.provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public' AND p.proname='ad_read_pending_session_v64') <> 'v'
 THEN RAISE EXCEPTION 'AD_PENDING_LOOKUP_NOT_VOLATILE'; END IF;
 IF NOT has_function_privilege('service_role','public.ad_read_pending_session_v64(uuid)','EXECUTE')
 OR has_function_privilege('authenticated','public.ad_read_pending_session_v64(uuid)','EXECUTE')
 OR has_function_privilege('anon','public.ad_read_pending_session_v64(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'AD_PENDING_LOOKUP_GRANT_CHANGED'; END IF;
END $assert$;
