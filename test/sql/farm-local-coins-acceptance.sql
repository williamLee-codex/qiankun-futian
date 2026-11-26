-- Run ONLY against isolated acceptance DB. Entire fixture is rolled back.
BEGIN;
DO $$
DECLARE u uuid:=gen_random_uuid(); r jsonb; n integer;
BEGIN
 INSERT INTO auth.users(id) VALUES(u);
 PERFORM public.core_wallet_apply_transaction(u,100,'coin','credit','fixture','fixture','fixture','fixture',NULL);
 r:=farm_v2_bank.transfer(u,'deposit','in',40);
 ASSERT r->>'coins'='40' AND r->>'centralCoins'='60','deposit conservation';
 r:=farm_v2_bank.transfer(u,'deposit','in',40);
 ASSERT r->>'duplicate'='true' AND r->>'coins'='40','duplicate deposit';
 BEGIN
  PERFORM farm_v2_bank.transfer(u,'deposit','in',41);
  RAISE EXCEPTION 'expected conflict';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='FARM_WALLET_INTENT_MISMATCH',SQLERRM; END;
 BEGIN
  PERFORM farm_v2_bank.transfer(u,'overdraw','out',41);
  RAISE EXCEPTION 'expected insufficient';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='FARM_COIN_INSUFFICIENT',SQLERRM; END;
 PERFORM farm_v2_bank.post_coin(u,'seed',1,'debit','farm_seed_purchase','1:1');
 PERFORM farm_v2_bank.post_coin(u,'seed',1,'debit','farm_seed_purchase','1:1');
 r:=farm_v2_bank.read_balances(u);ASSERT r->>'coins'='39' AND r->>'centralCoins'='60','local debit once';
 -- Simulate asset failure after debit: PostgreSQL subtransaction rolls both back.
 BEGIN
  PERFORM farm_v2_bank.post_coin(u,'failed-assets',10,'debit','farm_seed_purchase','1:10');
  RAISE EXCEPTION 'simulated_asset_failure';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='simulated_asset_failure'; END;
 r:=farm_v2_bank.read_balances(u);ASSERT r->>'coins'='39','failed assets refunded by rollback';
 PERFORM farm_v2_bank.post_coin(u,'crops',5,'credit','farm_crop_exchange','1:25');
 r:=farm_v2_bank.transfer(u,'withdraw','out',44);
 ASSERT r->>'coins'='0' AND r->>'centralCoins'='104','withdraw conservation';
 PERFORM farm_v2_bank.transfer(u,'withdraw','out',44);
 r:=farm_v2_bank.read_balances(u);ASSERT r->>'centralCoins'='104','duplicate withdrawal';
 BEGIN
  UPDATE farm_v2_bank.ledger SET amount=2 WHERE user_id=u;
  RAISE EXCEPTION 'expected immutable';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='FARM_COIN_LEDGER_IMMUTABLE',SQLERRM; END;
 SELECT count(*) INTO n FROM public.core_wallet_ledger WHERE owner_id=u;
 ASSERT n=3,'only fixture and two manual central transfers';
 ASSERT NOT has_function_privilege('anon','farm_v2_bank.transfer(uuid,text,text,integer)','execute'),'anonymous cannot transfer';
 ASSERT NOT has_function_privilege('authenticated','farm_v2_bank.post_coin(uuid,text,integer,text,text,text)','execute'),'browser cannot post coins';
END; $$;
ROLLBACK;
SELECT 'PASS: transfer conservation, duplicate replay/conflict, insufficient funds, local debit/reward, rollback, ledger immutability, restricted grants' AS result;
