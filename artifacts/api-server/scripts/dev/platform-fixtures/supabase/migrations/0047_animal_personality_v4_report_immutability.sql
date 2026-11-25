BEGIN;

CREATE OR REPLACE FUNCTION public.animal_personality_v4_report_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'ANIMAL_PERSONALITY_V4_REPORT_IMMUTABLE';
END;
$$;

DROP TRIGGER IF EXISTS animal_personality_v4_report_immutable_trg
  ON public.animal_personality_v4_reports;

CREATE TRIGGER animal_personality_v4_report_immutable_trg
BEFORE UPDATE OR DELETE ON public.animal_personality_v4_reports
FOR EACH ROW
EXECUTE FUNCTION public.animal_personality_v4_report_immutable();

REVOKE ALL ON FUNCTION public.animal_personality_v4_report_immutable() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.animal_personality_v4_report_immutable() TO service_role;

COMMIT;
