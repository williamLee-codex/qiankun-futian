BEGIN;

-- P0: Never report this migration as successful without enforcing the
-- one-active-attempt invariant. Historical duplicates must be reconciled
-- against Core Wallet ledger and saved answers before this migration runs.
-- Do not automatically cancel or delete paid attempts here.
DO $$
DECLARE
  duplicate_count bigint;
BEGIN
  -- Lock out concurrent inserts/updates while checking and creating the index.
  LOCK TABLE public.quiz_attempts IN SHARE MODE;

  SELECT count(*) INTO duplicate_count
  FROM (
    SELECT owner_id, quiz_id
    FROM public.quiz_attempts
    WHERE owner_id IS NOT NULL AND status = 'started'
    GROUP BY owner_id, quiz_id
    HAVING count(*) > 1
  ) duplicates;

  IF duplicate_count > 0 THEN
    RAISE EXCEPTION
      'QUIZ_RESUME_DUPLICATES: % owner/quiz groups have multiple started attempts. Reconcile payment ledger and saved answers before applying migration 0122.',
      duplicate_count
      USING ERRCODE = '23505',
            HINT = 'Read-only audit: SELECT owner_id, quiz_id, count(*) FROM public.quiz_attempts WHERE owner_id IS NOT NULL AND status = ''started'' GROUP BY owner_id, quiz_id HAVING count(*) > 1; Do not automatically cancel or delete paid attempts.';
  END IF;
END $$;

-- If duplicates exist the transaction above aborts, rather than silently
-- creating only a non-unique lookup index and leaving P0 unprotected.
CREATE UNIQUE INDEX IF NOT EXISTS quiz_attempts_one_started_per_owner_idx
  ON public.quiz_attempts (owner_id, quiz_id)
  WHERE owner_id IS NOT NULL AND status = 'started';

-- Verify the exact expected index is unique and valid, including cases
-- where an index with the same name already existed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class index_relation
    JOIN pg_namespace namespace ON namespace.oid = index_relation.relnamespace
    JOIN pg_index idx ON idx.indexrelid = index_relation.oid
    WHERE namespace.nspname = 'public'
      AND index_relation.relname = 'quiz_attempts_one_started_per_owner_idx'
      AND idx.indrelid = 'public.quiz_attempts'::regclass
      AND idx.indisunique
      AND idx.indisvalid
      AND pg_get_indexdef(idx.indexrelid) LIKE '%(owner_id, quiz_id)%'
      AND pg_get_expr(idx.indpred, idx.indrelid) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'QUIZ_RESUME_INDEX_INVALID: required unique partial index was not created or is invalid';
  END IF;
END $$;

COMMIT;
