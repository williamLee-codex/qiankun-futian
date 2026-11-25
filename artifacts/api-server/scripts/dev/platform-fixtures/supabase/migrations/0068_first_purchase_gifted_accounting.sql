-- Atomic delivery of canonical first-purchase rewards, including gifted-only accounting. Service role only.
BEGIN;
CREATE OR REPLACE FUNCTION platform.deliver_farm_first_purchase_reward(
 p_user_id text,p_plan_id text,p_claim_day integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog,platform,public AS $$
DECLARE
 v_int platform.farm_first_purchase_reward_intents%ROWTYPE;
 v_ent platform.farm_first_purchase_entitlements%ROWTYPE;
 v_state jsonb; v_materials jsonb; v_pots jsonb; v_gift jsonb;
 v_item text; v_qty integer; v_old integer; v_grade text;
 v_species integer; v_owner uuid; v_wallet jsonb;
 v_key text; v_crystals integer:=0; v_pot jsonb;
 v_previous_species integer; v_record jsonb;
BEGIN
 IF p_plan_id NOT IN ('A','B','C') OR p_claim_day NOT BETWEEN 1 AND 3 THEN
  RETURN jsonb_build_object('status','invalid_request');
 END IF;
 SELECT * INTO v_int FROM platform.farm_first_purchase_reward_intents
 WHERE user_id=p_user_id AND plan_id=p_plan_id AND claim_day=p_claim_day FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','no_request'); END IF;
 IF v_int.status='delivered' THEN RETURN jsonb_build_object('status','already_claimed'); END IF;
 SELECT * INTO v_ent FROM platform.farm_first_purchase_entitlements
 WHERE user_id=p_user_id AND plan_id=p_plan_id;
 IF NOT FOUND OR now()<v_ent.paid_at THEN RETURN jsonb_build_object('status','not_eligible'); END IF;
 IF p_claim_day > least(3,((now() AT TIME ZONE 'Asia/Taipei'-interval '5 hours')::date
 -(v_ent.paid_at AT TIME ZONE 'Asia/Taipei'-interval '5 hours')::date)+1)
 THEN RETURN jsonb_build_object('status','not_yet_available'); END IF;
 v_owner:=public.farm_v2_resolve_verified_wallet_owner(p_user_id);
 IF v_owner IS NULL THEN RETURN jsonb_build_object('status','unverified_identity'); END IF;
 SELECT warehouse_state INTO v_state FROM public.farm_v2_player_state
 WHERE user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR jsonb_typeof(v_state#>'{workshop,materials}')<>'object'
 OR jsonb_typeof(v_state#>'{workshop,pots}')<>'array'
 THEN RETURN jsonb_build_object('status','invalid_workshop'); END IF;
 v_materials:=v_state#>'{workshop,materials}';
 v_pots:=v_state#>'{workshop,pots}';
 v_key:='farm-v2:first-purchase:'||p_user_id||':'||p_plan_id||':'||p_claim_day;
 -- Recompute canonical bundle: persisted intent is never trusted as an award authority.
 IF v_int.reward_items IS DISTINCT FROM (
  jsonb_build_array(jsonb_build_object('item','gift_crystals',
   'quantity',CASE p_plan_id WHEN 'A' THEN 20 WHEN 'B' THEN 60 ELSE 120 END))
  || CASE p_claim_day
   WHEN 1 THEN jsonb_build_array(
    jsonb_build_object('item','spirit_sand','quantity',CASE p_plan_id WHEN 'A' THEN 6 WHEN 'B' THEN 18 ELSE 36 END),
    jsonb_build_object('item',CASE p_plan_id WHEN 'A' THEN 'random_mystic_pot' WHEN 'B' THEN 'random_heaven_pot_distinct' ELSE 'random_sacred_pot_distinct' END,'quantity',1))
   WHEN 2 THEN jsonb_build_array(
    jsonb_build_object('item','jade_marrow','quantity',CASE p_plan_id WHEN 'A' THEN 3 WHEN 'B' THEN 9 ELSE 18 END),
    jsonb_build_object('item','double_harvest','quantity',CASE p_plan_id WHEN 'A' THEN 4 WHEN 'B' THEN 12 ELSE 24 END))
   ELSE jsonb_build_array(
    jsonb_build_object('item','double_harvest','quantity',CASE p_plan_id WHEN 'A' THEN 4 WHEN 'B' THEN 12 ELSE 24 END),
    jsonb_build_object('item',CASE p_plan_id WHEN 'A' THEN 'random_earth_pot' WHEN 'B' THEN 'random_heaven_pot_distinct' ELSE 'random_sacred_pot_distinct' END,'quantity',1))
  END
 ) THEN RAISE EXCEPTION 'NON_CANONICAL_REWARD_INTENT'; END IF;
 FOR v_gift IN SELECT value FROM jsonb_array_elements(v_int.reward_items) LOOP
  v_item:=v_gift->>'item'; v_qty:=(v_gift->>'quantity')::integer;
  IF v_qty IS NULL OR v_qty<1 THEN RAISE EXCEPTION 'INVALID_REWARD_QUANTITY'; END IF;
  IF v_item='gift_crystals' THEN
   IF v_qty<>(CASE p_plan_id WHEN 'A' THEN 20 WHEN 'B' THEN 60 ELSE 120 END)
    THEN RAISE EXCEPTION 'INVALID_CRYSTAL_AMOUNT'; END IF;
   v_crystals:=v_crystals+v_qty;
  ELSIF v_item IN ('spirit_sand','jade_marrow') THEN
   IF (v_item='spirit_sand' AND p_claim_day<>1)
      OR (v_item='jade_marrow' AND p_claim_day<>2)
      OR v_qty<>(CASE p_plan_id WHEN 'A' THEN CASE v_item WHEN 'spirit_sand' THEN 6 ELSE 3 END WHEN 'B' THEN CASE v_item WHEN 'spirit_sand' THEN 18 ELSE 9 END ELSE CASE v_item WHEN 'spirit_sand' THEN 36 ELSE 18 END END)
   THEN RAISE EXCEPTION 'INVALID_MATERIAL_REWARD'; END IF;
   v_item:=CASE v_item WHEN 'spirit_sand' THEN '蘊靈砂' ELSE '九霄玉髓' END;
   IF v_materials ? v_item AND jsonb_typeof(v_materials->v_item)<>'number' THEN
    RAISE EXCEPTION 'INVALID_MATERIAL_STATE'; END IF;
   v_old:=coalesce((v_materials->>v_item)::integer,0);
   IF v_old<0 OR v_old>2147483647-v_qty THEN RAISE EXCEPTION 'MATERIAL_OVERFLOW'; END IF;
   v_materials:=jsonb_set(v_materials,ARRAY[v_item],to_jsonb(v_old+v_qty),true);
  ELSIF v_item='double_harvest' THEN
   IF p_claim_day NOT IN (2,3) OR v_qty<>(CASE p_plan_id WHEN 'A' THEN 4 WHEN 'B' THEN 12 ELSE 24 END)
   THEN RAISE EXCEPTION 'INVALID_CONSUMABLE_REWARD'; END IF;
   INSERT INTO public.farm_v2_consumable_balances(user_id,item_id,quantity)
   VALUES(p_user_id,'double_harvest',0) ON CONFLICT DO NOTHING;
   UPDATE public.farm_v2_consumable_balances SET quantity=quantity+v_qty,updated_at=now()
   WHERE user_id=p_user_id AND item_id='double_harvest' AND quantity<=2147483647-v_qty;
   IF NOT FOUND THEN RAISE EXCEPTION 'CONSUMABLE_OVERFLOW'; END IF;
   INSERT INTO public.farm_v2_consumable_ledger(user_id,item_id,quantity,source_type,source_key)
   VALUES(p_user_id,'double_harvest',v_qty,'first_purchase',v_key);
  ELSIF v_item IN ('random_mystic_pot','random_earth_pot','random_heaven_pot_distinct','random_sacred_pot_distinct') THEN
   IF v_qty<>1 OR (p_plan_id='A' AND
     NOT ((p_claim_day=1 AND v_item='random_mystic_pot') OR (p_claim_day=3 AND v_item='random_earth_pot')))
     OR (p_plan_id='B' AND v_item<>'random_heaven_pot_distinct')
     OR (p_plan_id='C' AND v_item<>'random_sacred_pot_distinct')
     OR p_claim_day=2 THEN RAISE EXCEPTION 'INVALID_POT_REWARD'; END IF;
   v_grade:=CASE v_item WHEN 'random_mystic_pot' THEN '玄'
     WHEN 'random_earth_pot' THEN '地'
     WHEN 'random_heaven_pot_distinct' THEN '天' ELSE '聖' END;
   IF p_claim_day=3 AND p_plan_id IN ('B','C') THEN
    SELECT (pot->>'species')::integer INTO v_previous_species
    FROM jsonb_array_elements(v_pots) pot
    WHERE pot->>'firstPurchaseKey'='farm-v2:first-purchase:'||p_user_id||':'||p_plan_id||':1'
    LIMIT 1;
    IF v_previous_species IS NULL THEN RAISE EXCEPTION 'FIRST_POT_NOT_FOUND'; END IF;
   END IF;
   v_species:=1+floor(random()*6)::integer;
   IF v_previous_species IS NOT NULL AND v_species=v_previous_species THEN
    v_species:=(v_species%6)+1;
   END IF;
   v_pot:=jsonb_build_object('id',gen_random_uuid(),'grade',v_grade,'species',v_species,
     'displayed',false,'acquiredAt',floor(extract(epoch from clock_timestamp())*1000)::bigint,
     'firstPurchaseKey',v_key);
   v_pots:=v_pots||jsonb_build_array(v_pot);
  ELSE RAISE EXCEPTION 'UNSUPPORTED_REWARD_ITEM: %',v_item;
  END IF;
 END LOOP;
 IF v_crystals<>(CASE p_plan_id WHEN 'A' THEN 20 WHEN 'B' THEN 60 ELSE 120 END)
 THEN RAISE EXCEPTION 'MISSING_CRYSTAL_REWARD'; END IF;
 v_wallet:=public.core_wallet_apply_transaction(v_owner,v_crystals,'crystal','credit',
   v_key,'farm_v2_first_purchase',p_plan_id||':'||p_claim_day,'farm_v2_first_purchase',NULL);
 IF v_wallet->>'result_status'<>'created' OR nullif(v_wallet#>>'{transaction,id}','') IS NULL
 THEN RAISE EXCEPTION 'FIRST_PURCHASE_WALLET_CREDIT_FAILURE'; END IF;
 -- Keep gifted crystals out of paid-value unlock accounting.
 INSERT INTO public.transactions(user_id,app_id,type,credit_kind,amount,direction,status,purpose,idempotency_key,metadata)
 VALUES(v_owner,'qiankun-futian','gifted_credit','gifted',v_crystals,'credit','succeeded',
   'farm_v2_first_purchase',v_key,
   jsonb_build_object('plan_id',p_plan_id,'claim_day',p_claim_day,'wallet_transaction_id',v_wallet#>>'{transaction,id}'));
 UPDATE public.farm_v2_player_state SET warehouse_state=jsonb_set(
   jsonb_set(v_state,'{workshop,materials}',v_materials,false),'{workshop,pots}',v_pots,false),
   updated_at=now() WHERE user_id=p_user_id;
 INSERT INTO platform.farm_first_purchase_claims(user_id,plan_id,claim_day,gift_crystals,grant_reference)
 VALUES(p_user_id,p_plan_id,p_claim_day,v_crystals,v_key);
 UPDATE platform.farm_first_purchase_reward_intents SET status='delivered',delivered_at=now()
 WHERE user_id=p_user_id AND plan_id=p_plan_id AND claim_day=p_claim_day;
 RETURN jsonb_build_object('status','claimed','crystals',v_crystals,'grant_reference',v_key);
END $$;
REVOKE ALL ON FUNCTION platform.deliver_farm_first_purchase_reward(text,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform.deliver_farm_first_purchase_reward(text,text,integer) TO service_role;
COMMIT;
