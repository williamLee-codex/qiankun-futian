BEGIN;
-- Never store complete Bazi output in the Ziwei snapshot table.
CREATE TABLE public.bazi_chart_snapshots (
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_profile_id uuid NOT NULL REFERENCES public.subject_profiles(id) ON DELETE CASCADE,
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  engine_signature text NOT NULL CHECK (btrim(engine_signature) <> ''),
  calculation_input jsonb NOT NULL CHECK (jsonb_typeof(calculation_input) = 'object'),
  calculation_output jsonb NOT NULL CHECK (jsonb_typeof(calculation_output) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, subject_profile_id, input_fingerprint),
  CONSTRAINT bazi_engine_version CHECK (calculation_output->>'engineVersion' IS NOT NULL AND calculation_output->>'engineVersion' = 'BZ_ENGINE_v1.0'),
  CONSTRAINT bazi_input_matches CHECK (calculation_output->'input' IS NOT NULL AND calculation_output->'input' = calculation_input)
);
CREATE INDEX bazi_chart_snapshots_subject_idx ON public.bazi_chart_snapshots(subject_profile_id);
ALTER TABLE public.bazi_chart_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bazi_chart_snapshots FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.bazi_chart_snapshots TO service_role;

CREATE FUNCTION public.bazi_snapshot_owner_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.subject_profiles s
    WHERE s.id = NEW.subject_profile_id AND s.user_id = NEW.owner_id
      AND NOT s.is_archived AND s.deleted_at IS NULL AND s.purged_at IS NULL
  ) THEN
    RAISE EXCEPTION 'SNAPSHOT_IDENTITY_MISMATCH';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bazi_snapshot_owner_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bazi_snapshot_owner_guard() TO service_role;
CREATE TRIGGER bazi_snapshot_owner_guard BEFORE INSERT ON public.bazi_chart_snapshots
FOR EACH ROW EXECUTE FUNCTION public.bazi_snapshot_owner_guard();
COMMIT;
