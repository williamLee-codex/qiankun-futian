BEGIN;
-- The production crystal guard refuses any crystal ledger row whose reason or
-- reference_type reads as a transfer, and the historical label
-- 'farm_crop_exchange' does. The same-wallet gameplay credit is relabelled
-- 'farm_crop_reward'. This migration teaches the bridge, the operator
-- reconciliation RPC and the ledger guard the new label; every amount,
-- direction, currency, quantity and idempotency rule stays identical.
CREATE OR REPLACE FUNCTION public.farm_v2_apply_wallet_transaction(
  p_owner_id uuid, p_request_id text, p_amount integer, p_currency text,
  p_direction text, p_reason text, p_reference_id text, p_reference_type text,
  p_original_transaction_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE
  v_key text;
  v_original public.core_wallet_ledger;
  v_land integer;
  v_quantity bigint;
  v_unit integer;
  v_reward integer;
  v_result jsonb;
BEGIN
  IF p_owner_id IS NULL OR p_request_id IS NULL
     OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$'
     OR p_amount IS NULL OR p_amount <= 0 OR p_currency IS NULL
     OR p_direction IS NULL OR p_reason IS NULL
     OR p_reference_id IS NULL OR p_reference_type IS NULL THEN
    RETURN jsonb_build_object('result_status','invalid');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-wallet:' || p_owner_id::text, 0));
  v_key := 'farm-v2:' || p_request_id || ':primary';
  IF p_reason<>'farm_wallet_compensation' AND EXISTS(SELECT 1 FROM public.farm_v2_wallet_closures WHERE user_id=p_owner_id AND request_id=p_request_id) THEN RETURN jsonb_build_object('result_status','compensated'); END IF;

  IF p_reason = 'farm_wallet_compensation' THEN
    SELECT * INTO v_original FROM public.core_wallet_ledger
      WHERE id=p_original_transaction_id AND owner_id=p_owner_id
        AND idempotency_key=v_key AND reversal_of IS NULL;
    IF NOT FOUND OR v_original.reason NOT IN ('farm_seed_purchase','farm_crop_exchange','farm_crop_reward')
      OR p_reference_type <> 'farm_wallet_compensation' OR p_reference_id <> p_request_id
      OR p_amount <> v_original.amount OR p_currency <> v_original.currency
      OR p_direction <> (CASE v_original.direction WHEN 'debit' THEN 'credit' ELSE 'debit' END) THEN
      RETURN jsonb_build_object('result_status','invalid');
    END IF;
    v_key := 'farm-v2:' || p_request_id || ':compensation';
  ELSE
    IF p_original_transaction_id IS NOT NULL OR p_reference_id !~ '^[1-6]:[1-9][0-9]{0,9}$' THEN
      RETURN jsonb_build_object('result_status','invalid');
    END IF;
    v_land := split_part(p_reference_id, ':', 1)::integer;
    v_quantity := split_part(p_reference_id, ':', 2)::bigint;
    IF v_quantity > 2147483647 THEN RETURN jsonb_build_object('result_status','invalid'); END IF;
    IF p_reason = 'farm_seed_purchase' THEN
      IF p_reference_type <> 'farm_seed_pack' OR p_currency <> 'coin' OR p_direction <> 'debit'
         OR v_land=6 OR p_amount <> v_quantity THEN
        RETURN jsonb_build_object('result_status','invalid');
      END IF;
    ELSIF p_reason IN ('farm_crop_exchange','farm_crop_reward') THEN
      v_unit := CASE v_land WHEN 1 THEN 5 WHEN 2 THEN 2 ELSE 1 END;
      v_reward := CASE v_land WHEN 4 THEN 2 WHEN 5 THEN 4 ELSE 1 END;
      -- The reward label is only accepted for the exact same crop plan, and the
      -- reference_type must match the reason so a transfer cannot borrow it.
      IF p_reference_type <> p_reason OR p_direction <> 'credit'
        OR p_currency <> (CASE v_land WHEN 6 THEN 'crystal' ELSE 'coin' END)
        OR v_quantity % v_unit <> 0 OR p_amount::bigint <> (v_quantity / v_unit) * v_reward THEN
        RETURN jsonb_build_object('result_status','invalid');
      END IF;
    ELSE RETURN jsonb_build_object('result_status','invalid');
    END IF;
    IF EXISTS (SELECT 1 FROM public.core_wallet_ledger WHERE owner_id=p_owner_id
      AND idempotency_key='farm-v2:' || p_request_id || ':compensation') THEN
      RETURN jsonb_build_object('result_status','compensated');
    END IF;
  END IF;
  PERFORM 1 FROM public.core_wallets WHERE owner_id=p_owner_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.core_wallets WHERE owner_id=p_owner_id AND status <> 'active') THEN
    RETURN jsonb_build_object('result_status','wallet_not_active');
  END IF;
  v_result := public.core_wallet_apply_transaction(p_owner_id, p_amount, p_currency,
    p_direction, v_key, p_reason, p_reference_id, p_reference_type, p_original_transaction_id);
  IF v_result->>'result_status' IN ('created','duplicate')
     AND v_result->'transaction'->>'reversal_of' IS DISTINCT FROM p_original_transaction_id::text THEN
    RAISE EXCEPTION 'FARM_WALLET_RESULT_CONFLICT';
  END IF;
  RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.farm_v2_apply_wallet_transaction(uuid,text,integer,text,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_apply_wallet_transaction(uuid,text,integer,text,text,text,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.farm_v2_closed_wallet_request_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF TG_OP<>'INSERT' THEN
  IF OLD.idempotency_key LIKE 'farm-v2:%' OR NEW.idempotency_key LIKE 'farm-v2:%'
   OR OLD.reason IN ('farm_seed_purchase','farm_crop_exchange','farm_crop_reward','farm_pot_synthesis','farm_decor_purchase','farm_mission_reward','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase','farm_wallet_compensation')
   OR NEW.reason IN ('farm_seed_purchase','farm_crop_exchange','farm_crop_reward','farm_pot_synthesis','farm_decor_purchase','farm_mission_reward','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase','farm_wallet_compensation')
  THEN RAISE EXCEPTION 'FARM_LEDGER_IMMUTABLE'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 IF NEW.reason IN ('farm_seed_purchase','farm_crop_exchange','farm_crop_reward') AND EXISTS(
  SELECT 1 FROM public.farm_v2_wallet_closures c WHERE c.user_id=NEW.owner_id
  AND NEW.idempotency_key IN ('farm-v2:'||c.request_id||':primary','farm-v2:'||c.request_id||':primary:debit:coin','farm-v2:'||c.request_id||':primary:credit:coin','farm-v2:'||c.request_id||':primary:credit:crystal')
 ) THEN RAISE EXCEPTION 'FARM_MUTATION_COMPENSATED'; END IF;
 RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.farm_v2_operator_wallet_reconcile(p_user_id uuid,p_request_id text,p_mode text,p_case_id text,p_actor text,p_evidence text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_entries jsonb; v_original public.core_wallet_ledger; v_count integer; v_result jsonb; v_land integer; v_qty bigint; v_unit integer; v_reward integer;
BEGIN
 IF p_user_id IS NULL OR p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$'
 OR p_mode IS NULL OR p_mode NOT IN ('inspect','compensate','cancel') OR nullif(btrim(p_case_id),'') IS NULL OR nullif(btrim(p_actor),'') IS NULL OR nullif(btrim(p_evidence),'') IS NULL THEN RAISE EXCEPTION 'INVALID_RECONCILIATION'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-wallet:'||p_user_id::text,0));
 SELECT count(*),coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) INTO v_count,v_entries FROM public.core_wallet_ledger l WHERE owner_id=p_user_id AND reversal_of IS NULL AND reason IN ('farm_seed_purchase','farm_crop_exchange','farm_crop_reward')
 AND idempotency_key IN ('farm-v2:'||p_request_id||':primary','farm-v2:'||p_request_id||':primary:debit:coin','farm-v2:'||p_request_id||':primary:credit:coin','farm-v2:'||p_request_id||':primary:credit:crystal');
 IF p_mode='inspect' THEN RETURN jsonb_build_object('primary',v_entries,'compensation',(SELECT to_jsonb(l) FROM public.core_wallet_ledger l WHERE owner_id=p_user_id AND idempotency_key='farm-v2:'||p_request_id||':compensation'),'closure',(SELECT to_jsonb(c) FROM public.farm_v2_wallet_closures c WHERE user_id=p_user_id AND request_id=p_request_id)); END IF;
 IF v_count>1 OR (p_mode='cancel' AND v_count<>0) OR (p_mode='compensate' AND v_count<>1) THEN RAISE EXCEPTION 'RECONCILIATION_EVIDENCE_CONFLICT'; END IF;
 IF p_mode='cancel' THEN
  INSERT INTO public.farm_v2_wallet_closures VALUES(p_user_id,p_request_id,p_case_id,p_actor,p_evidence,'CANCELED',now()) ON CONFLICT(user_id,request_id) DO NOTHING;
  v_result:=jsonb_build_object('result_status','canceled');
 ELSE
  SELECT * INTO v_original FROM public.core_wallet_ledger WHERE id=(v_entries->0->>'id')::uuid;
  IF v_original.reference_id !~ '^[1-6]:[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_INVALID'; END IF;
  v_land:=split_part(v_original.reference_id,':',1)::integer; v_qty:=split_part(v_original.reference_id,':',2)::bigint;
  IF v_original.reason='farm_seed_purchase' THEN
   IF v_land=6 OR v_original.currency<>'coin' OR v_original.direction<>'debit' OR v_original.reference_type<>'farm_seed_pack' OR v_original.amount<>v_qty THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_INVALID'; END IF;
  ELSE
   v_unit:=CASE v_land WHEN 1 THEN 5 WHEN 2 THEN 2 ELSE 1 END; v_reward:=CASE v_land WHEN 4 THEN 2 WHEN 5 THEN 4 ELSE 1 END;
   IF v_original.direction<>'credit' OR v_original.reference_type<>v_original.reason OR v_original.currency<>(CASE v_land WHEN 6 THEN 'crystal' ELSE 'coin' END) OR v_qty%v_unit<>0 OR v_original.amount::bigint<>(v_qty/v_unit)*v_reward THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_INVALID'; END IF;
  END IF;
  PERFORM 1 FROM public.core_wallets WHERE owner_id=p_user_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.core_wallets WHERE owner_id=p_user_id AND status<>'active') AND NOT EXISTS(SELECT 1 FROM public.core_wallet_ledger WHERE owner_id=p_user_id AND idempotency_key='farm-v2:'||p_request_id||':compensation') THEN
   v_result:=jsonb_build_object('result_status','wallet_not_active');
  ELSE
  v_result:=public.core_wallet_apply_transaction(p_user_id,v_original.amount,v_original.currency,CASE v_original.direction WHEN 'debit' THEN 'credit' ELSE 'debit' END,
    'farm-v2:'||p_request_id||':compensation','farm_wallet_compensation',p_request_id,'farm_wallet_compensation',v_original.id);
  END IF;
  IF v_result->>'result_status' IN ('created','duplicate') THEN
   IF v_result->'transaction'->>'reversal_of' IS DISTINCT FROM v_original.id::text THEN RAISE EXCEPTION 'RECONCILIATION_EVIDENCE_CONFLICT'; END IF;
   INSERT INTO public.farm_v2_wallet_closures VALUES(p_user_id,p_request_id,p_case_id,p_actor,p_evidence,'COMPENSATED',now()) ON CONFLICT(user_id,request_id) DO NOTHING;
  END IF;
 END IF;
 INSERT INTO public.farm_v2_wallet_reconciliation_audit(user_id,request_id,case_id,actor,evidence,result_status) VALUES(p_user_id,p_request_id,p_case_id,p_actor,p_evidence,v_result->>'result_status');
 RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.farm_v2_operator_wallet_reconcile(uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_operator_wallet_reconcile(uuid,text,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.farm_v2_operator_wallet_reconcile(p_user_id uuid,p_request_id text,p_mode text,p_case_id text,p_actor text,p_evidence text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_entries jsonb; v_original public.core_wallet_ledger; v_count integer; v_result jsonb; v_land integer; v_qty bigint; v_unit integer; v_reward integer;
BEGIN
 IF p_user_id IS NULL OR p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$'
 OR p_mode IS NULL OR p_mode NOT IN ('inspect','compensate','cancel') OR nullif(btrim(p_case_id),'') IS NULL OR nullif(btrim(p_actor),'') IS NULL OR nullif(btrim(p_evidence),'') IS NULL THEN RAISE EXCEPTION 'INVALID_RECONCILIATION'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-wallet:'||p_user_id::text,0));
 SELECT count(*),coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) INTO v_count,v_entries FROM public.core_wallet_ledger l WHERE owner_id=p_user_id AND reversal_of IS NULL AND reason IN ('farm_seed_purchase','farm_crop_exchange','farm_crop_reward')
 AND idempotency_key IN ('farm-v2:'||p_request_id||':primary','farm-v2:'||p_request_id||':primary:debit:coin','farm-v2:'||p_request_id||':primary:credit:coin','farm-v2:'||p_request_id||':primary:credit:crystal');
 IF p_mode='inspect' THEN RETURN jsonb_build_object('primary',v_entries,'compensation',(SELECT to_jsonb(l) FROM public.core_wallet_ledger l WHERE owner_id=p_user_id AND idempotency_key='farm-v2:'||p_request_id||':compensation'),'closure',(SELECT to_jsonb(c) FROM public.farm_v2_wallet_closures c WHERE user_id=p_user_id AND request_id=p_request_id)); END IF;
 IF v_count>1 OR (p_mode='cancel' AND v_count<>0) OR (p_mode='compensate' AND v_count<>1) THEN RAISE EXCEPTION 'RECONCILIATION_EVIDENCE_CONFLICT'; END IF;
 IF p_mode='cancel' THEN
  INSERT INTO public.farm_v2_wallet_closures VALUES(p_user_id,p_request_id,p_case_id,p_actor,p_evidence,'CANCELED',now()) ON CONFLICT(user_id,request_id) DO NOTHING;
  v_result:=jsonb_build_object('result_status','canceled');
 ELSE
  SELECT * INTO v_original FROM public.core_wallet_ledger WHERE id=(v_entries->0->>'id')::uuid;
  IF v_original.reference_id !~ '^[1-6]:[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_INVALID'; END IF;
  v_land:=split_part(v_original.reference_id,':',1)::integer; v_qty:=split_part(v_original.reference_id,':',2)::bigint;
  IF v_original.reason='farm_seed_purchase' THEN
   IF v_land=6 OR v_original.currency<>'coin' OR v_original.direction<>'debit' OR v_original.reference_type<>'farm_seed_pack' OR v_original.amount<>v_qty THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_INVALID'; END IF;
  ELSE
   v_unit:=CASE v_land WHEN 1 THEN 5 WHEN 2 THEN 2 ELSE 1 END; v_reward:=CASE v_land WHEN 4 THEN 2 WHEN 5 THEN 4 ELSE 1 END;
   IF v_original.direction<>'credit' OR v_original.reference_type<>v_original.reason OR v_original.currency<>(CASE v_land WHEN 6 THEN 'crystal' ELSE 'coin' END) OR v_qty%v_unit<>0 OR v_original.amount::bigint<>(v_qty/v_unit)*v_reward THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_INVALID'; END IF;
  END IF;
  PERFORM 1 FROM public.core_wallets WHERE owner_id=p_user_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.core_wallets WHERE owner_id=p_user_id AND status<>'active') AND NOT EXISTS(SELECT 1 FROM public.core_wallet_ledger WHERE owner_id=p_user_id AND idempotency_key='farm-v2:'||p_request_id||':compensation') THEN
   v_result:=jsonb_build_object('result_status','wallet_not_active');
  ELSE
  v_result:=public.core_wallet_apply_transaction(p_user_id,v_original.amount,v_original.currency,CASE v_original.direction WHEN 'debit' THEN 'credit' ELSE 'debit' END,
    'farm-v2:'||p_request_id||':compensation','farm_wallet_compensation',p_request_id,'farm_wallet_compensation',v_original.id);
  END IF;
  IF v_result->>'result_status' IN ('created','duplicate') THEN
   IF v_result->'transaction'->>'reversal_of' IS DISTINCT FROM v_original.id::text THEN RAISE EXCEPTION 'RECONCILIATION_EVIDENCE_CONFLICT'; END IF;
   INSERT INTO public.farm_v2_wallet_closures VALUES(p_user_id,p_request_id,p_case_id,p_actor,p_evidence,'COMPENSATED',now()) ON CONFLICT(user_id,request_id) DO NOTHING;
  END IF;
 END IF;
 INSERT INTO public.farm_v2_wallet_reconciliation_audit(user_id,request_id,case_id,actor,evidence,result_status) VALUES(p_user_id,p_request_id,p_case_id,p_actor,p_evidence,v_result->>'result_status');
 RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.farm_v2_operator_wallet_reconcile(uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_operator_wallet_reconcile(uuid,text,text,text,text,text) TO service_role;
COMMIT;
