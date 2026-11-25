BEGIN;
-- Observation only. No Wallet/asset/transaction-state writes or automatic settlement.
CREATE FUNCTION public.farm_v2_inspect_recovery(p_owner uuid,p_request text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE m public.farm_v2_mutation%ROWTYPE; l public.core_wallet_ledger%ROWTYPE;
 r public.farm_v2_atomic_pot_receipts%ROWTYPE; v_status text; v_inverse integer;
BEGIN
 IF p_owner IS NULL OR p_request IS NULL OR p_request !~ '^[A-Za-z0-9._:-]{1,120}$' THEN RAISE EXCEPTION 'RECOVERY_IDENTITY_REQUIRED'; END IF;
 SELECT * INTO m FROM public.farm_v2_mutation WHERE user_id=p_owner::text AND request_id=p_request;
 SELECT * INTO l FROM public.core_wallet_ledger WHERE owner_id=p_owner AND idempotency_key='farm-v2:'||p_request||':primary';
 SELECT * INTO r FROM public.farm_v2_atomic_pot_receipts WHERE user_id=p_owner AND request_id=p_request;
 SELECT count(*) INTO v_inverse FROM public.core_wallet_ledger WHERE reversal_of=l.id;
 v_status:='UNKNOWN';
 -- Conflicting authority evidence takes precedence over every replay/completion label.
 IF v_inverse>0 OR l.reversal_of IS NOT NULL
   OR m.transaction_state IN ('COMPENSATING','COMPENSATED')
   OR EXISTS(SELECT 1 FROM public.core_wallet_ledger WHERE owner_id=p_owner
     AND idempotency_key='farm-v2:'||p_request||':compensation')
   OR EXISTS(SELECT 1 FROM public.farm_v2_wallet_closures WHERE user_id=p_owner AND request_id=p_request)
   OR (m.wallet_transaction->>'coreTransactionId' IS NOT NULL
     AND m.wallet_transaction->>'coreTransactionId' IS DISTINCT FROM l.id::text)
 THEN v_status:='AUTHORITY_REVIEW_REQUIRED';
 ELSIF r.transaction_id IS NOT NULL THEN
  IF l.id IS NOT DISTINCT FROM r.transaction_id AND l.reversal_of IS NULL AND v_inverse=0
    AND m.transaction_state='COMPLETED' AND m.response IS NOT NULL
    AND m.wallet_transaction->>'coreTransactionId'=l.id::text
    AND m.action LIKE 'WORKSHOP:%' AND substring(m.action from 10)::jsonb=r.command
    AND l.currency='coin' AND l.reason='farm_pot_synthesis' THEN v_status:='VERIFIED_COMPLETED';
  ELSE v_status:='AUTHORITY_REVIEW_REQUIRED'; END IF;
 ELSIF m.transaction_state='COMPLETED' AND m.response IS NOT NULL THEN
  -- Legacy completion still needs its original domain handler/intent validation.
  v_status:='REPLAY_ORIGINAL_HANDLER';
 ELSIF m.transaction_state IN ('WALLET_PENDING','WALLET_APPLIED','PENDING') THEN
  v_status:='REPLAY_ORIGINAL_HANDLER';
 ELSIF m.transaction_state IN ('COMPENSATING','COMPENSATED') OR l.id IS NOT NULL OR v_inverse>0 THEN
  v_status:='AUTHORITY_REVIEW_REQUIRED';
 END IF;
 RETURN jsonb_build_object('status',v_status,'owner',p_owner,'requestId',p_request,
  'idempotencyKey','farm-v2:'||p_request||':primary','journalState',m.transaction_state,
  'primaryTransactionId',l.id,'receiptTransactionId',r.transaction_id,
  'inverseCount',v_inverse,'mayCreateNewKey',false);
END;
$fn$;
CREATE FUNCTION public.farm_v2_observe_recovery(p_owner uuid,p_request text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_result jsonb; v_case text;
BEGIN
 v_result:=public.farm_v2_inspect_recovery(p_owner,p_request);
 INSERT INTO public.farm_v2_reconciliation_case(id,user_id,request_id,actor,evidence,status)
 VALUES('recovery:'||p_owner::text||':'||p_request,p_owner::text,p_request,session_user,'original-key-observation','OPEN')
 ON CONFLICT(user_id,request_id) DO NOTHING;
 SELECT id INTO v_case FROM public.farm_v2_reconciliation_case WHERE user_id=p_owner::text AND request_id=p_request;
 INSERT INTO public.farm_v2_reconciliation_event(case_id,actor,action,evidence,details)
 VALUES(v_case,session_user,'RECOVERY_OBSERVED','original-key-observation',v_result);
 RETURN v_result;
END;
$fn$;
REVOKE ALL ON FUNCTION public.farm_v2_inspect_recovery(uuid,text),public.farm_v2_observe_recovery(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
