BEGIN;
-- Post-security successor to superseded 0133. Preserve hardened exchange unchanged.
-- Formal exact V1 definition review and version-authority mapping are required
-- before this candidate may be authorized; do not apply as raw SQL.
DO $guard$
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'FARM_V1_MIGRATION_OWNER_REQUIRED'; END IF;
 -- Secure exchange MD5 is the reviewed local post-0134 source contract;
 -- formal post-security verification remains pending.
 -- Other supplied formal evidence uses MD5 of pg_get_functiondef, NOT SHA256 of prosrc.
 -- Keep both algorithms/inputs explicit; do not convert or interchange hashes.
 IF EXISTS (
  SELECT 1 FROM (VALUES
   ('public.farm_v1_market_purchase(uuid,text,text,timestamptz)','a41be795e1e99bfbae4270df187d3de2'),
   ('public.farm_v1_plant_land(uuid,smallint,integer,text,timestamptz)','147c5707875ab1c1575c4f060c5b508d'),
   ('public.farm_v1_harvest_land(uuid,smallint,text,timestamptz)','34382d25f9b4edf0918ebc0393859f0d'),
   ('public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz)','b4beeac56e7ac156ca142af37a4bbdb6'),
   ('public.farm_v1_settle_exclusive_farmer(uuid,timestamptz)','c155062ffc975220cd151ffb3c1dbaec')
  ) AS expected(signature,definition_md5)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
  WHERE p.oid IS NULL OR md5(pg_get_functiondef(p.oid)) IS DISTINCT FROM expected.definition_md5
 ) THEN RAISE EXCEPTION 'FARM_V1_FORMAL_DEFINITION_DRIFT'; END IF;
 IF EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('farm_v1_market_purchase',
   'farm_v1_plant_land','farm_v1_harvest_land','farm_v1_exchange_crop','farm_v1_settle_exclusive_farmer')
   AND pg_get_userbyid(p.proowner)<>'postgres'
 ) THEN RAISE EXCEPTION 'FARM_V1_FORMAL_OWNER_DRIFT'; END IF;
 IF EXISTS (
  SELECT 1 FROM (VALUES ('farm_v1_market_purchase'),('farm_v1_plant_land'),
   ('farm_v1_harvest_land'),('farm_v1_exchange_crop'),('farm_v1_settle_exclusive_farmer')) AS expected(name)
  WHERE (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname=expected.name)<>1
 ) THEN RAISE EXCEPTION 'FARM_V1_OVERLOAD_DRIFT'; END IF;
 IF to_regprocedure('public.farm_v1_settle_exclusive_farmer(uuid,timestamptz)') IS NULL
 OR to_regprocedure('public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz)') IS NULL
 THEN RAISE EXCEPTION 'FARM_V1_COMPATIBILITY_PREREQUISITE_MISSING'; END IF;
 -- Exact expected local contracts, not inferred formal parameter names.
 -- Stop before DDL when the approved target differs; never create another
 -- exchange overload or rename an existing PostgREST input argument.
 IF EXISTS (
  SELECT 1 FROM (VALUES
   ('public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz)',ARRAY['p_owner_id','p_crop_id','p_quantity','p_idempotency_key','p_exchanged_at']::text[]),
   ('public.farm_v1_settle_exclusive_farmer(uuid,timestamptz)',ARRAY['p_owner_id','p_now']::text[])
  ) AS expected(signature,argnames)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
  WHERE p.oid IS NULL OR p.proargnames IS DISTINCT FROM expected.argnames
   OR p.prorettype <> 'jsonb'::regtype OR p.proretset OR p.prokind <> 'f'
   OR p.proargmodes IS NOT NULL OR p.pronargdefaults <> 1
   OR pg_get_expr(p.proargdefaults,0) IS DISTINCT FROM 'now()'
   OR NOT p.prosecdef
   OR NOT COALESCE(p.proconfig @> CASE WHEN expected.signature LIKE '%exchange_crop%' THEN ARRAY['search_path=public']::text[] ELSE ARRAY['search_path=public, core']::text[] END,false)
   OR NOT has_function_privilege('service_role',p.oid,'EXECUTE')
   OR has_function_privilege('authenticated',p.oid,'EXECUTE') IS DISTINCT FROM (expected.signature LIKE '%exchange_crop%')
 ) THEN RAISE EXCEPTION 'FARM_V1_RPC_CONTRACT_DRIFT'; END IF;
 -- The compatibility overload is justified only by verified legacy callers.
 -- Exact source hashes below are from the local canonical callers, not the
 -- supplied formal type/order summary. Different deployed bodies must be reviewed.
 IF EXISTS (
  SELECT 1 FROM (VALUES
   ('public.farm_v1_settle_exclusive_farmer(uuid,timestamptz)','4f8de598897f24939c73a56c7f349e410c65902b2c6a0aaa621f6ecf5d6ac666'),
   ('public.farm_v1_market_purchase(uuid,text,text,timestamptz)','e0cf0c4c8ceb1eec9f41680158692100c1503adff3f6fc3b663f693ad3f0bdb3'),
   ('public.farm_v1_plant_land(uuid,smallint,integer,text,timestamptz)','91c986a03e2fc6c4e0bea4e9429e505f70bb41b94e0c02ebb1fa2747fd3a8e6f'),
   ('public.farm_v1_harvest_land(uuid,smallint,text,timestamptz)','125e85e7c9eb3616cf68544eb6fc9990a4c964fe99aae6c0f5197d733487c2c1')
  ) AS expected(signature,body_sha256)
  LEFT JOIN pg_proc p ON p.oid=to_regprocedure(expected.signature)
  WHERE p.oid IS NULL OR encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex') IS DISTINCT FROM expected.body_sha256
 ) THEN RAISE EXCEPTION 'FARM_V1_CALLER_SOURCE_DRIFT'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz)') AND encode(sha256(convert_to(replace(prosrc,E'\r\n',E'\n'),'UTF8')),'hex')='d1191cd46ef82a37a6e6eac1e384888d71d8cfe5a33c0bf3acb2a3686219b19d') THEN RAISE EXCEPTION 'FARM_V1_EXCHANGE_SOURCE_DRIFT'; END IF;
 IF to_regprocedure('public.farm_v1_settle_exclusive_farmer(uuid,boolean,boolean,boolean,boolean,timestamptz)') IS NOT NULL
 THEN RAISE EXCEPTION 'FARM_V1_COMPATIBILITY_SIGNATURE_COLLISION'; END IF;
 -- Journal prerequisites are checked BEFORE any function DDL. Current formal
 -- absence of 0132 means STOP now, not permission to install 0133 early.
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL
 THEN RAISE EXCEPTION 'FARM_V1_MIGRATION_HISTORY_MISSING'; END IF;
 IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
  WHERE version>='20261017000135' OR name IN ('farm_v1_write_compatibility','farm_v1_secure_write_compatibility'))
 THEN RAISE EXCEPTION 'FARM_V1_MIGRATION_VERSION_CONFLICT'; END IF;
 IF EXISTS (
  SELECT 1 FROM (VALUES
   ('20261017000123','farm_v2_wallet_bridge','ccef723fa764dc6dea51e7d81008e4faf49e97e342e24bd7c75b77dcd6177082'),
   ('20261017000124','farm_v2_sessions','a92a95489e844fa99d528a06b562e096dd3bf38a35b609461b9802295033f1f7'),
   ('20261017000125','farm_v2_paid_auth_identity','0d386f9832a2300078f9f12bdd5c62a0f54b3f3ecd7ffc881bc7712ca0813cae'),
   ('20261017000126','farm_v2_account_revocation','0542bfbb098c3bda30dde706dd88563c0a06d6fe1fd2e75f812236543cfcb016'),
   ('20261017000127','farm_v2_paid_operation_authority','d9f59a0e3dcbb35e8bdb4256931c8eb55072ccd059f2d473c988d2a17de7d2d3'),
   ('20261017000128','farm_v2_operator_reconciliation','b2d570f9f83536bd50c90dab3fcb023e6af452d1072f8867c9b60520ffcb5bd1'),
   ('20261017000129','farm_v2_wallet_creation_and_historical_revocation','fbadc86b4124106ba5661578e5c7c3d46fbb62f9a77b2ffed935071ecd14f6d5'),
   ('20261017000130','farm_v2_workshop_wallet_contract','7b0ad253d97d00b5cf299ccb08031dc5986e84976afc91ff47396265362b25b3'),
   ('20261017000131','farm_v2_friend_operation_barrier','7c46e2852a9e59c413cf8696b3f757297c49af6a960e156e8d8c9b64fb458ebe'),
   ('20261017000132','farm_v2_atomic_pot_settlement','346990e8a92d5a38c0a8ff28ae3dc78f74edcb548f615643ebdd6d091679c551')
  ) AS expected(version,name,source_sha256)
  LEFT JOIN supabase_migrations.schema_migrations h ON h.version=expected.version
  WHERE h.version IS NULL OR h.name IS DISTINCT FROM expected.name
   OR encode(sha256(convert_to(array_to_string(h.statements,''),'UTF8')),'hex') IS DISTINCT FROM expected.source_sha256
 ) THEN RAISE EXCEPTION 'FARM_V1_MIGRATION_PREDECESSOR_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM supabase_migrations.schema_migrations h WHERE h.version='20261016000134' AND h.name='farm_v1_exchange_owner_authorization' AND encode(sha256(convert_to(array_to_string(h.statements,''),'UTF8')),'hex')='f273153e25e218c10502b795879b8f50c5451feb25b5694d422878b9ecc4c3a6') THEN RAISE EXCEPTION 'FARM_V1_SECURITY_PREDECESSOR_DRIFT'; END IF;
 IF has_function_privilege('anon','public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz)','EXECUTE') OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure('public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz)') AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN RAISE EXCEPTION 'FARM_V1_SECURE_EXCHANGE_ACL_DRIFT'; END IF;
END;
$guard$;
CREATE FUNCTION public.farm_v1_settle_exclusive_farmer(
 p_owner_id uuid,p_exclusive_farmer_entitled boolean,p_land4_entitled boolean,
 p_land5_entitled boolean,p_land6_entitled boolean,p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $adapter$
 SELECT public.farm_v1_settle_exclusive_farmer(p_owner_id,p_now);
$adapter$;
REVOKE ALL ON FUNCTION public.farm_v1_settle_exclusive_farmer(uuid,boolean,boolean,boolean,boolean,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_settle_exclusive_farmer(uuid,boolean,boolean,boolean,boolean,timestamptz) TO service_role;

COMMIT;
