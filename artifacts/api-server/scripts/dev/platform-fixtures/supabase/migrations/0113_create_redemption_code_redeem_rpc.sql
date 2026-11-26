BEGIN;

CREATE OR REPLACE FUNCTION platform.redeem_code(
  p_owner_id uuid,
  p_code text,
  p_character_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $$
DECLARE
  v_code platform.redemption_codes;
  v_reward platform.redemption_code_rewards;
  v_claim_id uuid;
  v_count integer;
  v_wallet_result jsonb;
  v_rpg_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_status text;
  v_idempotency text;
BEGIN
  IF p_owner_id IS NULL OR btrim(coalesce(p_code, '')) = '' THEN
    RETURN jsonb_build_object('result_status', 'invalid_request');
  END IF;

  SELECT *
  INTO v_code
  FROM platform.redemption_codes
  WHERE code = upper(btrim(p_code))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status', 'invalid_code');
  END IF;

  IF v_code.status <> 'active'
     OR (v_code.starts_at IS NOT NULL AND now() < v_code.starts_at)
     OR (v_code.expires_at IS NOT NULL AND now() >= v_code.expires_at) THEN
    RETURN jsonb_build_object('result_status', 'inactive');
  END IF;

  SELECT count(*) INTO v_count
  FROM platform.redemption_code_claims
  WHERE redemption_code_id = v_code.id;

  IF v_code.max_redemptions IS NOT NULL
     AND v_count >= v_code.max_redemptions THEN
    RETURN jsonb_build_object('result_status', 'exhausted');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM platform.redemption_code_claims
    WHERE redemption_code_id = v_code.id
      AND owner_id = p_owner_id
  ) THEN
    RETURN jsonb_build_object('result_status', 'duplicate');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM platform.redemption_code_rewards
    WHERE redemption_code_id = v_code.id
      AND reward_type = 'rpg'
  ) AND p_character_id IS NULL THEN
    RETURN jsonb_build_object('result_status', 'character_required');
  END IF;

  INSERT INTO platform.redemption_code_claims (
    redemption_code_id, owner_id, character_id
  )
  VALUES (v_code.id, p_owner_id, p_character_id)
  RETURNING id INTO v_claim_id;

  FOR v_reward IN
    SELECT *
    FROM platform.redemption_code_rewards
    WHERE redemption_code_id = v_code.id
    ORDER BY reward_order
  LOOP
    v_idempotency := format(
      'redemption:%s:%s:%s',
      v_code.id, p_owner_id, v_reward.reward_order
    );

    IF v_reward.reward_type = 'wallet' THEN
      v_wallet_result := public.core_wallet_apply_transaction(
        p_owner_id,
        v_reward.amount,
        v_reward.currency,
        'credit',
        v_idempotency,
        '兌換碼獎勵',
        v_code.id::text,
        'redemption_code',
        NULL
      );

      v_status := v_wallet_result->>'result_status';

      IF v_status NOT IN ('created', 'duplicate') THEN
        RAISE EXCEPTION 'REDEMPTION_WALLET_FAILED';
      END IF;

      v_results := v_results || jsonb_build_array(v_wallet_result);
    ELSE
      v_rpg_result := platform.settle_rpg_economy(
        p_character_id,
        v_idempotency,
        'redemption_code',
        v_code.id::text,
        '[]'::jsonb,
        jsonb_build_array(jsonb_build_object(
          'itemKey', v_reward.item_key,
          'itemClass', v_reward.item_class,
          'direction', 'credit',
          'quantity', v_reward.quantity
        ))
      );

      v_results := v_results || jsonb_build_array(v_rpg_result);
    END IF;
  END LOOP;

  UPDATE platform.redemption_code_claims
  SET result = jsonb_build_object(
    'result_status', 'created',
    'rewards', v_results
  )
  WHERE id = v_claim_id;

  INSERT INTO platform.admin_audit_logs (
    actor_id, actor_roles, action, target_type, target_id,
    result, metadata, source
  )
  VALUES (
    p_owner_id, ARRAY['MEMBER'], 'redemption_code.redeem',
    'redemption_claim', v_claim_id, 'succeeded',
    jsonb_build_object(
      'redemption_code_id', v_code.id,
      'owner_id', p_owner_id
    ),
    'member-api'
  );

  RETURN jsonb_build_object(
    'result_status', 'created',
    'claim_id', v_claim_id,
    'rewards', v_results
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('result_status', 'duplicate');
END;
$$;

REVOKE ALL ON FUNCTION platform.redeem_code(uuid, text, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION platform.redeem_code(uuid, text, uuid)
TO service_role;

COMMIT;
