BEGIN;

CREATE OR REPLACE FUNCTION platform.redemption_is_super_admin(p_actor_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = platform
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform.admin_role_assignments
    WHERE user_id = p_actor_id
      AND role = 'SUPER_ADMIN'
      AND revoked_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION platform.create_redemption_code(
  p_actor_id uuid,
  p_code text,
  p_rewards jsonb,
  p_max_redemptions integer DEFAULT NULL,
  p_starts_at timestamptz DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $$
DECLARE
  v_id uuid;
  v_reward jsonb;
  v_order integer := 0;
BEGIN
  IF NOT platform.redemption_is_super_admin(p_actor_id) THEN
    RAISE EXCEPTION 'REDEMPTION_CREATE_FORBIDDEN';
  END IF;

  IF btrim(coalesce(p_code, '')) = ''
     OR jsonb_typeof(p_rewards) <> 'array'
     OR jsonb_array_length(p_rewards) = 0 THEN
    RAISE EXCEPTION 'REDEMPTION_INVALID_DEFINITION';
  END IF;

  INSERT INTO platform.redemption_codes (
    code, max_redemptions, starts_at, expires_at, created_by
  )
  VALUES (
    upper(btrim(p_code)), p_max_redemptions, p_starts_at, p_expires_at, p_actor_id
  )
  RETURNING id INTO v_id;

  FOR v_reward IN SELECT value FROM jsonb_array_elements(p_rewards)
  LOOP
    v_order := v_order + 1;

    IF v_reward->>'rewardType' = 'wallet' THEN
      INSERT INTO platform.redemption_code_rewards (
        redemption_code_id, reward_order, reward_type,
        currency, amount, payload
      )
      VALUES (
        v_id, v_order, 'wallet',
        v_reward->>'currency', (v_reward->>'amount')::integer,
        coalesce(v_reward->'payload', '{}'::jsonb)
      );
    ELSIF v_reward->>'rewardType' = 'rpg' THEN
      INSERT INTO platform.redemption_code_rewards (
        redemption_code_id, reward_order, reward_type,
        item_key, item_class, quantity, payload
      )
      VALUES (
        v_id, v_order, 'rpg',
        v_reward->>'itemKey', v_reward->>'itemClass',
        (v_reward->>'quantity')::integer,
        coalesce(v_reward->'payload', '{}'::jsonb)
      );
    ELSE
      RAISE EXCEPTION 'REDEMPTION_INVALID_REWARD';
    END IF;
  END LOOP;

  INSERT INTO platform.admin_audit_logs (
    actor_id, actor_roles, action, target_type, target_id,
    result, metadata, source
  )
  VALUES (
    p_actor_id, ARRAY['SUPER_ADMIN'], 'redemption_code.create',
    'redemption_code', v_id, 'succeeded',
    jsonb_build_object('code', upper(btrim(p_code))),
    'admin-console'
  );

  RETURN jsonb_build_object(
    'result_status', 'created',
    'redemption_code_id', v_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION platform.set_redemption_code_status(
  p_actor_id uuid,
  p_code_id uuid,
  p_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform, public
AS $$
DECLARE
  v_previous text;
BEGIN
  IF NOT platform.redemption_is_super_admin(p_actor_id) THEN
    RAISE EXCEPTION 'REDEMPTION_STATUS_FORBIDDEN';
  END IF;

  IF p_status NOT IN ('active', 'disabled') THEN
    RAISE EXCEPTION 'REDEMPTION_INVALID_STATUS';
  END IF;

  SELECT status INTO v_previous
  FROM platform.redemption_codes
  WHERE id = p_code_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REDEMPTION_NOT_FOUND';
  END IF;

  UPDATE platform.redemption_codes
  SET status = p_status,
      enabled_at = CASE WHEN p_status = 'active' THEN now() ELSE enabled_at END,
      disabled_at = CASE WHEN p_status = 'disabled' THEN now() ELSE disabled_at END
  WHERE id = p_code_id;

  INSERT INTO platform.admin_audit_logs (
    actor_id, actor_roles, action, target_type, target_id,
    result, metadata, source
  )
  VALUES (
    p_actor_id, ARRAY['SUPER_ADMIN'],
    CASE WHEN p_status = 'active'
      THEN 'redemption_code.enable'
      ELSE 'redemption_code.disable'
    END,
    'redemption_code', p_code_id, 'succeeded',
    jsonb_build_object('from', v_previous, 'to', p_status),
    'admin-console'
  );

  RETURN jsonb_build_object('result_status', 'updated', 'status', p_status);
END;
$$;

REVOKE ALL ON FUNCTION platform.redemption_is_super_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform.create_redemption_code(uuid, text, jsonb, integer, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform.set_redemption_code_status(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION platform.create_redemption_code(uuid, text, jsonb, integer, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION platform.set_redemption_code_status(uuid, uuid, text) TO service_role;

COMMIT;
