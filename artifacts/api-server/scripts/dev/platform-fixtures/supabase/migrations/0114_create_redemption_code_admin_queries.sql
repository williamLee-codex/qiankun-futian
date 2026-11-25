BEGIN;

CREATE OR REPLACE FUNCTION platform.list_redemption_codes(
  p_actor_id uuid,
  p_include_disabled boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = platform
AS $$
BEGIN
  IF NOT platform.redemption_is_super_admin(p_actor_id) THEN
    RAISE EXCEPTION 'REDEMPTION_LIST_FORBIDDEN';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x) ORDER BY x.created_at DESC)
    FROM (
      SELECT
        c.id,
        c.code,
        c.status,
        c.max_redemptions,
        c.starts_at,
        c.expires_at,
        c.created_by,
        c.created_at,
        c.enabled_at,
        c.disabled_at,
        (
          SELECT count(*)
          FROM platform.redemption_code_claims cl
          WHERE cl.redemption_code_id = c.id
        ) AS redeemed_count,
        (
          SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.reward_order), '[]'::jsonb)
          FROM (
            SELECT reward_order, reward_type, currency, amount,
                   item_key, item_class, quantity, payload
            FROM platform.redemption_code_rewards
            WHERE redemption_code_id = c.id
          ) r
        ) AS rewards
      FROM platform.redemption_codes c
      WHERE p_include_disabled OR c.status NOT IN ('disabled', 'expired')
    ) x
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION platform.list_redemption_claims(
  p_actor_id uuid,
  p_code_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = platform
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.claimed_at DESC), '[]'::jsonb)
  FROM (
    SELECT id, redemption_code_id, owner_id, character_id,
           result, claimed_at
    FROM platform.redemption_code_claims
    WHERE platform.redemption_is_super_admin(p_actor_id)
      AND (p_code_id IS NULL OR redemption_code_id = p_code_id)
  ) x;
$$;

REVOKE ALL ON FUNCTION platform.list_redemption_codes(uuid, boolean)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION platform.list_redemption_claims(uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION platform.list_redemption_codes(uuid, boolean)
TO service_role;
GRANT EXECUTE ON FUNCTION platform.list_redemption_claims(uuid, uuid)
TO service_role;

COMMIT;
