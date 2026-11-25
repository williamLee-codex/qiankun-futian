BEGIN;

CREATE OR REPLACE FUNCTION public.farm_v1_effective_paid_crystals(
  p_auth_user_id uuid
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public,core
AS $paid$
DECLARE
  v_adjustment_count bigint;
  v_effective bigint;
BEGIN
  IF p_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'FARM_PAID_QUALIFICATION_OWNER_REQUIRED';
  END IF;

  SELECT COUNT(*)
  INTO v_adjustment_count
  FROM core.users u
  JOIN core.wallets w ON w.user_id=u.id
  JOIN core.wallet_ledgers l ON l.wallet_id=w.id
  WHERE u.auth_user_id=p_auth_user_id
    AND l.currency_type='paid_crystal'
    AND l.entry_type='adjustment';

  -- The canonical schema does not define whether an adjustment grants or
  -- reverses lifetime paid qualification. Never guess that direction.
  IF v_adjustment_count>0 THEN
    RAISE EXCEPTION 'FARM_PAID_QUALIFICATION_ADJUSTMENT_UNDEFINED';
  END IF;

  SELECT COALESCE(
    GREATEST(
      0::bigint,
      SUM(
        CASE
          WHEN l.entry_type='credit' THEN l.amount
          WHEN l.entry_type='refund' THEN -l.amount
          WHEN l.entry_type='debit' THEN 0
          ELSE 0
        END
      )
    ),
    0::bigint
  )
  INTO v_effective
  FROM core.users u
  JOIN core.wallets w ON w.user_id=u.id
  JOIN core.wallet_ledgers l ON l.wallet_id=w.id
  WHERE u.auth_user_id=p_auth_user_id
    AND l.currency_type='paid_crystal';

  RETURN COALESCE(v_effective,0);
END;
$paid$;

REVOKE ALL ON FUNCTION public.farm_v1_effective_paid_crystals(uuid)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_effective_paid_crystals(uuid)
TO service_role;

COMMIT;
