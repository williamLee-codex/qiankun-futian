BEGIN;

DO $$
BEGIN
  IF to_regclass('public.animal_personality_results') IS NULL
    OR to_regclass('public.animal_personality_v4_reports') IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'animal_personality_results'
        AND column_name = 'v3_completed_at'
    )
  THEN
    RAISE EXCEPTION 'ANIMAL_PERSONALITY_V4_COMPLETED_V3_BOUNDARY_PREREQUISITE_MISSING';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.animal_personality_v4_require_completed_v3()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.animal_personality_results result
    WHERE result.attempt_id = NEW.attempt_id
      AND result.v3_completed_at IS NOT NULL
      AND result.v3_scoring_version IS NOT NULL
      AND result.v3_source_hash IS NOT NULL
      AND result.v3_dominant_trait_id IS NOT NULL
      AND result.v3_dimension_scores IS NOT NULL
      AND result.v3_round_scores IS NOT NULL
      AND result.v3_overall_raw IS NOT NULL
      AND result.v3_stability_label IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'ANIMAL_PERSONALITY_V4_REQUIRES_COMPLETED_V3';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS animal_personality_v4_require_completed_v3_trg
  ON public.animal_personality_v4_reports;
CREATE TRIGGER animal_personality_v4_require_completed_v3_trg
BEFORE INSERT ON public.animal_personality_v4_reports
FOR EACH ROW
EXECUTE FUNCTION public.animal_personality_v4_require_completed_v3();

REVOKE ALL ON FUNCTION public.animal_personality_v4_require_completed_v3()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.animal_personality_v4_require_completed_v3()
  TO service_role;

COMMIT;
