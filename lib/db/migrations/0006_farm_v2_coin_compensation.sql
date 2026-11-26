BEGIN;
-- Coin grace compensation. A charge whose delivery is unconfirmed, or whose
-- outcome is unknown, is compensated in full. Crystals and real money are not
-- eligible: wallet_scope and the coin-only ledger calls below exclude them.
CREATE TABLE public.farm_v2_coin_compensation (
 user_id uuid NOT NULL,
 request_id text NOT NULL,
 wallet_scope text NOT NULL CHECK (wallet_scope IN ('central','farm')),
 amount integer NOT NULL CHECK (amount > 0),
 status text NOT NULL CHECK (status IN ('claimed','posted','failed')),
 evidence text NOT NULL,
 original_transaction_id uuid,
 ledger_id uuid,
 failure_code text,
 attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 posted_at timestamptz,
 -- One compensation per original request and wallet, whatever the charge id.
 PRIMARY KEY (user_id, request_id, wallet_scope)
);
ALTER TABLE public.farm_v2_coin_compensation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farm_v2_coin_compensation FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.farm_v2_coin_compensation TO service_role;
CREATE INDEX farm_v2_coin_compensation_review_idx
 ON public.farm_v2_coin_compensation (user_id, created_at DESC);

-- Repeated compensation is a review signal for an operator, never a block.
CREATE OR REPLACE VIEW public.farm_v2_coin_compensation_watch AS
 SELECT user_id,
        count(*) AS compensation_count,
        sum(amount)::bigint AS compensated_coins,
        min(created_at) AS first_at,
        max(posted_at) AS last_at
 FROM public.farm_v2_coin_compensation
 WHERE status = 'posted'
 GROUP BY user_id;
REVOKE ALL ON public.farm_v2_coin_compensation_watch FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.farm_v2_coin_compensation_watch TO service_role;

-- The Farm coin bank keeps its own ledger, so it needs its own reversal. The
-- request key makes the credit single-shot like every other bank entry.
CREATE OR REPLACE FUNCTION farm_v2_bank.post_compensation(
 p_user uuid, p_request text, p_amount integer, p_reference text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE w farm_v2_bank.wallets; e farm_v2_bank.ledger;
BEGIN
 IF p_user IS NULL OR p_request IS NULL OR p_request !~ '^[A-Za-z0-9._:-]{1,120}$'
   OR p_amount IS NULL OR p_amount <= 0 OR nullif(btrim(p_reference),'') IS NULL THEN
  RAISE EXCEPTION 'INVALID_COIN_COMPENSATION'; END IF;
 INSERT INTO farm_v2_bank.wallets(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
 SELECT * INTO w FROM farm_v2_bank.wallets WHERE user_id=p_user FOR UPDATE;
 SELECT * INTO e FROM farm_v2_bank.ledger WHERE user_id=p_user AND request_key='compensation:'||p_request;
 IF FOUND THEN
  IF (e.amount,e.direction,e.reason) IS DISTINCT FROM (p_amount,'credit','farm_wallet_compensation') THEN
   RAISE EXCEPTION 'COIN_COMPENSATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('id',e.id,'duplicate',true,'coins',w.balance);
 END IF;
 UPDATE farm_v2_bank.wallets SET balance=balance+p_amount,updated_at=now()
  WHERE user_id=p_user RETURNING * INTO w;
 INSERT INTO farm_v2_bank.ledger(user_id,request_key,amount,direction,reason,reference)
  VALUES(p_user,'compensation:'||p_request,p_amount,'credit','farm_wallet_compensation',p_reference)
  RETURNING * INTO e;
 RETURN jsonb_build_object('id',e.id,'duplicate',false,'coins',w.balance);
END; $fn$;
REVOKE ALL ON FUNCTION farm_v2_bank.post_compensation(uuid,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION farm_v2_bank.post_compensation(uuid,text,integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.farm_v2_post_coin_compensation(
 p_user_id uuid, p_request_id text, p_wallet_scope text, p_amount integer, p_evidence text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_original public.core_wallet_ledger; v_result jsonb; v_grace boolean := true;
BEGIN
 IF p_user_id IS NULL OR p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$'
   OR p_wallet_scope IS NULL OR p_wallet_scope NOT IN ('central','farm')
   OR p_amount IS NULL OR p_amount <= 0 OR nullif(btrim(p_evidence),'') IS NULL THEN
  RAISE EXCEPTION 'INVALID_COIN_COMPENSATION'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-wallet:'||p_user_id::text,0));
 -- Locate the charge by its deterministic key. The transaction id may never
 -- have reached the server, so it must not be required as evidence.
 SELECT * INTO v_original FROM public.core_wallet_ledger
  WHERE owner_id=p_user_id AND idempotency_key='farm-v2:'||p_request_id||':primary'
    AND reversal_of IS NULL;
 IF FOUND THEN
  IF v_original.amount<>p_amount OR v_original.currency<>'coin' OR v_original.direction<>'debit' THEN
   RETURN jsonb_build_object('result_status','evidence_conflict'); END IF;
  v_grace := false;
 END IF;
 IF EXISTS(SELECT 1 FROM public.farm_v2_wallet_closures
   WHERE user_id=p_user_id AND request_id=p_request_id) THEN
  RETURN jsonb_build_object('result_status','duplicate'); END IF;
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
 -- Closing the request is what stops a late charge from ever being applied.
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
