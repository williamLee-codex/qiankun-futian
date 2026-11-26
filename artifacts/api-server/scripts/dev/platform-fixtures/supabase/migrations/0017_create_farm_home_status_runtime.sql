BEGIN;

-- A dwelling is absent until the member unlocks it. The homepage renders the
-- shared dwelling appearance while no row exists.
CREATE TABLE IF NOT EXISTS public.farm_dwellings (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 1,
  color_key text,
  emblem_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT farm_dwellings_level_check CHECK (level >= 1),
  CONSTRAINT farm_dwellings_color_key_check CHECK (color_key IS NULL OR btrim(color_key) <> ''),
  CONSTRAINT farm_dwellings_emblem_key_check CHECK (emblem_key IS NULL OR btrim(emblem_key) <> '')
);

CREATE TABLE IF NOT EXISTS public.farm_spirit_pets (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pet_key text NOT NULL,
  last_fed_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT farm_spirit_pets_pet_key_check CHECK (btrim(pet_key) <> '')
);

-- One row means one actual farm interaction. A borrow attempt is stored whether
-- it succeeds or fails; merely opening a farm produces no event.
CREATE TABLE IF NOT EXISTS public.farm_visit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  visitor_owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  outcome text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT farm_visit_events_distinct_users_check CHECK (host_owner_id <> visitor_owner_id),
  CONSTRAINT farm_visit_events_type_check CHECK (event_type IN ('harvest_assist', 'fortune_borrow')),
  CONSTRAINT farm_visit_events_outcome_check CHECK (
    (event_type = 'harvest_assist' AND outcome IS NULL)
    OR (event_type = 'fortune_borrow' AND outcome IN ('success', 'failed'))
  )
);

CREATE INDEX IF NOT EXISTS farm_visit_events_host_today_idx
  ON public.farm_visit_events (host_owner_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS farm_visit_events_visitor_idx
  ON public.farm_visit_events (visitor_owner_id, occurred_at DESC);

ALTER TABLE public.farm_dwellings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_spirit_pets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_visit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS farm_dwellings_owner_manage ON public.farm_dwellings;
CREATE POLICY farm_dwellings_owner_manage ON public.farm_dwellings FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS farm_spirit_pets_owner_manage ON public.farm_spirit_pets;
CREATE POLICY farm_spirit_pets_owner_manage ON public.farm_spirit_pets FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS farm_visit_events_participant_select ON public.farm_visit_events;
CREATE POLICY farm_visit_events_participant_select ON public.farm_visit_events FOR SELECT
  USING (auth.uid() = host_owner_id OR auth.uid() = visitor_owner_id);

DROP POLICY IF EXISTS farm_visit_events_visitor_insert ON public.farm_visit_events;
CREATE POLICY farm_visit_events_visitor_insert ON public.farm_visit_events FOR INSERT
  WITH CHECK (auth.uid() = visitor_owner_id);

DROP POLICY IF EXISTS farm_dwellings_service_role_all ON public.farm_dwellings;
CREATE POLICY farm_dwellings_service_role_all ON public.farm_dwellings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS farm_spirit_pets_service_role_all ON public.farm_spirit_pets;
CREATE POLICY farm_spirit_pets_service_role_all ON public.farm_spirit_pets FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS farm_visit_events_service_role_all ON public.farm_visit_events;
CREATE POLICY farm_visit_events_service_role_all ON public.farm_visit_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMIT;
