BEGIN;

-- Subject profile 30-day deletion buffer and SELF invariants.

ALTER TABLE public.subject_profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_deletion_at timestamptz;

ALTER TABLE public.subject_profiles
  DROP CONSTRAINT IF EXISTS subject_profiles_deletion_window_check;

ALTER TABLE public.subject_profiles
  ADD CONSTRAINT subject_profiles_deletion_window_check CHECK (
    (deletion_requested_at IS NULL AND scheduled_deletion_at IS NULL)
    OR
    (deletion_requested_at IS NOT NULL AND scheduled_deletion_at IS NOT NULL AND scheduled_deletion_at >= deletion_requested_at)
  );

CREATE INDEX IF NOT EXISTS subject_profiles_scheduled_deletion_idx
  ON public.subject_profiles (scheduled_deletion_at)
  WHERE scheduled_deletion_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS subject_profiles_one_self_per_user_idx
  ON public.subject_profiles (user_id)
  WHERE relationship_code = 'SELF';

-- A historical quiz attempt is retained when its non-SELF subject profile is
-- permanently purged. The subject reference is detached instead of blocking
-- deletion or deleting the paid/history record itself.
ALTER TABLE public.quiz_attempts
  DROP CONSTRAINT IF EXISTS quiz_attempts_subject_owner_fkey;

ALTER TABLE public.quiz_attempts
  ADD CONSTRAINT quiz_attempts_subject_owner_fkey
  FOREIGN KEY (subject_profile_id, owner_id)
  REFERENCES public.subject_profiles(id, user_id)
  ON DELETE SET NULL (subject_profile_id);

CREATE OR REPLACE FUNCTION public.purge_due_subject_profiles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.subject_profiles
  WHERE relationship_code <> 'SELF'
    AND scheduled_deletion_at IS NOT NULL
    AND scheduled_deletion_at <= now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_due_subject_profiles() FROM public;
REVOKE ALL ON FUNCTION public.purge_due_subject_profiles() FROM anon;
REVOKE ALL ON FUNCTION public.purge_due_subject_profiles() FROM authenticated;

-- Supabase Cron is backed by pg_cron and runs inside Postgres, so the purge
-- does not require an always-on application worker or an additional paid
-- service. Run hourly; a profile becomes eligible only after its exact
-- scheduled_deletion_at timestamp has passed.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

SELECT cron.schedule(
  'purge-due-subject-profiles',
  '17 * * * *',
  $cron$SELECT public.purge_due_subject_profiles();$cron$
);

COMMIT;
