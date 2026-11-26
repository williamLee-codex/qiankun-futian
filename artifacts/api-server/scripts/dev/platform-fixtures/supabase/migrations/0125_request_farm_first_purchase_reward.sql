BEGIN;
-- Server-only request of complete daily reward bundles; NO assets credited here.
-- Canonical bundle is calculated in the database, never accepted from clients.
BEGIN;
CREATE OR REPLACE FUNCTION platform.request_farm_first_purchase_reward(
  p_user_id text,p_plan_id text,p_claim_day integer,p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog,platform AS $$
DECLARE
  v_ent platform.farm_first_purchase_entitlements%ROWTYPE;
  v_elapsed integer;
  v_crystals integer;
  v_items jsonb;
  v_key text;
BEGIN
  IF p_plan_id NOT IN ('A','B','C') OR p_claim_day NOT BETWEEN 1 AND 3 THEN
    RETURN jsonb_build_object('status','invalid_request');
  END IF;
  SELECT * INTO v_ent FROM platform.farm_first_purchase_entitlements
    WHERE user_id=p_user_id AND plan_id=p_plan_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','not_purchased'); END IF;
  IF p_now < v_ent.paid_at THEN RETURN jsonb_build_object('status','not_yet_available'); END IF;
  v_elapsed := ((p_now AT TIME ZONE 'Asia/Taipei' - interval '5 hours')::date
              - (v_ent.paid_at AT TIME ZONE 'Asia/Taipei' - interval '5 hours')::date);
  IF p_claim_day > least(3,v_elapsed+1) THEN
    RETURN jsonb_build_object('status','not_yet_available');
  END IF;
  IF EXISTS (SELECT 1 FROM platform.farm_first_purchase_claims
    WHERE user_id=p_user_id AND plan_id=p_plan_id AND claim_day=p_claim_day) THEN
    RETURN jsonb_build_object('status','already_claimed');
  END IF;
  v_crystals:=CASE p_plan_id WHEN 'A' THEN 20 WHEN 'B' THEN 60 ELSE 120 END;
  v_items:=jsonb_build_array(jsonb_build_object('item','gift_crystals','quantity',v_crystals));
  IF p_claim_day=1 THEN
    v_items:=v_items || jsonb_build_array(
      jsonb_build_object('item','spirit_sand','quantity',CASE p_plan_id WHEN 'A' THEN 6 WHEN 'B' THEN 18 ELSE 36 END),
      jsonb_build_object('item',CASE p_plan_id WHEN 'A' THEN 'random_mystic_pot' WHEN 'B' THEN 'random_heaven_pot_distinct' ELSE 'random_sacred_pot_distinct' END,'quantity',1));
  ELSIF p_claim_day=2 THEN
    v_items:=v_items || jsonb_build_array(
      jsonb_build_object('item','jade_marrow','quantity',CASE p_plan_id WHEN 'A' THEN 3 WHEN 'B' THEN 9 ELSE 18 END),
      jsonb_build_object('item','double_harvest','quantity',CASE p_plan_id WHEN 'A' THEN 4 WHEN 'B' THEN 12 ELSE 24 END));
  ELSE
    v_items:=v_items || jsonb_build_array(
      jsonb_build_object('item','double_harvest','quantity',CASE p_plan_id WHEN 'A' THEN 4 WHEN 'B' THEN 12 ELSE 24 END),
      jsonb_build_object('item',CASE p_plan_id WHEN 'A' THEN 'random_earth_pot' WHEN 'B' THEN 'random_heaven_pot_distinct' ELSE 'random_sacred_pot_distinct' END,'quantity',1));
  END IF;
  INSERT INTO platform.farm_first_purchase_reward_intents(user_id,plan_id,claim_day,reward_items)
  VALUES(p_user_id,p_plan_id,p_claim_day,v_items)
  ON CONFLICT(user_id,plan_id,claim_day) DO NOTHING;
  RETURN jsonb_build_object('status','pending_delivery','rewards',v_items);
END $$;
REVOKE ALL ON FUNCTION platform.request_farm_first_purchase_reward(text,text,integer,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION platform.request_farm_first_purchase_reward(text,text,integer,timestamptz) TO service_role;
COMMIT;
