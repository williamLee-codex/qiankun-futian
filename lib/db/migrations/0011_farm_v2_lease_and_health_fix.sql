BEGIN;
-- 0007 fix: a worker may only finish a task while its own lease is still live.
-- Without the expiry check an old worker could write its result after the lease
-- had lapsed, overwriting whatever the new owner was already doing.
CREATE OR REPLACE FUNCTION public.farm_v2_finish_recovery_task(
 p_id uuid, p_owner text, p_state text, p_outcome text, p_error text,
 p_next_run_at timestamptz DEFAULT NULL
) RETURNS public.farm_v2_recovery_task
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE t public.farm_v2_recovery_task;
BEGIN
 IF p_id IS NULL OR p_owner IS NULL OR p_state IS NULL
   OR p_state NOT IN ('pending','done','abandoned') THEN
  RAISE EXCEPTION 'INVALID_RECOVERY_STATE'; END IF;
 UPDATE public.farm_v2_recovery_task
    SET state=p_state, outcome=p_outcome, last_error=left(p_error,500),
        next_run_at=coalesce(p_next_run_at,next_run_at),
        lease_owner=NULL, lease_expires_at=NULL,
        completed_at=CASE WHEN p_state IN ('done','abandoned') THEN now() END,
        updated_at=now()
  WHERE id=p_id AND lease_owner=p_owner AND state='leased'
    AND lease_expires_at > now()
  RETURNING * INTO t;
 IF t.id IS NULL THEN RAISE EXCEPTION 'RECOVERY_LEASE_LOST'; END IF;
 RETURN t;
END; $fn$;
REVOKE ALL ON FUNCTION public.farm_v2_finish_recovery_task(uuid,text,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_finish_recovery_task(uuid,text,text,text,text,timestamptz) TO service_role;

-- 0008 fix: only a compensation that actually reached a ledger counts as
-- compensated money. A claim in flight or a failed attempt must never be
-- reported as a refund, and the wallet scope comes from the evidence.
CREATE OR REPLACE FUNCTION public.farm_v2_transaction_health(
 p_since timestamptz, p_limit integer DEFAULT 200
) RETURNS TABLE(
 request_id text,
 anomaly_type text,
 severity text,
 wallet_scope text,
 original_amount integer,
 compensated_amount integer,
 transaction_state text,
 recovery_state text,
 retry_count integer,
 anomaly_at timestamptz,
 recovered_at timestamptz,
 reason text,
 user_repeat_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $fn$
 WITH base AS (
  SELECT m.user_id, m.request_id, m.transaction_state, m.failure_code,
         m.wallet_currency, m.wallet_amount, m.response, m.updated_at,
         c.wallet_scope, c.status AS compensation_status, c.posted_at,
         CASE WHEN c.status='posted' THEN c.amount END AS compensated_amount,
         t.state AS task_state, t.attempts, t.last_error, t.completed_at,
         (SELECT count(*) FROM public.farm_v2_coin_compensation k
           WHERE k.user_id = m.user_id::uuid AND k.status='posted') AS repeat_count
    FROM public.farm_v2_mutation m
    LEFT JOIN public.farm_v2_coin_compensation c
      ON c.user_id = m.user_id::uuid AND c.request_id = m.request_id
    LEFT JOIN public.farm_v2_recovery_task t
      ON t.user_id = m.user_id::uuid AND t.request_id = m.request_id
   WHERE m.updated_at >= p_since
     AND (m.transaction_state <> 'COMPLETED' OR m.failure_code IS NOT NULL
          OR c.status IS NOT NULL OR t.id IS NOT NULL)
 )
 SELECT b.request_id,
   CASE
     WHEN b.failure_code IN ('INSUFFICIENT_FUNDS','CORE_COIN_INSUFFICIENT','FARM_COIN_INSUFFICIENT',
        'FARM_MATERIALS_INSUFFICIENT','INSUFFICIENT_MATERIALS','INSUFFICIENT_CROPS',
        'INSUFFICIENT_PET_FOOD','INSUFFICIENT_SAME_GRADE_POTS','SEED_NOT_PURCHASABLE',
        'FARM_SEED_LAND_LOCKED','FARMER_NOT_ELIGIBLE','INVALID_EXCHANGE_QUANTITY')
       THEN 'RESOURCE_SHORTAGE'
     WHEN b.task_state = 'abandoned' THEN 'UNRECOVERED'
     WHEN b.compensation_status = 'posted' OR b.transaction_state = 'COMPENSATED'
       THEN 'COMPENSATED'
     WHEN b.compensation_status = 'failed' THEN 'COMPENSATION_FAILED'
     WHEN b.compensation_status = 'claimed' OR b.transaction_state = 'COMPENSATING'
       THEN 'COMPENSATING'
     WHEN b.transaction_state IN ('WALLET_PENDING','WALLET_APPLIED') AND b.response IS NULL
       THEN 'AWAITING_CONFIRMATION'
     ELSE 'IN_FLIGHT'
   END AS anomaly_type,
   CASE
     WHEN b.failure_code IN ('INSUFFICIENT_FUNDS','CORE_COIN_INSUFFICIENT','FARM_COIN_INSUFFICIENT',
        'FARM_MATERIALS_INSUFFICIENT','INSUFFICIENT_MATERIALS','INSUFFICIENT_CROPS',
        'INSUFFICIENT_PET_FOOD','INSUFFICIENT_SAME_GRADE_POTS','SEED_NOT_PURCHASABLE',
        'FARM_SEED_LAND_LOCKED','FARMER_NOT_ELIGIBLE','INVALID_EXCHANGE_QUANTITY')
       THEN 'NORMAL'
     WHEN b.task_state = 'abandoned' OR b.compensation_status = 'failed' THEN 'MAJOR'
     WHEN b.transaction_state IN ('WALLET_PENDING','WALLET_APPLIED') AND b.response IS NULL
       THEN 'PENDING'
     WHEN b.compensation_status = 'claimed' OR b.transaction_state = 'COMPENSATING'
       THEN 'PENDING'
     ELSE 'MINOR'
   END AS severity,
   CASE
     WHEN b.wallet_scope IS NOT NULL THEN b.wallet_scope
     WHEN EXISTS (SELECT 1 FROM farm_v2_bank.ledger k
                   WHERE k.user_id = b.user_id::uuid
                     AND (k.request_key = 'op:'||b.request_id
                          OR k.request_key = 'transfer:'||b.request_id
                          OR k.reference = b.request_id)) THEN 'farm'
     WHEN EXISTS (SELECT 1 FROM public.core_wallet_ledger l
                   WHERE l.owner_id = b.user_id::uuid
                     AND l.idempotency_key = 'farm-v2:'||b.request_id||':primary')
       THEN 'central'
     WHEN b.wallet_currency = 'coin' THEN 'central'
     ELSE b.wallet_currency
   END AS wallet_scope,
   b.wallet_amount,
   b.compensated_amount,
   b.transaction_state,
   b.task_state,
   b.attempts,
   b.updated_at AS anomaly_at,
   coalesce(b.completed_at,
     CASE WHEN b.compensation_status = 'posted' THEN coalesce(b.posted_at, b.updated_at) END)
     AS recovered_at,
   coalesce(b.last_error, b.failure_code) AS reason,
   b.repeat_count AS user_repeat_count
 FROM base b
 ORDER BY
   CASE
     WHEN b.task_state = 'abandoned' OR b.compensation_status = 'failed' THEN 0
     WHEN b.transaction_state IN ('WALLET_PENDING','WALLET_APPLIED') AND b.response IS NULL THEN 1
     WHEN b.compensation_status = 'claimed' OR b.transaction_state = 'COMPENSATING' THEN 1
     ELSE 2
   END,
   b.updated_at DESC
 LIMIT greatest(least(coalesce(p_limit,200),1000),1);
$fn$;
REVOKE ALL ON FUNCTION public.farm_v2_transaction_health(timestamptz,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_transaction_health(timestamptz,integer) TO service_role;
COMMIT;
