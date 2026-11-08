BEGIN;
SET LOCAL ROLE service_role;
DO $test$
DECLARE
 owner uuid := '456f6947-74b0-4e56-b3ec-f8ccad0671d2';
 approval uuid := gen_random_uuid();
 attempt integer;
 ok boolean;
 rejected boolean := false;
BEGIN
 INSERT INTO public.agent_center_code_approvals
 (id,owner_id,repository,base_sha,source_path,expected_blob_sha,original,replacement,status,expires_at,approved_at,execution_stopped_at,recovery_next_at)
 VALUES (approval,owner,'williamLee-codex/qiankun-futian',repeat('a',40),
 'artifacts/api-server/src/lib/farm-v2-platform.ts',repeat('b',40),'fixture-before','fixture-after',
 'executing',now()+interval '1 hour',now(),now()-interval '15 minutes',now()-interval '1 minute');
 BEGIN
  UPDATE public.agent_center_code_approvals SET source_path='artifacts/api-server/src/routes/farm-v2.ts' WHERE id=approval;
 EXCEPTION WHEN check_violation THEN rejected:=true;
 END;
 IF NOT rejected THEN RAISE EXCEPTION 'out_of_scope_server_path_accepted'; END IF;
 attempt:=public.agent_center_worker_claim_code_recovery(approval,owner,120);
 IF attempt IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'first_claim_failed'; END IF;
 IF public.agent_center_worker_claim_code_recovery(approval,owner,120) IS NOT NULL
 THEN RAISE EXCEPTION 'duplicate_claim_allowed'; END IF;
 IF public.agent_center_worker_claim_code_recovery(approval,gen_random_uuid(),120) IS NOT NULL
 THEN RAISE EXCEPTION 'wrong_owner_claim_allowed'; END IF;
 ok:=public.agent_center_worker_finalize_code_approval(approval,owner,'completed',0,repeat('c',40),
 'https://github.com/williamLee-codex/qiankun-futian/pull/9',NULL);
 IF ok THEN RAISE EXCEPTION 'stale_finalize_allowed'; END IF;
 IF public.agent_center_worker_release_code_recovery(approval,owner,0,true)
 THEN RAISE EXCEPTION 'stale_release_allowed'; END IF;
 IF NOT public.agent_center_worker_release_code_recovery(approval,owner,1,true)
 THEN RAISE EXCEPTION 'valid_release_rejected'; END IF;
 IF public.agent_center_worker_claim_code_recovery(approval,owner,120) IS NOT NULL
 THEN RAISE EXCEPTION 'cooldown_bypassed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.agent_center_code_approvals WHERE id=approval
   AND recovery_next_at>clock_timestamp()+interval '23 hours' AND recovery_lease_until IS NULL)
 THEN RAISE EXCEPTION 'cooldown_not_24_hours'; END IF;
END $test$;
SELECT jsonb_build_object('bridge_path','PASS','neighbor_path_rejected','PASS','claim','PASS',
 'duplicate_claim_rejected','PASS','wrong_owner_rejected','PASS','stale_finalize_rejected','PASS',
 'stale_release_rejected','PASS','24_hour_cooldown','PASS','concurrent_connections','NOT_RUN') AS acceptance;
ROLLBACK;
