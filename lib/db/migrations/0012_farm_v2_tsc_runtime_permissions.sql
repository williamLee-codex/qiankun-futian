BEGIN;

-- Farm V2's production API uses a restricted LOGIN role, not service_role.
-- Do not grant Core wallet/ledger table access or the raw bank credit function.
DO $gate$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='farm_v2_runtime'
                AND rolcanlogin AND NOT rolbypassrls AND NOT rolsuper) THEN
   RAISE EXCEPTION 'FARM_TSC_RUNTIME_ROLE_UNSAFE_OR_MISSING';
 END IF;
END $gate$;

GRANT SELECT, INSERT, UPDATE ON public.farm_v2_coin_compensation TO farm_v2_runtime;
GRANT SELECT, INSERT, UPDATE ON public.farm_v2_recovery_task TO farm_v2_runtime;
GRANT SELECT ON public.farm_v2_coin_compensation_watch TO farm_v2_runtime;
GRANT SELECT ON public.farm_v2_recovery_task_watch TO farm_v2_runtime;

-- RLS remains enabled. This dedicated server role handles all Farm users;
-- no browser role gains a policy, and no DELETE privilege is conferred.
CREATE POLICY farm_v2_tsc_compensation_runtime ON public.farm_v2_coin_compensation
 FOR ALL TO farm_v2_runtime USING (true) WITH CHECK (true);
CREATE POLICY farm_v2_tsc_recovery_runtime ON public.farm_v2_recovery_task
 FOR ALL TO farm_v2_runtime USING (true) WITH CHECK (true);

GRANT EXECUTE ON FUNCTION public.farm_v2_post_coin_compensation(uuid,text,text,integer,text) TO farm_v2_runtime;
GRANT EXECUTE ON FUNCTION public.farm_v2_claim_recovery_tasks(text,integer,integer) TO farm_v2_runtime;
GRANT EXECUTE ON FUNCTION public.farm_v2_finish_recovery_task(uuid,text,text,text,text,timestamptz) TO farm_v2_runtime;
GRANT EXECUTE ON FUNCTION public.farm_v2_transaction_health(timestamptz,integer) TO farm_v2_runtime;

-- Only an exact, already-posted compensation receipt is exposed to the API;
-- the API is never granted SELECT on the shared Core/Farm coin ledgers.
CREATE OR REPLACE FUNCTION public.farm_v2_find_compensation_ledger_id(
 p_user_id uuid, p_request_id text, p_wallet_scope text, p_amount integer
) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_id uuid;
BEGIN
 IF p_user_id IS NULL OR p_request_id IS NULL
    OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$'
    OR p_wallet_scope NOT IN ('central','farm')
    OR p_wallet_scope IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN
   RETURN NULL;
 END IF;
 IF p_wallet_scope='farm' THEN
   SELECT id INTO v_id FROM farm_v2_bank.ledger
    WHERE user_id=p_user_id AND request_key='compensation:'||p_request_id
      AND amount=p_amount AND direction='credit'
      AND reason='farm_wallet_compensation' LIMIT 1;
 ELSE
   SELECT id INTO v_id FROM public.core_wallet_ledger
    WHERE owner_id=p_user_id
      AND idempotency_key='farm-v2:'||p_request_id||':compensation'
      AND amount=p_amount AND direction='credit' AND currency='coin'
      AND reason='farm_wallet_compensation' LIMIT 1;
 END IF;
 RETURN v_id;
END; $fn$;
REVOKE ALL ON FUNCTION public.farm_v2_find_compensation_ledger_id(uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_find_compensation_ledger_id(uuid,text,text,integer)
 TO farm_v2_runtime, service_role;

COMMIT;
