BEGIN;
-- Review-only forward security candidate. No raw execution authorization.
-- Add caller authorization and preserve the existing 0133 NULL-safe retry fix.
DO $guard$
DECLARE p pg_proc%ROWTYPE; source_hash text;
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'FARM_EXCHANGE_MIGRATION_OWNER_REQUIRED'; END IF;
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz)');
 IF NOT FOUND THEN RAISE EXCEPTION 'FARM_EXCHANGE_SOURCE_MISSING'; END IF;
 source_hash:=encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex');
 IF source_hash NOT IN ('0c9ec4136f80b8c2ccaf69c4fb2c92b24627a858f99a5edf51e9282c597712e9','836e941b19ce4c5100fd1afaf0b65e9c9eda53fb8b236515517eb1ff87832d64')
 THEN RAISE EXCEPTION 'FARM_EXCHANGE_SOURCE_DRIFT'; END IF;
 IF pg_get_userbyid(p.proowner)<>'postgres' OR NOT p.prosecdef OR p.prorettype<>'jsonb'::regtype
 OR p.proargnames IS DISTINCT FROM ARRAY['p_owner_id','p_crop_id','p_quantity','p_idempotency_key','p_exchanged_at']::text[]
 OR p.pronargdefaults<>1 OR pg_get_expr(p.proargdefaults,0)<>'now()'
 OR p.proconfig IS DISTINCT FROM ARRAY['search_path=public']::text[]
 THEN RAISE EXCEPTION 'FARM_EXCHANGE_CONTRACT_DRIFT'; END IF;
 IF (SELECT count(*) FROM pg_proc f JOIN pg_namespace n ON n.oid=f.pronamespace WHERE n.nspname='public' AND f.proname='farm_v1_exchange_crop')<>1
 THEN RAISE EXCEPTION 'FARM_EXCHANGE_OVERLOAD_DRIFT'; END IF;
 IF NOT has_function_privilege('service_role',p.oid,'EXECUTE')

 OR EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
 THEN RAISE EXCEPTION 'FARM_EXCHANGE_ACL_DRIFT'; END IF;
 IF source_hash='836e941b19ce4c5100fd1afaf0b65e9c9eda53fb8b236515517eb1ff87832d64' AND NOT EXISTS(
 SELECT 1 FROM supabase_migrations.schema_migrations h WHERE h.version='20261014000133' AND h.name='farm_v1_write_compatibility'
 AND encode(sha256(convert_to(array_to_string(h.statements,''),'UTF8')),'hex')='bab55eeca8eee6dd0e89e07d440f0000fa917852a5011e3e6ada349bd161fa16')
 THEN RAISE EXCEPTION 'FARM_EXCHANGE_0133_JOURNAL_DRIFT'; END IF;
END;
$guard$;
DO $patch$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(to_regprocedure('public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz)')) INTO definition;
 IF array_length(string_to_array(definition,E'\nBEGIN\n'),1)<>2 THEN RAISE EXCEPTION 'FARM_EXCHANGE_BODY_SHAPE_DRIFT'; END IF;
 -- PostgreSQL role is a protected built-in SET ROLE context, not JWT claims.
 -- SECURITY DEFINER changes current_user to postgres, so never use it here.
 definition:=replace(definition,E'\nBEGIN\n',E'\nBEGIN\n' || $authorization$
  IF NOT (
    current_setting('role',true)='service_role'
    OR (current_setting('role',true)='none' AND session_user='service_role')
  ) THEN
    IF NOT (
      current_setting('role',true)='authenticated'
      OR (current_setting('role',true)='none' AND session_user='authenticated')
    ) THEN RAISE EXCEPTION 'FARM_EXCHANGE_CALLER_DENIED' USING ERRCODE='42501'; END IF;
    IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_owner_id
    THEN RAISE EXCEPTION 'FARM_EXCHANGE_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
  END IF;
$authorization$);
 -- Existing 0054 has a nullable INSERT RETURNING boolean. Carry forward the
 -- already reviewed 0133 NULL-safe retry branch; never change exchange values.
 definition:=replace(definition,'IF NOT v_inserted THEN','IF NOT COALESCE(v_inserted,false) THEN');
 EXECUTE definition;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz)')
 AND encode(sha256(convert_to(prosrc,'UTF8')),'hex')='d1191cd46ef82a37a6e6eac1e384888d71d8cfe5a33c0bf3acb2a3686219b19d')
 THEN RAISE EXCEPTION 'FARM_EXCHANGE_HARDENED_SOURCE_MISMATCH'; END IF;
END;
$patch$;
-- Keep service execution. Keep authenticated only if already granted: no new ACL.
REVOKE ALL ON FUNCTION public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz) TO service_role;
COMMIT;
