-- Farm V2 backend-only state. Core Wallet and Farm V1 remain independent.
-- Apply only after reviewing the target database and backend connection role.
BEGIN;
CREATE TABLE public.farm_v2_player_state (
  user_id text PRIMARY KEY,
  first_farm_entered_at timestamptz,
  effective_paid_crystals integer NOT NULL DEFAULT 0 CHECK (effective_paid_crystals >= 0),
  access_state jsonb NOT NULL,
  warehouse_state jsonb NOT NULL,
  mission_state jsonb NOT NULL,
  pet_state jsonb NOT NULL,
  farmer_state jsonb NOT NULL,
  chaos_seed_state jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.farm_v2_land (
  user_id text NOT NULL,
  land_id integer NOT NULL CHECK (land_id BETWEEN 1 AND 6),
  lifecycle text NOT NULL CHECK (lifecycle IN ('LOCKED','EMPTY','GROWING','MATURE')),
  access_active boolean NOT NULL,
  planted_quantity integer NOT NULL DEFAULT 0 CHECK (planted_quantity >= 0),
  planted_at timestamptz,
  matures_at timestamptz,
  version bigint NOT NULL DEFAULT 0 CHECK (version >= 0),
  PRIMARY KEY (user_id, land_id)
);
CREATE TABLE public.farm_v2_mutation (
  request_id text NOT NULL,
  user_id text NOT NULL,
  action text NOT NULL,
  response jsonb,
  transaction_state text NOT NULL DEFAULT 'PENDING'
    CHECK (transaction_state IN ('PENDING','WALLET_APPLIED','COMPENSATING','COMPENSATED','COMPLETED','REJECTED')),
  wallet_direction text CHECK (wallet_direction IN ('credit','debit')),
  wallet_currency text CHECK (wallet_currency IN ('coin','crystal')),
  wallet_amount integer CHECK (wallet_amount > 0),
  wallet_transaction jsonb,
  failure_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, request_id)
);
-- Launch-token API routes enforce player identity. Direct browser access must
-- never mutate state or the wallet recovery journal, even for its own user.
ALTER TABLE public.farm_v2_player_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_v2_land ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_v2_mutation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farm_v2_player_state, public.farm_v2_land, public.farm_v2_mutation FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.farm_v2_player_state, public.farm_v2_land, public.farm_v2_mutation TO service_role;
COMMIT;
