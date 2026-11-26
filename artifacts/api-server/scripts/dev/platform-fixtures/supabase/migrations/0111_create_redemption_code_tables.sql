BEGIN;

CREATE TABLE IF NOT EXISTS platform.redemption_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (char_length(btrim(code)) BETWEEN 4 AND 128),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','disabled','expired')),
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  starts_at timestamptz,
  expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_role text NOT NULL DEFAULT 'SUPER_ADMIN' CHECK (created_role = 'SUPER_ADMIN'),
  created_at timestamptz NOT NULL DEFAULT now(),
  enabled_at timestamptz,
  disabled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS platform.redemption_code_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_code_id uuid NOT NULL REFERENCES platform.redemption_codes(id) ON DELETE CASCADE,
  reward_order integer NOT NULL CHECK (reward_order > 0),
  reward_type text NOT NULL CHECK (reward_type IN ('wallet','rpg')),
  currency text CHECK (currency IN ('coin','crystal','destiny_ticket')),
  amount integer CHECK (amount > 0),
  item_key text,
  item_class text CHECK (item_class IN ('COMMON','CORE','QUEST','UNIQUE')),
  quantity integer CHECK (quantity > 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (redemption_code_id, reward_order),
  CHECK (
    (reward_type = 'wallet' AND currency IS NOT NULL AND amount IS NOT NULL AND item_key IS NULL AND quantity IS NULL)
    OR
    (reward_type = 'rpg' AND item_key IS NOT NULL AND item_class IS NOT NULL AND quantity IS NOT NULL AND currency IS NULL AND amount IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS platform.redemption_code_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redemption_code_id uuid NOT NULL REFERENCES platform.redemption_codes(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  character_id uuid,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (redemption_code_id, owner_id)
);

ALTER TABLE platform.redemption_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.redemption_code_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.redemption_code_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON platform.redemption_codes, platform.redemption_code_rewards, platform.redemption_code_claims FROM anon, authenticated;
GRANT SELECT ON platform.redemption_code_claims TO authenticated;

CREATE INDEX IF NOT EXISTS redemption_codes_status_idx ON platform.redemption_codes(status);
CREATE INDEX IF NOT EXISTS redemption_claims_owner_idx ON platform.redemption_code_claims(owner_id, claimed_at DESC);

COMMIT;
