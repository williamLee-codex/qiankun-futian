-- Source: lib/db/src/schema/farm-v2.ts (three game baseline tables only).
-- Strict creation: any existing target is a conflict requiring operator review.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE TABLE public.farm_v2_player_state (
 user_id text PRIMARY KEY,
 first_farm_entered_at timestamptz,
 effective_paid_crystals integer NOT NULL DEFAULT 0,
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
 land_id integer NOT NULL,
 lifecycle text NOT NULL,
 access_active boolean NOT NULL,
 planted_quantity integer NOT NULL DEFAULT 0,
 planted_at timestamptz,
 matures_at timestamptz,
 version bigint NOT NULL DEFAULT 0,
 PRIMARY KEY (user_id, land_id)
);
CREATE TABLE public.farm_v2_mutation (
 request_id text NOT NULL,
 user_id text NOT NULL,
 action text NOT NULL,
 response jsonb,
 transaction_state text NOT NULL DEFAULT 'PENDING',
 wallet_direction text,
 wallet_currency text,
 wallet_amount integer,
 wallet_transaction jsonb,
 failure_code text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, request_id)
);
COMMIT;
