BEGIN;
-- Persistent recovery tasks. A task outlives the request, the process and a
-- redeploy: it carries the original request, a lease, an attempt count and a
-- next run time, so any scheduled runner can pick it up exactly once.
CREATE TABLE public.farm_v2_recovery_task (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL,
 request_id text NOT NULL,
 action text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','leased','done','abandoned')),
 attempts integer NOT NULL DEFAULT 0,
 max_attempts integer NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 100),
 next_run_at timestamptz NOT NULL DEFAULT now(),
 lease_owner text,
 lease_expires_at timestamptz,
 last_error text,
 outcome text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 -- One task per original request, whatever retried it.
 UNIQUE (user_id, request_id)
);
CREATE INDEX farm_v2_recovery_task_due_idx
 ON public.farm_v2_recovery_task (state, next_run_at);
ALTER TABLE public.farm_v2_recovery_task ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farm_v2_recovery_task FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.farm_v2_recovery_task TO service_role;

-- A lease that expires is reclaimed: the worker that held it is gone.
CREATE OR REPLACE FUNCTION public.farm_v2_claim_recovery_tasks(
 p_owner text, p_limit integer, p_lease_seconds integer
) RETURNS SETOF public.farm_v2_recovery_task
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF nullif(btrim(p_owner),'') IS NULL OR p_owner !~ '^[A-Za-z0-9._:@-]{1,120}$'
   OR p_limit IS NULL OR p_limit < 1 OR p_limit > 100
   OR p_lease_seconds IS NULL OR p_lease_seconds < 5 OR p_lease_seconds > 3600 THEN
  RAISE EXCEPTION 'INVALID_RECOVERY_CLAIM'; END IF;
 RETURN QUERY
 WITH due AS (
  SELECT t.id FROM public.farm_v2_recovery_task t
   WHERE (t.state='pending' AND t.next_run_at <= now())
      OR (t.state='leased' AND t.lease_expires_at <= now())
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
REVOKE ALL ON FUNCTION public.farm_v2_claim_recovery_tasks(text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_claim_recovery_tasks(text,integer,integer) TO service_role;

-- Only the lease holder may finish, and only while it still holds the lease.
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
  RETURNING * INTO t;
 IF t.id IS NULL THEN RAISE EXCEPTION 'RECOVERY_LEASE_LOST'; END IF;
 RETURN t;
END; $fn$;
REVOKE ALL ON FUNCTION public.farm_v2_finish_recovery_task(uuid,text,text,text,text,timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_finish_recovery_task(uuid,text,text,text,text,timestamptz) TO service_role;

-- Operator audit: what is stuck, what keeps failing, what was given up on.
CREATE OR REPLACE VIEW public.farm_v2_recovery_task_watch AS
 SELECT state, count(*) AS task_count, max(attempts) AS worst_attempts,
        min(created_at) AS oldest_at, max(updated_at) AS newest_at
 FROM public.farm_v2_recovery_task
 GROUP BY state;
REVOKE ALL ON public.farm_v2_recovery_task_watch FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.farm_v2_recovery_task_watch TO service_role;
COMMIT;
