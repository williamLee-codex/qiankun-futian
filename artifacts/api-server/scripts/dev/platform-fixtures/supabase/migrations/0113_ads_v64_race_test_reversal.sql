-- V6.4 isolated database only. Review before deployment.
CREATE UNIQUE INDEX IF NOT EXISTS core_wallet_ledger_reversal_once_v64_idx
ON public.core_wallet_ledger(reversal_of) WHERE reversal_of IS NOT NULL;

CREATE OR REPLACE FUNCTION platform.reverse_ads_v64_race_test_credit(p_original_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
  v public.core_wallet_ledger%ROWTYPE;
  prior public.core_wallet_ledger%ROWTYPE;
  outcome jsonb;
BEGIN
  IF p_original_id IS NULL THEN RAISE EXCEPTION 'original required'; END IF;
  SELECT * INTO v FROM public.core_wallet_ledger WHERE id=p_original_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'original not found'; END IF;
  IF v.currency IS DISTINCT FROM 'coin' OR v.direction IS DISTINCT FROM 'credit'
     OR v.reference_type IS DISTINCT FROM 'ad_reward_event'
     OR COALESCE(v.idempotency_key NOT LIKE 'ad-v64:%',true)
     OR NOT EXISTS (
       SELECT 1 FROM platform.ad_reward_events e
       WHERE e.id::text=v.reference_id AND e.user_id=v.owner_id
         AND e.game_id LIKE 'ads-v64-race-%'
         AND e.reward_kind='coin' AND e.reward_amount=v.amount
     )
  THEN RAISE EXCEPTION 'not an isolated race test credit'; END IF;

  SELECT * INTO prior FROM public.core_wallet_ledger
  WHERE reversal_of=p_original_id LIMIT 1;
  IF FOUND THEN
    IF prior.owner_id IS DISTINCT FROM v.owner_id OR prior.amount IS DISTINCT FROM v.amount
       OR prior.currency IS DISTINCT FROM v.currency OR prior.direction IS DISTINCT FROM 'debit'
       OR prior.reference_id IS DISTINCT FROM v.id::text
       OR prior.reference_type IS DISTINCT FROM 'ads_v64_test_reversal'
       OR prior.reason IS DISTINCT FROM 'ads_v64_test_reversal'
       OR prior.idempotency_key IS DISTINCT FROM ('ads-v64-test-reversal:'||v.id::text)
    THEN RAISE EXCEPTION 'conflicting reversal'; END IF;
    RETURN jsonb_build_object('result_status','duplicate','reversal_id',prior.id);
  END IF;

  outcome:=public.core_wallet_apply_transaction(
    v.owner_id,v.amount,'coin','debit',
    'ads-v64-test-reversal:'||v.id::text,
    'ads_v64_test_reversal',v.id::text,'ads_v64_test_reversal',v.id);
  IF outcome->>'result_status'<>'created' THEN
    RAISE EXCEPTION 'reversal failed: %',outcome->>'result_status';
  END IF;
  RETURN outcome;
END $fn$;
REVOKE ALL ON FUNCTION platform.reverse_ads_v64_race_test_credit(uuid)
FROM PUBLIC,anon,authenticated,service_role;
