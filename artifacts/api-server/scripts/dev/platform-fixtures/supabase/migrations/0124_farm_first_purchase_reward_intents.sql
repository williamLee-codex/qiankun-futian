BEGIN;
-- Durable reward intents; these are NOT delivered rewards.
-- Delivery workers must atomically post all gifts and only then insert into
-- farm_first_purchase_claims in the SAME transaction.
BEGIN;
CREATE TABLE IF NOT EXISTS platform.farm_first_purchase_reward_intents (
  user_id text NOT NULL,
  plan_id text NOT NULL,
  claim_day integer NOT NULL CHECK (claim_day BETWEEN 1 AND 3),
  reward_items jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  PRIMARY KEY (user_id,plan_id,claim_day),
  FOREIGN KEY (user_id,plan_id) REFERENCES platform.farm_first_purchase_entitlements(user_id,plan_id),
  CONSTRAINT farm_first_purchase_reward_items_array CHECK (jsonb_typeof(reward_items)='array'),
  CONSTRAINT farm_first_purchase_delivery_consistency CHECK (
    (status='pending' AND delivered_at IS NULL)
    OR (status='delivered' AND delivered_at IS NOT NULL)
  )
);
ALTER TABLE platform.farm_first_purchase_reward_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform.farm_first_purchase_reward_intents FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON platform.farm_first_purchase_reward_intents TO service_role;
CREATE POLICY farm_first_purchase_intents_service_read ON platform.farm_first_purchase_reward_intents FOR SELECT TO service_role USING (true);
CREATE POLICY farm_first_purchase_intents_service_insert ON platform.farm_first_purchase_reward_intents FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY farm_first_purchase_intents_service_update ON platform.farm_first_purchase_reward_intents FOR UPDATE TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE platform.farm_first_purchase_reward_intents IS
'Pending reward intents only. A pending row is NOT a claim and MUST NOT be presented as delivered. Delivery must be transactional and idempotent across all gift types.';
COMMIT;
