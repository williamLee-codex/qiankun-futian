BEGIN;

CREATE TABLE IF NOT EXISTS public.imperial_chart_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  subject_profile_id uuid NOT NULL,
  engine_version text NOT NULL,
  calculation_input jsonb NOT NULL,
  calculation_output jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT imperial_chart_snapshots_pkey PRIMARY KEY (id),
  CONSTRAINT imperial_chart_snapshots_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT imperial_chart_snapshots_subject_profile_owner_fkey
    FOREIGN KEY (subject_profile_id, owner_id)
    REFERENCES public.subject_profiles(id, user_id) ON DELETE CASCADE,
  CONSTRAINT imperial_chart_snapshots_engine_version_check
    CHECK (btrim(engine_version) <> ''),
  CONSTRAINT imperial_chart_snapshots_calculation_input_check
    CHECK (jsonb_typeof(calculation_input) = 'object'),
  CONSTRAINT imperial_chart_snapshots_calculation_output_check
    CHECK (jsonb_typeof(calculation_output) = 'object'),
  CONSTRAINT imperial_chart_snapshots_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE public.imperial_chart_snapshots IS
'Immutable Imperial Star Book Zi Wei chart snapshots. Snapshots are generated from approved calculation engines and are never re-rendered from live subject data.';
COMMENT ON COLUMN public.imperial_chart_snapshots.owner_id IS
'Authenticated owner of the chart snapshot. This references auth.users because the existing People System subject_profiles table is auth-user owned.';
COMMENT ON COLUMN public.imperial_chart_snapshots.subject_profile_id IS
'Existing People System subject profile reference. This table does not create a second Person model.';
COMMENT ON COLUMN public.imperial_chart_snapshots.engine_version IS
'Deterministic chart engine version used to produce the snapshot.';
COMMENT ON COLUMN public.imperial_chart_snapshots.calculation_input IS
'Birth and subject input snapshot used for calculation. Historical records must not be recalculated from live profile data.';
COMMENT ON COLUMN public.imperial_chart_snapshots.calculation_output IS
'Complete Zi Wei chart output snapshot. Historical records must not be replaced by fallback or hardcoded chart data.';

CREATE INDEX IF NOT EXISTS imperial_chart_snapshots_owner_created_at_idx
  ON public.imperial_chart_snapshots (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS imperial_chart_snapshots_subject_created_at_idx
  ON public.imperial_chart_snapshots (subject_profile_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_imperial_chart_snapshots_reject_update
  ON public.imperial_chart_snapshots;
CREATE TRIGGER trg_imperial_chart_snapshots_reject_update
  BEFORE UPDATE ON public.imperial_chart_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

DROP TRIGGER IF EXISTS trg_imperial_chart_snapshots_reject_delete
  ON public.imperial_chart_snapshots;
CREATE TRIGGER trg_imperial_chart_snapshots_reject_delete
  BEFORE DELETE ON public.imperial_chart_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

CREATE TABLE IF NOT EXISTS public.imperial_saved_readings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  subject_profile_id uuid NOT NULL,
  chart_snapshot_id uuid NOT NULL,
  ai_model text NOT NULL,
  interpretation jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT imperial_saved_readings_pkey PRIMARY KEY (id),
  CONSTRAINT imperial_saved_readings_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT imperial_saved_readings_subject_profile_owner_fkey
    FOREIGN KEY (subject_profile_id, owner_id)
    REFERENCES public.subject_profiles(id, user_id) ON DELETE CASCADE,
  CONSTRAINT imperial_saved_readings_chart_snapshot_id_fkey
    FOREIGN KEY (chart_snapshot_id) REFERENCES public.imperial_chart_snapshots(id) ON DELETE RESTRICT,
  CONSTRAINT imperial_saved_readings_ai_model_check
    CHECK (btrim(ai_model) <> ''),
  CONSTRAINT imperial_saved_readings_interpretation_check
    CHECK (jsonb_typeof(interpretation) = 'object'),
  CONSTRAINT imperial_saved_readings_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE public.imperial_saved_readings IS
'Immutable saved Imperial Star Book AI interpretations linked to immutable chart snapshots.';
COMMENT ON COLUMN public.imperial_saved_readings.interpretation IS
'Strict AI interpretation JSON. Generic fallback text and raw provider prompts are not persisted.';

CREATE INDEX IF NOT EXISTS imperial_saved_readings_owner_created_at_idx
  ON public.imperial_saved_readings (owner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS imperial_saved_readings_chart_snapshot_id_idx
  ON public.imperial_saved_readings (chart_snapshot_id);

DROP TRIGGER IF EXISTS trg_imperial_saved_readings_reject_update
  ON public.imperial_saved_readings;
CREATE TRIGGER trg_imperial_saved_readings_reject_update
  BEFORE UPDATE ON public.imperial_saved_readings
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

DROP TRIGGER IF EXISTS trg_imperial_saved_readings_reject_delete
  ON public.imperial_saved_readings;
CREATE TRIGGER trg_imperial_saved_readings_reject_delete
  BEFORE DELETE ON public.imperial_saved_readings
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

ALTER TABLE public.imperial_chart_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imperial_saved_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS imperial_chart_snapshots_select_own
  ON public.imperial_chart_snapshots;
CREATE POLICY imperial_chart_snapshots_select_own
  ON public.imperial_chart_snapshots
  FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS imperial_chart_snapshots_insert_own
  ON public.imperial_chart_snapshots;
CREATE POLICY imperial_chart_snapshots_insert_own
  ON public.imperial_chart_snapshots
  FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1
      FROM public.subject_profiles sp
      WHERE sp.id = subject_profile_id
        AND sp.user_id = owner_id
    )
  );

DROP POLICY IF EXISTS imperial_saved_readings_select_own
  ON public.imperial_saved_readings;
CREATE POLICY imperial_saved_readings_select_own
  ON public.imperial_saved_readings
  FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS imperial_saved_readings_insert_own
  ON public.imperial_saved_readings;
CREATE POLICY imperial_saved_readings_insert_own
  ON public.imperial_saved_readings
  FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND EXISTS (
      SELECT 1
      FROM public.imperial_chart_snapshots snapshot
      WHERE snapshot.id = chart_snapshot_id
        AND snapshot.owner_id = owner_id
        AND snapshot.subject_profile_id = subject_profile_id
    )
  );

COMMIT;
