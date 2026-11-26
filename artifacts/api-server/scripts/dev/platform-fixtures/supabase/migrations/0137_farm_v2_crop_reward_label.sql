BEGIN;
-- Additive Farm migration: a same-wallet crop reward may be recorded as
-- farm_crop_reward, which the crystal policy guard does not read as a transfer.
-- Rebased on the current definitions in 0130, not the older 0128 body, so no
-- later workshop, wallet-creation or revocation fix is overwritten. Only the
-- label is added: owner, quantity, amount, currency, direction, reference,
-- lifecycle and idempotency rules are unchanged, and reference_type must equal
-- the reason. The crystal guard trigger and history stay untouched.
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
  v_contract jsonb;
  v_cost integer := 0;
BEGIN
  IF p_owner_id IS NULL OR p_request_id IS NULL
     OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$'
     OR p_amount IS NULL OR p_amount <= 0 OR p_currency IS NULL
     OR p_direction IS NULL OR p_reason IS NULL
     OR p_reference_id IS NULL OR p_reference_type IS NULL THEN
    RETURN jsonb_build_object('result_status','invalid');
  END IF;
  -- Shared owner lock serializes first requests, duplicate probes, reversals,
  -- and primary retries. Core's own row lock still protects all other writers.
  PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-wallet:' || p_owner_id::text, 0));
  v_key := 'farm-v2:' || p_request_id || ':primary';
  IF p_reason<>'farm_wallet_compensation' AND EXISTS(SELECT 1 FROM public.farm_v2_wallet_closures WHERE user_id=p_owner_id AND request_id=p_request_id) THEN RETURN jsonb_build_object('result_status','compensated'); END IF;

  IF p_reason = 'farm_wallet_compensation' THEN
    SELECT * INTO v_original FROM public.core_wallet_ledger
      WHERE id=p_original_transaction_id AND owner_id=p_owner_id
        AND idempotency_key=v_key AND reversal_of IS NULL;
    IF NOT FOUND OR v_original.reason NOT IN ('farm_seed_purchase','farm_crop_exchange','farm_crop_reward','farm_pot_synthesis','farm_decor_purchase','farm_mission_reward','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase')
      OR p_reference_type <> 'farm_wallet_compensation' OR p_reference_id <> p_request_id
      OR p_amount <> v_original.amount OR p_currency <> v_original.currency
      OR p_direction <> (CASE v_original.direction WHEN 'debit' THEN 'credit' ELSE 'debit' END) THEN
      RETURN jsonb_build_object('result_status','invalid');
    END IF;
    v_key := 'farm-v2:' || p_request_id || ':compensation';
  ELSE
    IF p_reason IN ('farm_pot_synthesis','farm_decor_purchase','farm_mission_reward','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase') THEN
      v_contract := public.farm_v2_workshop_wallet_contract(p_reason,p_reference_id);
      IF v_contract IS NULL OR p_original_transaction_id IS NOT NULL OR p_currency<>(v_contract->>'currency')
        OR p_reference_type<>p_reason OR p_amount<>abs((v_contract->>'cost')::integer-(v_contract->>'reward')::integer)
        OR p_direction<>(CASE WHEN (v_contract->>'cost')::integer>(v_contract->>'reward')::integer THEN 'debit' ELSE 'credit' END)
      THEN RETURN jsonb_build_object('result_status','invalid'); END IF;
      v_cost := (v_contract->>'cost')::integer;
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
      IF p_reference_type <> p_reason OR p_direction <> 'credit'
        OR p_currency <> (CASE v_land WHEN 6 THEN 'crystal' ELSE 'coin' END)
        OR v_quantity % v_unit <> 0 OR p_amount::bigint <> (v_quantity / v_unit) * v_reward THEN
        RETURN jsonb_build_object('result_status','invalid');
      END IF;
    ELSE RETURN jsonb_build_object('result_status','invalid');
    END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM public.core_wallet_ledger WHERE owner_id=p_owner_id
      AND idempotency_key='farm-v2:' || p_request_id || ':compensation') THEN
      RETURN jsonb_build_object('result_status','compensated');
    END IF;
  END IF;
  -- Check lifecycle under the same row lock used by Core's balance mutation.
  -- A suspension committed while Core waits must not admit a new Farm effect.
  -- An absent row cannot be locked. Core creation must finish before checking
  -- lifecycle, including a concurrent creator committing a suspended wallet.
  PERFORM public.core_wallet_get_or_create(p_owner_id);
  PERFORM 1 FROM public.core_wallets WHERE owner_id=p_owner_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.core_wallets WHERE owner_id=p_owner_id AND status <> 'active') THEN
    RETURN jsonb_build_object('result_status','wallet_not_active');
  END IF;
  -- Net posting is atomic; gross cost must still be affordable before the reward.
  -- Duplicate retries bypass affordability and retain Core payload validation.
  IF v_cost>0 AND NOT EXISTS(SELECT 1 FROM public.core_wallet_ledger WHERE owner_id=p_owner_id AND idempotency_key=v_key)
     AND (SELECT CASE p_currency WHEN 'coin' THEN coin_balance ELSE crystal_balance END FROM public.core_wallets WHERE owner_id=p_owner_id)<v_cost THEN
    RETURN jsonb_build_object('result_status','insufficient_funds');
  END IF;
  v_result := public.core_wallet_apply_transaction(p_owner_id, p_amount, p_currency,
    p_direction, v_key, p_reason, p_reference_id, p_reference_type, p_original_transaction_id);
  -- Core duplicate matching does not promise reversal identity. Farm does.
  IF v_result->>'result_status' IN ('created','duplicate')
     AND v_result->'transaction'->>'reversal_of' IS DISTINCT FROM p_original_transaction_id::text THEN
    RAISE EXCEPTION 'FARM_WALLET_RESULT_CONFLICT';
  END IF;
  RETURN v_result;
END;
$fn$;

REVOKE ALL ON FUNCTION public.farm_v2_apply_wallet_transaction(uuid,text,integer,text,text,text,text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_apply_wallet_transaction(uuid,text,integer,text,text,text,text,text,uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.farm_v2_operator_wallet_reconcile(p_user_id uuid,p_request_id text,p_mode text,p_case_id text,p_actor text,p_evidence text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_entries jsonb; v_original public.core_wallet_ledger; v_count integer; v_result jsonb; v_land integer; v_qty bigint; v_unit integer; v_reward integer;
BEGIN
 IF p_user_id IS NULL OR p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$'
 OR p_mode IS NULL OR p_mode NOT IN ('inspect','compensate','cancel') OR nullif(btrim(p_case_id),'') IS NULL OR nullif(btrim(p_actor),'') IS NULL OR nullif(btrim(p_evidence),'') IS NULL THEN RAISE EXCEPTION 'INVALID_RECONCILIATION'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-wallet:'||p_user_id::text,0));
 SELECT count(*),coalesce(jsonb_agg(to_jsonb(l)),'[]'::jsonb) INTO v_count,v_entries FROM public.core_wallet_ledger l WHERE owner_id=p_user_id AND reversal_of IS NULL AND reason IN ('farm_seed_purchase','farm_crop_exchange','farm_crop_reward','farm_pot_synthesis','farm_decor_purchase','farm_mission_reward','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase')
 AND idempotency_key IN ('farm-v2:'||p_request_id||':primary','farm-v2:'||p_request_id||':primary:debit:coin','farm-v2:'||p_request_id||':primary:credit:coin','farm-v2:'||p_request_id||':primary:credit:crystal');
 IF p_mode='inspect' THEN RETURN jsonb_build_object('primary',v_entries,'compensation',(SELECT to_jsonb(l) FROM public.core_wallet_ledger l WHERE owner_id=p_user_id AND idempotency_key='farm-v2:'||p_request_id||':compensation'),'closure',(SELECT to_jsonb(c) FROM public.farm_v2_wallet_closures c WHERE user_id=p_user_id AND request_id=p_request_id)); END IF;
 IF v_count>1 OR (p_mode='cancel' AND v_count<>0) OR (p_mode='compensate' AND v_count<>1) THEN RAISE EXCEPTION 'RECONCILIATION_EVIDENCE_CONFLICT'; END IF;
 IF p_mode='cancel' THEN
  INSERT INTO public.farm_v2_wallet_closures VALUES(p_user_id,p_request_id,p_case_id,p_actor,p_evidence,'CANCELED',now()) ON CONFLICT(user_id,request_id) DO NOTHING;
  v_result:=jsonb_build_object('result_status','canceled');
 ELSE
  SELECT * INTO v_original FROM public.core_wallet_ledger WHERE id=(v_entries->0->>'id')::uuid;
  IF v_original.reason IN ('farm_pot_synthesis','farm_decor_purchase','farm_mission_reward','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase') THEN
   v_result:=public.farm_v2_workshop_wallet_contract(v_original.reason,v_original.reference_id);
   IF v_result IS NULL OR v_original.currency<>(v_result->>'currency') OR v_original.reference_type<>v_original.reason
     OR v_original.amount<>abs((v_result->>'cost')::integer-(v_result->>'reward')::integer)
     OR v_original.direction<>(CASE WHEN (v_result->>'cost')::integer>(v_result->>'reward')::integer THEN 'debit' ELSE 'credit' END)
   THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_INVALID'; END IF;
  ELSE
  IF v_original.reference_id !~ '^[1-6]:[1-9][0-9]{0,9}$' THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_INVALID'; END IF;
  v_land:=split_part(v_original.reference_id,':',1)::integer; v_qty:=split_part(v_original.reference_id,':',2)::bigint;
  IF v_original.reason='farm_seed_purchase' THEN
   IF v_land=6 OR v_original.currency<>'coin' OR v_original.direction<>'debit' OR v_original.reference_type<>'farm_seed_pack' OR v_original.amount<>v_qty THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_INVALID'; END IF;
  ELSE
   v_unit:=CASE v_land WHEN 1 THEN 5 WHEN 2 THEN 2 ELSE 1 END; v_reward:=CASE v_land WHEN 4 THEN 2 WHEN 5 THEN 4 ELSE 1 END;
   IF v_original.direction<>'credit' OR v_original.reference_type<>v_original.reason OR v_original.currency<>(CASE v_land WHEN 6 THEN 'crystal' ELSE 'coin' END) OR v_qty%v_unit<>0 OR v_original.amount::bigint<>(v_qty/v_unit)*v_reward THEN RAISE EXCEPTION 'RECONCILIATION_SOURCE_INVALID'; END IF;
  END IF;
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

CREATE OR REPLACE FUNCTION public.farm_v2_closed_wallet_request_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF TG_OP<>'INSERT' THEN
  -- Do not change non-Farm Core/V1 writers; protect both sides of a rename.
  IF OLD.idempotency_key LIKE 'farm-v2:%' OR NEW.idempotency_key LIKE 'farm-v2:%'
   OR OLD.reason IN ('farm_seed_purchase','farm_crop_exchange','farm_crop_reward','farm_pot_synthesis','farm_decor_purchase','farm_mission_reward','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase','farm_wallet_compensation')
   OR NEW.reason IN ('farm_seed_purchase','farm_crop_exchange','farm_crop_reward','farm_pot_synthesis','farm_decor_purchase','farm_mission_reward','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase','farm_wallet_compensation')
  THEN RAISE EXCEPTION 'FARM_LEDGER_IMMUTABLE'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 IF NEW.reason IN ('farm_seed_purchase','farm_crop_exchange','farm_crop_reward','farm_pot_synthesis','farm_decor_purchase','farm_mission_reward','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase') AND EXISTS(
  SELECT 1 FROM public.farm_v2_wallet_closures c WHERE c.user_id=NEW.owner_id
  AND NEW.idempotency_key IN ('farm-v2:'||c.request_id||':primary','farm-v2:'||c.request_id||':primary:debit:coin','farm-v2:'||c.request_id||':primary:credit:coin','farm-v2:'||c.request_id||':primary:credit:crystal')
 ) THEN RAISE EXCEPTION 'FARM_MUTATION_COMPENSATED'; END IF;
 RETURN NEW;
END;
$fn$;
-- FRIEND-REL-001 / CAVE-VISIT-001: reuse authoritative platform relationships.
CREATE FUNCTION public.farm_v2_read_friend_access(p_owner_id uuid,p_target_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NOT public.farm_v2_identity_active(p_owner_id) THEN RETURN jsonb_build_object('allowed',false); END IF;
 IF p_target_id IS NOT NULL THEN
  RETURN jsonb_build_object('allowed',public.farm_v2_identity_active(p_target_id) AND EXISTS(SELECT 1 FROM public.platform_friendships WHERE user_a_id=least(p_owner_id,p_target_id) AND user_b_id=greatest(p_owner_id,p_target_id) AND status='active'));
 END IF;
 RETURN jsonb_build_object('friends',coalesce((SELECT jsonb_agg(jsonb_build_object('id',CASE WHEN user_a_id=p_owner_id THEN user_b_id ELSE user_a_id END)) FROM public.platform_friendships WHERE p_owner_id IN (user_a_id,user_b_id) AND status='active' AND public.farm_v2_identity_active(CASE WHEN user_a_id=p_owner_id THEN user_b_id ELSE user_a_id END)),'[]'::jsonb));
END;
$fn$;
REVOKE ALL ON FUNCTION public.farm_v2_read_friend_access(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_read_friend_access(uuid,uuid) TO service_role;
COMMIT;


REVOKE ALL ON FUNCTION public.farm_v2_apply_wallet_transaction(uuid,text,integer,text,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_apply_wallet_transaction(uuid,text,integer,text,text,text,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.farm_v2_operator_wallet_reconcile(uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_operator_wallet_reconcile(uuid,text,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.farm_v2_closed_wallet_request_guard() FROM PUBLIC,anon,authenticated;
COMMIT;
