BEGIN;
-- Read paths that the transaction safety core hits on every recovery and
-- monitoring pass. The journal is append-mostly, so a partial index over the
-- unfinished rows stays small while the table grows.
CREATE INDEX IF NOT EXISTS farm_v2_mutation_open_idx
  ON public.farm_v2_mutation (user_id, transaction_state, created_at DESC)
  WHERE transaction_state <> 'COMPLETED';
CREATE INDEX IF NOT EXISTS farm_v2_mutation_health_idx
  ON public.farm_v2_mutation (updated_at DESC);
CREATE INDEX IF NOT EXISTS farm_v2_recovery_task_lease_idx
  ON public.farm_v2_recovery_task (lease_expires_at)
  WHERE state = 'leased';
CREATE INDEX IF NOT EXISTS farm_v2_recovery_task_user_idx
  ON public.farm_v2_recovery_task (user_id, request_id);

-- Replace, do not overload: a three-argument call must keep resolving to the
-- single canonical claim function.
DROP FUNCTION IF EXISTS public.farm_v2_claim_recovery_tasks(text,integer,integer);
-- Sharding lets several runners work in parallel without contending on the
-- same due rows. Omitting the shard keeps the single-runner behaviour.
CREATE OR REPLACE FUNCTION public.farm_v2_claim_recovery_tasks(
 p_owner text, p_limit integer, p_lease_seconds integer,
 p_shard integer DEFAULT NULL, p_shards integer DEFAULT NULL
) RETURNS SETOF public.farm_v2_recovery_task
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF nullif(btrim(p_owner),'') IS NULL OR p_owner !~ '^[A-Za-z0-9._:@-]{1,120}$'
   OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100
   OR p_lease_seconds IS NULL OR p_lease_seconds < 5 OR p_lease_seconds > 3600
   OR (p_shard IS NOT NULL AND (p_shards IS NULL OR p_shards < 1 OR p_shards > 64
        OR p_shard < 0 OR p_shard >= p_shards)) THEN
  RAISE EXCEPTION 'INVALID_RECOVERY_CLAIM'; END IF;
 RETURN QUERY
 WITH due AS (
  SELECT t.id FROM public.farm_v2_recovery_task t
   WHERE ((t.state='pending' AND t.next_run_at <= now())
       OR (t.state='leased' AND t.lease_expires_at <= now()))
     AND (p_shard IS NULL
          OR mod(abs(hashtext(t.user_id::text)), p_shards) = p_shard)
   ORDER BY t.next_run_at
   FOR UPDATE SKIP LOCKED
   LIMIT p_limit
 )
 UPDATE public.farm_v2_recovery_task t
    SET state='leased', lease_owner=p_owner,
        lease_expires_at=now()+make_interval(secs=>p_lease_seconds),
        attempts=t.attempts+1, updated_at=now()
   FROM due WHERE t.id=due.id
  RETURNING t.*;
END; $fn$;
REVOKE ALL ON FUNCTION public.farm_v2_claim_recovery_tasks(text,integer,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_claim_recovery_tasks(text,integer,integer,integer,integer) TO service_role;
COMMIT;
