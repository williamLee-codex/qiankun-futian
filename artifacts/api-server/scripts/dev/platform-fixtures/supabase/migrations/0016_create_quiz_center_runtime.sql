BEGIN;

CREATE TABLE IF NOT EXISTS public.quiz_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  price_tier text NOT NULL,
  requires_subject boolean NOT NULL DEFAULT false,
  requires_birth_data boolean NOT NULL DEFAULT false,
  ai_supplement_enabled boolean NOT NULL DEFAULT false,
  definition jsonb NOT NULL,
  published_at timestamptz,
  scheduled_for timestamptz,
  disabled_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quiz_definitions_slug_check CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT quiz_definitions_title_check CHECK (btrim(title) <> ''),
  CONSTRAINT quiz_definitions_status_check CHECK (status IN ('draft', 'review', 'scheduled', 'published', 'disabled', 'archived')),
  CONSTRAINT quiz_definitions_price_tier_check CHECK (price_tier IN ('free', 'gold_50', 'gold_200', 'crystal_5')),
  CONSTRAINT quiz_definitions_definition_check CHECK (jsonb_typeof(definition) = 'object'),
  CONSTRAINT quiz_definitions_birth_data_check CHECK (NOT requires_birth_data OR requires_subject),
  CONSTRAINT quiz_definitions_ai_check CHECK (NOT ai_supplement_enabled OR price_tier = 'crystal_5')
);

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quiz_definitions(id) ON DELETE RESTRICT,
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_profile_id uuid,
  guest_token_hash text,
  nickname text,
  status text NOT NULL DEFAULT 'started',
  private_response jsonb,
  primary_result_id text,
  primary_score integer,
  ai_supplement jsonb,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quiz_attempts_identity_check CHECK (owner_id IS NOT NULL OR guest_token_hash IS NOT NULL),
  CONSTRAINT quiz_attempts_status_check CHECK (status IN ('started', 'completed', 'failed', 'cancelled')),
  CONSTRAINT quiz_attempts_response_check CHECK (private_response IS NULL OR jsonb_typeof(private_response) = 'object'),
  CONSTRAINT quiz_attempts_ai_supplement_check CHECK (ai_supplement IS NULL OR jsonb_typeof(ai_supplement) = 'object'),
  CONSTRAINT quiz_attempts_subject_owner_fkey FOREIGN KEY (subject_profile_id, owner_id)
    REFERENCES public.subject_profiles(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS public.quiz_resource_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  currency text NOT NULL,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'RESERVED',
  expires_at timestamptz NOT NULL,
  debit_idempotency_key text UNIQUE,
  completed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quiz_resource_reservations_currency_check CHECK (currency IN ('gold', 'crystal')),
  CONSTRAINT quiz_resource_reservations_amount_check CHECK (amount > 0),
  CONSTRAINT quiz_resource_reservations_status_check CHECK (status IN ('RESERVED', 'COMPLETED', 'RELEASED', 'EXPIRED')),
  CONSTRAINT quiz_resource_reservations_expiry_check CHECK (expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS public.quiz_share_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  share_id text NOT NULL UNIQUE,
  nickname text,
  quiz_title text NOT NULL,
  result_name text NOT NULL,
  image_url text,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CONSTRAINT quiz_share_cards_share_id_check CHECK (share_id ~ '^[A-Za-z0-9_-]{12,}$'),
  CONSTRAINT quiz_share_cards_quiz_title_check CHECK (btrim(quiz_title) <> ''),
  CONSTRAINT quiz_share_cards_result_name_check CHECK (btrim(result_name) <> ''),
  CONSTRAINT quiz_share_cards_summary_check CHECK (btrim(summary) <> '')
);

CREATE INDEX IF NOT EXISTS quiz_definitions_public_idx ON public.quiz_definitions (status, published_at DESC);
CREATE INDEX IF NOT EXISTS quiz_attempts_owner_created_idx ON public.quiz_attempts (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_attempts_guest_created_idx ON public.quiz_attempts (guest_token_hash, created_at DESC) WHERE guest_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS quiz_resource_reservations_expiry_idx ON public.quiz_resource_reservations (status, expires_at);

ALTER TABLE public.quiz_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_resource_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_share_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quiz_definitions_public_select ON public.quiz_definitions;
CREATE POLICY quiz_definitions_public_select ON public.quiz_definitions FOR SELECT
  USING (status = 'published' AND published_at IS NOT NULL AND published_at <= now() AND disabled_at IS NULL AND archived_at IS NULL);

DROP POLICY IF EXISTS quiz_attempts_owner_select ON public.quiz_attempts;
CREATE POLICY quiz_attempts_owner_select ON public.quiz_attempts FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS quiz_resource_reservations_owner_select ON public.quiz_resource_reservations;
CREATE POLICY quiz_resource_reservations_owner_select ON public.quiz_resource_reservations FOR SELECT
  USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS quiz_share_cards_public_select ON public.quiz_share_cards;
CREATE POLICY quiz_share_cards_public_select ON public.quiz_share_cards FOR SELECT
  USING (revoked_at IS NULL);

DROP POLICY IF EXISTS quiz_definitions_service_role_all ON public.quiz_definitions;
CREATE POLICY quiz_definitions_service_role_all ON public.quiz_definitions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS quiz_attempts_service_role_all ON public.quiz_attempts;
CREATE POLICY quiz_attempts_service_role_all ON public.quiz_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS quiz_resource_reservations_service_role_all ON public.quiz_resource_reservations;
CREATE POLICY quiz_resource_reservations_service_role_all ON public.quiz_resource_reservations FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS quiz_share_cards_service_role_all ON public.quiz_share_cards;
CREATE POLICY quiz_share_cards_service_role_all ON public.quiz_share_cards FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
