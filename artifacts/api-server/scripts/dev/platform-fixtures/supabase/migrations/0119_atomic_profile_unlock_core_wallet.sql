BEGIN;

ALTER TABLE public.profile_unlocks
  ADD COLUMN IF NOT EXISTS core_wallet_transaction_id uuid
  REFERENCES public.core_wallet_ledger(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profile_unlocks_core_wallet_transaction_idx
  ON public.profile_unlocks (core_wallet_transaction_id)
  WHERE core_wallet_transaction_id IS NOT NULL;

INSERT INTO public.ref_apps (
  app_id, display_name, category, supports_profile, supports_unlock,
  supports_gold, supports_crystal, sort_order, is_active
)
VALUES ('ziwei', '紫宸天策', 'ziwei', true, true, true, true, 40, true)
ON CONFLICT (app_id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  supports_profile = true,
  supports_unlock = true,
  supports_gold = true,
  supports_crystal = true,
  is_active = true,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.purchase_profile_unlock_with_core_wallet(
  p_owner_id uuid,
  p_subject_profile_id uuid,
  p_app_id text,
  p_unlock_key text,
  p_unlock_name text,
  p_currency text,
  p_amount integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.profile_unlocks;
  v_wallet_result jsonb;
  v_wallet_status text;
  v_wallet_transaction_id uuid;
  v_unlock public.profile_unlocks;
  v_cost_currency text;
BEGIN
  IF p_owner_id IS NULL
    OR p_subject_profile_id IS NULL
    OR NULLIF(btrim(p_app_id), '') IS NULL
    OR NULLIF(btrim(p_unlock_key), '') IS NULL
    OR NULLIF(btrim(p_unlock_name), '') IS NULL
    OR p_currency NOT IN ('coin', 'crystal')
    OR p_amount <= 0
    OR NULLIF(btrim(p_idempotency_key), '') IS NULL THEN
    RETURN jsonb_build_object('result_status', 'invalid_request');
  END IF;

  PERFORM 1
  FROM public.subject_profiles sp
  WHERE sp.id = p_subject_profile_id
    AND sp.user_id = p_owner_id
    AND sp.is_archived = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('result_status', 'subject_profile_not_found');
  END IF;

  SELECT pu.*
    INTO v_existing
  FROM public.profile_unlocks pu
  WHERE pu.user_id = p_owner_id
    AND pu.subject_profile_id = p_subject_profile_id
    AND pu.app_id = p_app_id
    AND pu.unlock_key = p_unlock_key
    AND pu.expires_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'result_status', 'already_unlocked',
      'unlock_id', v_existing.id,
      'wallet_transaction_id', v_existing.core_wallet_transaction_id
    );
  END IF;

  v_wallet_result := public.core_wallet_apply_transaction(
    p_owner_id,
    p_amount,
    p_currency,
    'debit',
    p_idempotency_key,
    'profile_unlock',
    p_subject_profile_id::text,
    p_app_id || ':' || p_unlock_key,
    NULL
  );

  v_wallet_status := v_wallet_result->>'result_status';

  IF v_wallet_status = 'insufficient_funds' THEN
    RETURN jsonb_build_object('result_status', 'insufficient_funds');
  END IF;

  IF v_wallet_status = 'duplicate_conflict' THEN
    RETURN jsonb_build_object('result_status', 'duplicate_conflict');
  END IF;

  IF v_wallet_status NOT IN ('created', 'duplicate') THEN
    RAISE EXCEPTION 'Unexpected core wallet result: %', COALESCE(v_wallet_status, '<null>');
  END IF;

  v_wallet_transaction_id := NULLIF(v_wallet_result->'transaction'->>'id', '')::uuid;
  IF v_wallet_transaction_id IS NULL THEN
    RAISE EXCEPTION 'Core wallet transaction id missing';
  END IF;

  v_cost_currency := CASE p_currency WHEN 'coin' THEN 'gold' ELSE 'crystal' END;

  INSERT INTO public.profile_unlocks(
    user_id,
    subject_profile_id,
    app_id,
    unlock_key,
    unlock_name,
    cost_currency,
    cost_amount,
    transaction_id,
    core_wallet_transaction_id,
    expires_at
  ) VALUES (
    p_owner_id,
    p_subject_profile_id,
    p_app_id,
    p_unlock_key,
    p_unlock_name,
    v_cost_currency,
    p_amount,
    NULL,
    v_wallet_transaction_id,
    NULL
  )
  RETURNING * INTO v_unlock;

  RETURN jsonb_build_object(
    'result_status', 'created',
    'unlock_id', v_unlock.id,
    'wallet_transaction_id', v_wallet_transaction_id,
    'cost_currency', v_cost_currency,
    'cost_amount', p_amount
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT pu.*
      INTO v_existing
    FROM public.profile_unlocks pu
    WHERE pu.user_id = p_owner_id
      AND pu.subject_profile_id = p_subject_profile_id
      AND pu.app_id = p_app_id
      AND pu.unlock_key = p_unlock_key
      AND pu.expires_at IS NULL
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'result_status', 'already_unlocked',
        'unlock_id', v_existing.id,
        'wallet_transaction_id', v_existing.core_wallet_transaction_id
      );
    END IF;

    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_profile_unlock_with_core_wallet(uuid, uuid, text, text, text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purchase_profile_unlock_with_core_wallet(uuid, uuid, text, text, text, text, integer, text)
  TO service_role;

COMMIT;
