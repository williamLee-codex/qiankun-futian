BEGIN;
-- Forward-only candidate. Do not edit recorded 0054/0105-0109 sources.
-- Formal exact V1 definition review and version-authority mapping are required
-- before this candidate may be authorized; do not apply as raw SQL.
DO $guard$
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'FARM_V1_MIGRATION_OWNER_REQUIRED'; END IF;
 -- Formal evidence uses MD5 of pg_get_functiondef, NOT SHA256 of prosrc.
 -- Keep both algorithms/inputs explicit; do not convert or interchange hashes.
 IF EXISTS (
  SELECT 1 FROM (VALUES
   ('public.farm_v1_market_purchase(uuid,text,text,timestamptz)','a41be795e1e99bfbae4270df187d3de2'),
   ('public.farm_v1_plant_land(uuid,smallint,integer,text,timestamptz)','147c5707875ab1c1575c4f060c5b508d'),
   ('public.farm_v1_harvest_land(uuid,smallint,text,timestamptz)','34382d25f9b4edf0918ebc0393859f0d'),
   ('public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz)','57c3c54e3026ac7520e19546238bf19e'),
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
 IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.farm_v1_exchange_crop(uuid,text,integer,text,timestamptz)') AND encode(sha256(convert_to(replace(prosrc,E'\r\n',E'\n'),'UTF8')),'hex')='0c9ec4136f80b8c2ccaf69c4fb2c92b24627a858f99a5edf51e9282c597712e9') THEN RAISE EXCEPTION 'FARM_V1_EXCHANGE_SOURCE_DRIFT'; END IF;
 IF to_regprocedure('public.farm_v1_settle_exclusive_farmer(uuid,boolean,boolean,boolean,boolean,timestamptz)') IS NOT NULL
 THEN RAISE EXCEPTION 'FARM_V1_COMPATIBILITY_SIGNATURE_COLLISION'; END IF;
 -- Journal prerequisites are checked BEFORE any function DDL. Current formal
 -- absence of 0132 means STOP now, not permission to install 0133 early.
 IF to_regclass('supabase_migrations.schema_migrations') IS NULL
 THEN RAISE EXCEPTION 'FARM_V1_MIGRATION_HISTORY_MISSING'; END IF;
 IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
  WHERE version>='20261014000133' OR name='farm_v1_write_compatibility')
 THEN RAISE EXCEPTION 'FARM_V1_MIGRATION_VERSION_CONFLICT'; END IF;
 IF EXISTS (
  SELECT 1 FROM (VALUES
   ('20261014000123','farm_v2_wallet_bridge','ccef723fa764dc6dea51e7d81008e4faf49e97e342e24bd7c75b77dcd6177082'),
   ('20261014000124','farm_v2_sessions','a92a95489e844fa99d528a06b562e096dd3bf38a35b609461b9802295033f1f7'),
   ('20261014000125','farm_v2_paid_auth_identity','0d386f9832a2300078f9f12bdd5c62a0f54b3f3ecd7ffc881bc7712ca0813cae'),
   ('20261014000126','farm_v2_account_revocation','0542bfbb098c3bda30dde706dd88563c0a06d6fe1fd2e75f812236543cfcb016'),
   ('20261014000127','farm_v2_paid_operation_authority','d9f59a0e3dcbb35e8bdb4256931c8eb55072ccd059f2d473c988d2a17de7d2d3'),
   ('20261014000128','farm_v2_operator_reconciliation','b2d570f9f83536bd50c90dab3fcb023e6af452d1072f8867c9b60520ffcb5bd1'),
   ('20261014000129','farm_v2_wallet_creation_and_historical_revocation','fbadc86b4124106ba5661578e5c7c3d46fbb62f9a77b2ffed935071ecd14f6d5'),
   ('20261014000130','farm_v2_workshop_wallet_contract','7b0ad253d97d00b5cf299ccb08031dc5986e84976afc91ff47396265362b25b3'),
   ('20261014000131','farm_v2_friend_operation_barrier','7c46e2852a9e59c413cf8696b3f757297c49af6a960e156e8d8c9b64fb458ebe'),
   ('20261014000132','farm_v2_atomic_pot_settlement','346990e8a92d5a38c0a8ff28ae3dc78f74edcb548f615643ebdd6d091679c551')
  ) AS expected(version,name,source_sha256)
  LEFT JOIN supabase_migrations.schema_migrations h ON h.version=expected.version
  WHERE h.version IS NULL OR h.name IS DISTINCT FROM expected.name
   OR encode(sha256(convert_to(array_to_string(h.statements,''),'UTF8')),'hex') IS DISTINCT FROM expected.source_sha256
 ) THEN RAISE EXCEPTION 'FARM_V1_MIGRATION_PREDECESSOR_DRIFT'; END IF;
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

CREATE OR REPLACE FUNCTION public.farm_v1_exchange_crop(
  p_owner_id uuid,
  p_crop_id text,
  p_quantity integer,
  p_idempotency_key text,
  p_exchanged_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inventory public.farm_v1_inventory;
  v_existing public.farm_v1_exchange_records;
  v_existing_operation_type text;
  v_exchange_quantity integer;
  v_exchange_currency text;
  v_exchange_value integer := 1;
  v_wallet_result jsonb;
  v_wallet_status text;
  v_wallet_transaction_id uuid;
  v_inserted boolean := false;
BEGIN
  IF p_owner_id IS NULL OR btrim(COALESCE(p_idempotency_key, '')) = '' OR p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'Invalid farm crop exchange request';
  END IF;

  v_exchange_quantity := CASE p_crop_id
    WHEN 'yao-jin-su' THEN 20
    WHEN 'yue-hai-tan' THEN 8
    WHEN 'chi-xue-shen' THEN 3
    WHEN 'tian-shu-man' THEN 2
    WHEN 'tai-wei-lian' THEN 1
    WHEN 'hun-dun-jing-hua' THEN 1
    ELSE NULL
  END;

  IF v_exchange_quantity IS NULL THEN
    RAISE EXCEPTION 'Unknown farm crop';
  END IF;

  v_exchange_currency := CASE p_crop_id
    WHEN 'hun-dun-jing-hua' THEN 'crystal'
    ELSE 'coin'
  END;

  IF p_quantity % v_exchange_quantity <> 0 THEN
    RAISE EXCEPTION 'Invalid farm crop exchange quantity';
  END IF;

  INSERT INTO public.farm_v1_exchange_records (
    owner_id,
    idempotency_key,
    crop_id,
    quantity,
    exchange_quantity,
    exchange_currency,
    exchange_value,
    created_at
  ) VALUES (
    p_owner_id,
    p_idempotency_key,
    p_crop_id,
    p_quantity,
    v_exchange_quantity,
    v_exchange_currency,
    v_exchange_value,
    p_exchanged_at
  )
  ON CONFLICT (owner_id, idempotency_key) DO NOTHING
  RETURNING true INTO v_inserted;

  IF NOT COALESCE(v_inserted,false) THEN
    SELECT * INTO v_existing
    FROM public.farm_v1_exchange_records
    WHERE owner_id = p_owner_id
      AND idempotency_key = p_idempotency_key;

    IF v_existing.crop_id <> p_crop_id
      OR v_existing.quantity <> p_quantity
      OR v_existing.exchange_quantity <> v_exchange_quantity
      OR v_existing.exchange_currency <> v_exchange_currency
      OR v_existing.exchange_value <> v_exchange_value THEN
      RETURN jsonb_build_object('result_status', 'duplicate_conflict');
    END IF;

    RETURN jsonb_build_object(
      'result_status', 'duplicate',
      'crop_id', v_existing.crop_id,
      'quantity', v_existing.quantity,
      'exchange_quantity', v_existing.exchange_quantity,
      'exchange_currency', v_existing.exchange_currency,
      'exchange_value', v_existing.exchange_value,
      'wallet_transaction_id', v_existing.wallet_transaction_id
    );
  END IF;

  INSERT INTO public.farm_v1_operation_records (
    owner_id,
    idempotency_key,
    operation_type,
    recorded_at
  ) VALUES (
    p_owner_id,
    p_idempotency_key,
    'exchange',
    p_exchanged_at
  )
  ON CONFLICT (owner_id, idempotency_key) DO NOTHING;

  SELECT operation_type INTO v_existing_operation_type
  FROM public.farm_v1_operation_records
  WHERE owner_id = p_owner_id
    AND idempotency_key = p_idempotency_key;

  IF v_existing_operation_type <> 'exchange' THEN
    DELETE FROM public.farm_v1_exchange_records
    WHERE owner_id = p_owner_id
      AND idempotency_key = p_idempotency_key;

    RETURN jsonb_build_object('result_status', 'duplicate_conflict');
  END IF;

  SELECT * INTO v_inventory
  FROM public.farm_v1_inventory
  WHERE owner_id = p_owner_id
    AND item_key = p_crop_id
  FOR UPDATE;

  IF NOT FOUND OR v_inventory.quantity < p_quantity THEN
    DELETE FROM public.farm_v1_exchange_records
    WHERE owner_id = p_owner_id
      AND idempotency_key = p_idempotency_key;

    DELETE FROM public.farm_v1_operation_records
    WHERE owner_id = p_owner_id
      AND idempotency_key = p_idempotency_key
      AND operation_type = 'exchange';

    RETURN jsonb_build_object('result_status', 'insufficient_inventory');
  END IF;

  v_wallet_result := public.core_wallet_apply_transaction(
    p_owner_id,
    (p_quantity / v_exchange_quantity) * v_exchange_value,
    v_exchange_currency,
    'credit',
    'farm-exchange:' || p_idempotency_key,
    'farm_exchange',
    p_crop_id,
    'farm_crop',
    NULL
  );

  v_wallet_status := v_wallet_result ->> 'result_status';
  IF v_wallet_status NOT IN ('created', 'duplicate') THEN
    RAISE EXCEPTION 'Farm crop exchange wallet settlement failed: %', COALESCE(v_wallet_status, 'unknown');
  END IF;

  v_wallet_transaction_id := NULLIF(v_wallet_result #>> '{transaction,id}', '')::uuid;

  UPDATE public.farm_v1_inventory
  SET quantity = quantity - p_quantity,
      updated_at = p_exchanged_at
  WHERE owner_id = p_owner_id
    AND item_key = p_crop_id;

  UPDATE public.farm_v1_exchange_records
  SET wallet_transaction_id = v_wallet_transaction_id
  WHERE owner_id = p_owner_id
    AND idempotency_key = p_idempotency_key;

  RETURN jsonb_build_object(
    'result_status', 'created',
    'crop_id', p_crop_id,
    'quantity', p_quantity,
    'exchange_quantity', v_exchange_quantity,
    'exchange_currency', v_exchange_currency,
    'exchange_value', v_exchange_value,
    'wallet_transaction_id', v_wallet_transaction_id
  );
END;
$$;

-- CREATE OR REPLACE preserves existing owner and complete ACL, including
-- the formally confirmed authenticated EXECUTE grant. Do not rewrite grants.
COMMIT;
