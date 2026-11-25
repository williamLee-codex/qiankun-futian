BEGIN;
DO $$
DECLARE u uuid:=gen_random_uuid(); r jsonb; n integer;
BEGIN
 INSERT INTO auth.users(id) VALUES(u);
 INSERT INTO core.users(auth_user_id,status) VALUES(u,'active');
 PERFORM public.core_wallet_apply_transaction(u,2000,'coin','credit','fixture','fixture','fixture','fixture',NULL);
 PERFORM farm_v2_bank.transfer(u,'deposit','in',1000);
 BEGIN
  PERFORM farm_v2_bank.purchase_land(u,'three-first',3::smallint);
  RAISE EXCEPTION 'expected land 2';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='CORE_COIN_LAND_LAND_2_REQUIRED',SQLERRM;END;
 PERFORM farm_v2_bank.purchase_land(u,'land-two',2::smallint);
 PERFORM farm_v2_bank.purchase_land(u,'land-two',2::smallint);
 PERFORM farm_v2_bank.purchase_land(u,'land-two-other-key',2::smallint);
 r:=farm_v2_bank.read_balances(u);ASSERT r->>'coins'='912' AND r->>'centralCoins'='1000','land 2 charges local once';
 PERFORM farm_v2_bank.purchase_land(u,'land-three',3::smallint);
 r:=farm_v2_bank.read_balances(u);ASSERT r->>'coins'='24' AND r->>'centralCoins'='1000','land 3 charges local';
 r:=farm_v2_bank.coin_land_rights(u);ASSERT r->>'result_status'='ok','canonical rights';
 ASSERT jsonb_array_length(r->'lands')=2,'two canonical rights';
 ASSERT NOT has_function_privilege('authenticated','farm_v2_bank.purchase_land(uuid,text,smallint)','execute'),'browser cannot unlock directly';
END;$$;
ROLLBACK;
SELECT 'PASS: local 88/888 unlock, prerequisite, duplicate and new-key repeats, unchanged central balance, canonical rights and grants' AS result;
