-- Additive, initially unused. Enable FARM_V2_LOCAL_COINS_ENABLED only after acceptance.
-- Backend-only schema: no browser/Data API access, no automatic balance migration.
CREATE SCHEMA IF NOT EXISTS farm_v2_bank;
REVOKE ALL ON SCHEMA farm_v2_bank FROM PUBLIC, anon, authenticated;
CREATE TABLE farm_v2_bank.wallets (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 balance integer NOT NULL DEFAULT 0 CHECK(balance>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE farm_v2_bank.ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES farm_v2_bank.wallets(user_id),
 request_key text NOT NULL,
 amount integer NOT NULL CHECK(amount>0),
 direction text NOT NULL CHECK(direction IN ('credit','debit')),
 reason text NOT NULL,
 reference text NOT NULL,
 central_transaction_id uuid REFERENCES public.core_wallet_ledger(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
ALTER TABLE farm_v2_bank.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_v2_bank.ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA farm_v2_bank FROM PUBLIC,anon,authenticated,farm_v2_runtime;
CREATE FUNCTION farm_v2_bank.immutable_ledger() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'FARM_COIN_LEDGER_IMMUTABLE'; END; $$;
CREATE TRIGGER immutable_ledger BEFORE UPDATE OR DELETE ON farm_v2_bank.ledger FOR EACH ROW EXECUTE FUNCTION farm_v2_bank.immutable_ledger();
CREATE FUNCTION farm_v2_bank.read_balances(p_user uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('coins',coalesce((SELECT balance FROM farm_v2_bank.wallets WHERE user_id=p_user),0),
 'centralCoins',coalesce((SELECT coin_balance FROM public.core_wallets WHERE owner_id=p_user),0), 'localCoinsEnabled',true);
$$;
CREATE OR REPLACE FUNCTION farm_v2_bank.post_coin(p_user uuid,p_request text,p_amount integer,p_direction text,p_reason text,p_reference text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w farm_v2_bank.wallets; e farm_v2_bank.ledger;
BEGIN
 IF p_user IS NULL OR p_request IS NULL OR p_request !~ '^[A-Za-z0-9._:-]{1,120}$' OR p_amount IS NULL OR p_amount<=0
 OR p_direction IS NULL OR p_direction NOT IN ('credit','debit') OR p_reference IS NULL OR p_reason IS NULL
 OR NOT ((p_direction='debit' AND p_reason IN ('farm_seed_purchase','farm_pot_synthesis','farm_decor_purchase','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase','farm_v2_land_unlock'))
 OR (p_direction='credit' AND p_reason IN ('farm_crop_exchange','farm_mission_reward'))) THEN
 RAISE EXCEPTION 'INVALID_FARM_WALLET_OPERATION'; END IF;
 INSERT INTO farm_v2_bank.wallets(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
 SELECT * INTO w FROM farm_v2_bank.wallets WHERE user_id=p_user FOR UPDATE;
 SELECT * INTO e FROM farm_v2_bank.ledger WHERE user_id=p_user AND request_key='op:'||p_request;
 IF FOUND THEN
  IF (e.amount,e.direction,e.reason,e.reference) IS DISTINCT FROM (p_amount,p_direction,p_reason,p_reference) THEN RAISE EXCEPTION 'FARM_WALLET_INTENT_MISMATCH'; END IF;
  RETURN jsonb_build_object('id',e.id,'duplicate',true,'coins',w.balance);
 END IF;
 IF p_direction='debit' AND w.balance<p_amount THEN RAISE EXCEPTION 'FARM_COIN_INSUFFICIENT'; END IF;
 UPDATE farm_v2_bank.wallets SET balance=balance+CASE WHEN p_direction='credit' THEN p_amount ELSE -p_amount END,updated_at=now() WHERE user_id=p_user RETURNING * INTO w;
 INSERT INTO farm_v2_bank.ledger(user_id,request_key,amount,direction,reason,reference) VALUES(p_user,'op:'||p_request,p_amount,p_direction,p_reason,p_reference) RETURNING * INTO e;
 RETURN jsonb_build_object('id',e.id,'duplicate',false,'coins',w.balance);
END; $$;

CREATE FUNCTION farm_v2_bank.transfer(p_user uuid,p_request text,p_direction text,p_amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w farm_v2_bank.wallets; e farm_v2_bank.ledger; c public.core_wallets; receipt jsonb; local_direction text;
BEGIN
 IF p_user IS NULL OR p_request IS NULL OR p_request !~ '^[A-Za-z0-9._:-]{1,120}$' OR p_direction IS NULL OR p_direction NOT IN ('in','out') OR p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'INVALID_FARM_TRANSFER'; END IF;
 IF NOT public.farm_v2_identity_active(p_user) THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 INSERT INTO farm_v2_bank.wallets(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
 SELECT * INTO w FROM farm_v2_bank.wallets WHERE user_id=p_user FOR UPDATE;
 local_direction:=CASE WHEN p_direction='in' THEN 'credit' ELSE 'debit' END;
 SELECT * INTO e FROM farm_v2_bank.ledger WHERE user_id=p_user AND request_key='transfer:'||p_request;
 IF FOUND THEN
  IF (e.amount,e.direction,e.reason) IS DISTINCT FROM (p_amount,local_direction,'transfer_'||p_direction) THEN RAISE EXCEPTION 'FARM_WALLET_INTENT_MISMATCH'; END IF;
  RETURN farm_v2_bank.read_balances(p_user)||jsonb_build_object('duplicate',true,'transferId',e.id);
 END IF;
 PERFORM public.core_wallet_get_or_create(p_user);
 SELECT * INTO c FROM public.core_wallets WHERE owner_id=p_user FOR UPDATE;
 IF c.status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'WALLET_NOT_ACTIVE'; END IF;
 IF p_direction='out' AND w.balance<p_amount THEN RAISE EXCEPTION 'FARM_COIN_INSUFFICIENT'; END IF;
 IF p_direction='in' AND c.coin_balance<p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_FUNDS'; END IF;
 -- Reject overflow before either side is written.
 IF (p_direction='in' AND w.balance::bigint+p_amount>2147483647) OR (p_direction='out' AND c.coin_balance::bigint+p_amount>2147483647) THEN RAISE EXCEPTION 'FARM_COIN_BALANCE_LIMIT'; END IF;
 receipt:=public.core_wallet_apply_transaction(p_user,p_amount,'coin',CASE WHEN p_direction='in' THEN 'debit' ELSE 'credit' END,
 'farm-v2-transfer:'||p_request,'farm_manual_transfer_'||p_direction,p_request,'farm_manual_transfer',NULL);
 IF receipt->>'result_status' IS DISTINCT FROM 'created' THEN RAISE EXCEPTION 'FARM_TRANSFER_RECONCILIATION_REQUIRED'; END IF;
 UPDATE farm_v2_bank.wallets SET balance=balance+CASE WHEN p_direction='in' THEN p_amount ELSE -p_amount END,updated_at=now() WHERE user_id=p_user;
 INSERT INTO farm_v2_bank.ledger(user_id,request_key,amount,direction,reason,reference,central_transaction_id)
 VALUES(p_user,'transfer:'||p_request,p_amount,local_direction,'transfer_'||p_direction,p_request,(receipt->'transaction'->>'id')::uuid) RETURNING * INTO e;
 RETURN farm_v2_bank.read_balances(p_user)||jsonb_build_object('duplicate',false,'transferId',e.id);
END; $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA farm_v2_bank FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA farm_v2_bank TO farm_v2_runtime;
GRANT EXECUTE ON FUNCTION farm_v2_bank.read_balances(uuid),farm_v2_bank.post_coin(uuid,text,integer,text,text,text),farm_v2_bank.transfer(uuid,text,text,integer) TO farm_v2_runtime;

CREATE FUNCTION farm_v2_bank.coin_land_rights(p_user uuid) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.farm_v2_coin_land_entitlements(p_user);
$$;
CREATE FUNCTION farm_v2_bank.purchase_land(p_user uuid,p_request text,p_land smallint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid; product uuid; e platform.entitlements; active_id uuid; cost integer; receipt jsonb;
BEGIN
 IF p_land IS NULL OR p_land NOT IN(2,3) OR p_request IS NULL OR p_request !~ '^[A-Za-z0-9._:-]{1,120}$' THEN RAISE EXCEPTION 'INVALID_FARM_LAND_ID'; END IF;
 IF NOT public.farm_v2_identity_active(p_user) THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 SELECT id INTO uid FROM core.users WHERE auth_user_id=p_user AND status='active';
 IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 SELECT id INTO product FROM platform.products WHERE product_key='qiankun-futian:land:'||p_land AND product_type='feature_unlock' AND status='active';
 IF product IS NULL THEN RAISE EXCEPTION 'CORE_COIN_LAND_UNAVAILABLE'; END IF;
 INSERT INTO farm_v2_bank.wallets(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM farm_v2_bank.wallets WHERE user_id=p_user FOR UPDATE;
 PERFORM public.core_wallet_get_or_create(p_user);
 PERFORM 1 FROM public.core_wallets WHERE owner_id=p_user FOR UPDATE;
 SELECT * INTO e FROM platform.entitlements WHERE user_id=uid AND product_id=product AND entitlement_type='lifetime' ORDER BY granted_at,id LIMIT 1;
 IF FOUND THEN
  SELECT id INTO active_id FROM platform.entitlements WHERE user_id=uid AND product_id=product AND entitlement_type='lifetime' AND status='active' ORDER BY granted_at,id LIMIT 1;
  IF active_id IS NULL THEN RAISE EXCEPTION 'CORE_COIN_LAND_UNAVAILABLE'; END IF;
  RETURN jsonb_build_object('cost',0,'entitlementId',active_id,'alreadyUnlocked',true);
 END IF;
 IF p_land=3 AND NOT EXISTS(SELECT 1 FROM platform.entitlements ent JOIN platform.products p ON p.id=ent.product_id WHERE ent.user_id=uid AND p.product_key='qiankun-futian:land:2' AND ent.entitlement_type='lifetime') THEN RAISE EXCEPTION 'CORE_COIN_LAND_LAND_2_REQUIRED'; END IF;
 cost:=CASE WHEN p_land=2 THEN 88 ELSE 888 END;
 receipt:=farm_v2_bank.post_coin(p_user,p_request,cost,'debit','farm_v2_land_unlock','qiankun-futian:land:'||p_land);
 IF receipt->>'duplicate'='true' THEN RAISE EXCEPTION 'FARM_TRANSFER_RECONCILIATION_REQUIRED'; END IF;
 INSERT INTO platform.entitlements(user_id,product_id,entitlement_type,status,granted_at) VALUES(uid,product,'lifetime','active',now()) RETURNING id INTO active_id;
 INSERT INTO platform.entitlement_events(entitlement_id,event_type,source,reference_id) VALUES(active_id,'granted','purchase',(receipt->>'id')::uuid);
 RETURN jsonb_build_object('cost',cost,'entitlementId',active_id,'alreadyUnlocked',false);
END; $$;
REVOKE ALL ON FUNCTION farm_v2_bank.coin_land_rights(uuid),farm_v2_bank.purchase_land(uuid,text,smallint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION farm_v2_bank.coin_land_rights(uuid),farm_v2_bank.purchase_land(uuid,text,smallint) TO farm_v2_runtime;
