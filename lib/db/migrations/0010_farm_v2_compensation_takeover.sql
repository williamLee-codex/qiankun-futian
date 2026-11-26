BEGIN;
-- A claim that outlives its process must be recoverable. claimed_at is the
-- lease anchor: only a claim older than the timeout may be taken over, and the
-- ledger keys keep the credit single-shot even if two takers overlap.
ALTER TABLE public.farm_v2_coin_compensation
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS farm_v2_coin_compensation_stale_idx
  ON public.farm_v2_coin_compensation (claimed_at)
  WHERE status = 'claimed';

-- A closed request must not accept a late Farm bank charge either. The core
-- wallet already has this guard; the Farm coin bank needs its own, otherwise a
-- delayed farm charge can land after the compensation closed the request.
CREATE OR REPLACE FUNCTION public.farm_v2_bank_request_closure_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_request text;
BEGIN
 IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
 IF NEW.request_key LIKE 'op:%' THEN v_request := substr(NEW.request_key,4);
 ELSIF NEW.request_key LIKE 'transfer:%' THEN v_request := substr(NEW.request_key,10);
 ELSE RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.farm_v2_wallet_closures c
            WHERE c.user_id=NEW.user_id AND c.request_id=v_request) THEN
  RAISE EXCEPTION 'FARM_BANK_MUTATION_COMPENSATED'; END IF;
 RETURN NEW;
END; $fn$;
DROP TRIGGER IF EXISTS farm_v2_bank_request_closure_guard ON farm_v2_bank.ledger;
CREATE TRIGGER farm_v2_bank_request_closure_guard
 BEFORE INSERT ON farm_v2_bank.ledger
 FOR EACH ROW EXECUTE FUNCTION public.farm_v2_bank_request_closure_guard();

-- The Farm wallet has its own ledger, so its compensation amount must also be
-- bounded by the original server-side debit, and a repeated call must report
-- the ledger entry that already holds the credit.
CREATE OR REPLACE FUNCTION public.farm_v2_post_coin_compensation(
 p_user_id uuid, p_request_id text, p_wallet_scope text, p_amount integer, p_evidence text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_original public.core_wallet_ledger; v_bank farm_v2_bank.ledger;
        v_result jsonb; v_grace boolean := true; v_ledger uuid;
BEGIN
 IF p_user_id IS NULL OR p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$'
   OR p_wallet_scope IS NULL OR p_wallet_scope NOT IN ('central','farm')
   OR p_amount IS NULL OR p_amount <= 0 OR nullif(btrim(p_evidence),'') IS NULL THEN
  RAISE EXCEPTION 'INVALID_COIN_COMPENSATION'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-wallet:'||p_user_id::text,0));
 SELECT * INTO v_original FROM public.core_wallet_ledger
  WHERE owner_id=p_user_id AND idempotency_key='farm-v2:'||p_request_id||':primary'
    AND reversal_of IS NULL;
 IF FOUND THEN
  IF v_original.amount<>p_amount OR v_original.currency<>'coin' OR v_original.direction<>'debit' THEN
   RETURN jsonb_build_object('result_status','evidence_conflict'); END IF;
  v_grace := false;
 ELSIF p_wallet_scope='farm' THEN
  SELECT * INTO v_bank FROM farm_v2_bank.ledger
   WHERE user_id=p_user_id AND direction='debit'
     AND (request_key='op:'||p_request_id OR request_key='transfer:'||p_request_id
          OR reference=p_request_id)
   ORDER BY created_at LIMIT 1;
  IF FOUND THEN
   IF v_bank.amount<>p_amount THEN
    RETURN jsonb_build_object('result_status','evidence_conflict'); END IF;
   v_grace := false;
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM public.farm_v2_wallet_closures
   WHERE user_id=p_user_id AND request_id=p_request_id) THEN
  IF p_wallet_scope='farm' THEN
   SELECT id INTO v_ledger FROM farm_v2_bank.ledger
    WHERE user_id=p_user_id AND request_key='compensation:'||p_request_id
      AND amount=p_amount AND direction='credit';
  ELSE
   SELECT id INTO v_ledger FROM public.core_wallet_ledger
    WHERE owner_id=p_user_id AND idempotency_key='farm-v2:'||p_request_id||':compensation'
      AND amount=p_amount AND direction='credit' AND currency='coin';
  END IF;
  IF v_ledger IS NULL THEN
   RETURN jsonb_build_object('result_status','closure_without_credit'); END IF;
  RETURN jsonb_build_object('result_status','duplicate','ledger_id',v_ledger,'grace',v_grace);
 END IF;
 IF p_wallet_scope='farm' THEN
  v_result := farm_v2_bank.post_compensation(p_user_id,p_request_id,p_amount,'farm_coin_grace_compensation');
  IF v_result->>'id' IS NULL THEN RETURN v_result; END IF;
 ELSE
  v_result := public.core_wallet_apply_transaction(p_user_id,p_amount,'coin','credit',
    'farm-v2:'||p_request_id||':compensation','farm_wallet_compensation',p_request_id,
    CASE WHEN v_grace THEN 'farm_coin_grace_compensation' ELSE 'farm_wallet_compensation' END,
    v_original.id);
  IF v_result->>'result_status' NOT IN ('created','duplicate') THEN RETURN v_result; END IF;
 END IF;
 INSERT INTO public.farm_v2_wallet_closures
  VALUES(p_user_id,p_request_id,'coin-compensation','tsc-compensation',left(p_evidence,500),'COMPENSATED',now())
  ON CONFLICT(user_id,request_id) DO NOTHING;
 RETURN jsonb_build_object(
  'result_status',CASE WHEN v_result->>'duplicate'='true' THEN 'duplicate' ELSE 'created' END,
  'ledger_id',coalesce(v_result->>'id',v_result->'transaction'->>'id'),
  'transaction',v_result->'transaction',
  'original_transaction_id',v_original.id,
  'grace',v_grace);
END; $fn$;
REVOKE ALL ON FUNCTION public.farm_v2_post_coin_compensation(uuid,text,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_post_coin_compensation(uuid,text,text,integer,text) TO service_role;
COMMIT;
