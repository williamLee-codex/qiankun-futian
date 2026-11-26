BEGIN;
-- First-purchase entitlement storage only. No retroactive grant, wallet mutation, or callback activation.
BEGIN;

CREATE TABLE IF NOT EXISTS platform.farm_first_purchase_entitlements (
  user_id text NOT NULL,
  plan_id text NOT NULL CHECK (plan_id IN ('A','B','C')),
  payment_order_id text NOT NULL REFERENCES platform.payment_orders(order_id),
  purchased_crystals integer NOT NULL CHECK (purchased_crystals IN (60,180,360)),
  bonus_crystals_total integer NOT NULL CHECK (bonus_crystals_total IN (60,180,360)),
  paid_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,plan_id),
  UNIQUE (payment_order_id),
  CONSTRAINT farm_first_purchase_amounts CHECK (
    (plan_id='A' AND purchased_crystals=60 AND bonus_crystals_total=60)
    OR (plan_id='B' AND purchased_crystals=180 AND bonus_crystals_total=180)
    OR (plan_id='C' AND purchased_crystals=360 AND bonus_crystals_total=360)
  )
);

CREATE TABLE IF NOT EXISTS platform.farm_first_purchase_claims (
  user_id text NOT NULL,
  plan_id text NOT NULL,
  claim_day integer NOT NULL CHECK (claim_day BETWEEN 1 AND 3),
  gift_crystals integer NOT NULL CHECK (gift_crystals IN (20,60,120)),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  grant_reference text NOT NULL,
  PRIMARY KEY (user_id,plan_id,claim_day),
  UNIQUE (grant_reference),
  FOREIGN KEY (user_id,plan_id)
    REFERENCES platform.farm_first_purchase_entitlements(user_id,plan_id),
  CONSTRAINT farm_first_purchase_claim_amount CHECK (
    (plan_id='A' AND gift_crystals=20)
    OR (plan_id='B' AND gift_crystals=60)
    OR (plan_id='C' AND gift_crystals=120)
  )
);

COMMENT ON TABLE platform.farm_first_purchase_entitlements IS
'One purchase per player per plan. purchased_crystals alone counts toward paid unlock milestones. Insert only after verified NewebPay payment and successful paid-wallet credit.';
COMMENT ON TABLE platform.farm_first_purchase_claims IS
'One claim per plan per day; gift_crystals are gifted wallet currency, excluded from paid unlock milestones. Claim record and all reward grants must commit in one database transaction.';

CREATE INDEX IF NOT EXISTS farm_first_purchase_entitlements_order_idx
  ON platform.farm_first_purchase_entitlements(payment_order_id);

ALTER TABLE platform.farm_first_purchase_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.farm_first_purchase_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON platform.farm_first_purchase_entitlements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON platform.farm_first_purchase_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON platform.farm_first_purchase_entitlements TO service_role;
GRANT SELECT, INSERT ON platform.farm_first_purchase_claims TO service_role;

CREATE POLICY farm_first_purchase_entitlements_service_read
  ON platform.farm_first_purchase_entitlements FOR SELECT TO service_role USING (true);
CREATE POLICY farm_first_purchase_entitlements_service_insert
  ON platform.farm_first_purchase_entitlements FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY farm_first_purchase_claims_service_read
  ON platform.farm_first_purchase_claims FOR SELECT TO service_role USING (true);
CREATE POLICY farm_first_purchase_claims_service_insert
  ON platform.farm_first_purchase_claims FOR INSERT TO service_role WITH CHECK (true);

COMMIT;
