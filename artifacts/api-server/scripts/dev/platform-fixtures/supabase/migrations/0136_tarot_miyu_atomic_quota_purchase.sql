-- Tarot Miyu V1: atomic crystal purchase and consumable quota grant.
-- Development candidate only. Do not apply to production without separate authorization.
BEGIN;

CREATE TABLE IF NOT EXISTS public.tarot_miyu_quota_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_request_id uuid NOT NULL,
  plan_code text NOT NULL CHECK (plan_code IN ('question_5', 'category_20')),
  scope_id text NOT NULL,
  granted_uses integer NOT NULL CHECK (granted_uses IN (5, 20)),
  consumed_uses integer NOT NULL DEFAULT 0 CHECK (consumed_uses >= 0 AND consumed_uses <= granted_uses),
  price_crystal integer NOT NULL CHECK (price_crystal IN (3, 12)),
  wallet_transaction_id uuid NOT NULL REFERENCES public.core_wallet_ledger(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, purchase_request_id),
  UNIQUE (wallet_transaction_id),
  CONSTRAINT tarot_quota_plan_consistency CHECK (
    (plan_code = 'question_5' AND granted_uses = 5 AND price_crystal = 3
      AND scope_id ~ '^(0[1-9]|[1-5][0-9]|60)$')
    OR
    (plan_code = 'category_20' AND granted_uses = 20 AND price_crystal = 12
      AND scope_id ~ '^(0[1-9]|10)$')
  )
);

CREATE INDEX IF NOT EXISTS tarot_miyu_quota_grants_owner_scope_idx
  ON public.tarot_miyu_quota_grants (owner_id, plan_code, scope_id, created_at);

ALTER TABLE public.tarot_miyu_quota_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tarot_miyu_quota_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tarot_miyu_quota_grants TO authenticated;
DROP POLICY IF EXISTS tarot_miyu_quota_owner_read ON public.tarot_miyu_quota_grants;
CREATE POLICY tarot_miyu_quota_owner_read ON public.tarot_miyu_quota_grants
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);

CREATE OR REPLACE FUNCTION public.tarot_miyu_purchase_quota(
  p_owner_id uuid,
  p_purchase_request_id uuid,
  p_plan_code text,
  p_scope_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_price integer;
  v_uses integer;
  v_existing public.tarot_miyu_quota_grants%ROWTYPE;
  v_wallet jsonb;
  v_wallet_status text;
  v_wallet_transaction_id uuid;
  v_grant public.tarot_miyu_quota_grants%ROWTYPE;
  v_wallet_status_current text;
BEGIN
  IF p_owner_id IS NULL OR p_purchase_request_id IS NULL
    OR p_plan_code IS NULL OR p_scope_id IS NULL THEN
    RETURN jsonb_build_object('result_status', 'invalid_request');
  END IF;

  IF p_plan_code = 'question_5' AND p_scope_id ~ '^(0[1-9]|[1-5][0-9]|60)$' THEN
    v_price := 3; v_uses := 5;
  ELSIF p_plan_code = 'category_20' AND p_scope_id ~ '^(0[1-9]|10)$' THEN
    v_price := 12; v_uses := 20;
  ELSE
    RETURN jsonb_build_object('result_status', 'invalid_plan_or_scope');
  END IF;

  -- Serialize this owner's request retries before touching the wallet.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tarot_miyu_purchase:' || p_owner_id::text || ':' || p_purchase_request_id::text, 0
  ));

  SELECT * INTO v_existing
  FROM public.tarot_miyu_quota_grants
  WHERE owner_id = p_owner_id AND purchase_request_id = p_purchase_request_id;

  IF FOUND THEN
    IF v_existing.plan_code <> p_plan_code OR v_existing.scope_id <> p_scope_id THEN
      RETURN jsonb_build_object('result_status', 'idempotency_conflict');
    END IF;
    RETURN jsonb_build_object(
      'result_status', 'duplicate', 'grant_id', v_existing.id,
      'wallet_transaction_id', v_existing.wallet_transaction_id,
      'granted_uses', v_existing.granted_uses,
      'remaining_uses', v_existing.granted_uses - v_existing.consumed_uses
    );
  END IF;

  -- Lock the wallet row before checking status, so suspension and debit
  -- cannot race past each other. The wallet RPC takes the same row lock.
  PERFORM public.core_wallet_get_or_create(p_owner_id);
  SELECT status INTO v_wallet_status_current
  FROM public.core_wallets WHERE owner_id = p_owner_id FOR UPDATE;
  IF v_wallet_status_current IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('result_status', 'wallet_not_active');
  END IF;

  v_wallet := public.core_wallet_apply_transaction(
    p_owner_id, v_price, 'crystal', 'debit',
    'tarot-miyu-quota:' || p_owner_id::text || ':' || p_purchase_request_id::text,
    '塔羅秘語深度解析額度', p_purchase_request_id::text, 'tarot_miyu_quota_purchase', NULL
  );
  v_wallet_status := v_wallet->>'result_status';

  IF v_wallet_status = 'insufficient_funds' THEN
    RETURN jsonb_build_object('result_status', 'insufficient_funds');
  END IF;
  IF v_wallet_status <> 'created' THEN
    -- A duplicate wallet debit without a matching grant must never be treated as success.
    RAISE EXCEPTION 'TAROT_WALLET_GRANT_INCONSISTENT: %', v_wallet_status;
  END IF;

  v_wallet_transaction_id := NULLIF(v_wallet->'transaction'->>'id', '')::uuid;
  IF v_wallet_transaction_id IS NULL THEN
    RAISE EXCEPTION 'TAROT_WALLET_TRANSACTION_MISSING';
  END IF;

  INSERT INTO public.tarot_miyu_quota_grants (
    owner_id, purchase_request_id, plan_code, scope_id,
    granted_uses, price_crystal, wallet_transaction_id
  ) VALUES (
    p_owner_id, p_purchase_request_id, p_plan_code, p_scope_id,
    v_uses, v_price, v_wallet_transaction_id
  ) RETURNING * INTO v_grant;

  RETURN jsonb_build_object(
    'result_status', 'created', 'grant_id', v_grant.id,
    'wallet_transaction_id', v_wallet_transaction_id,
    'granted_uses', v_uses, 'remaining_uses', v_uses,
    'price_crystal', v_price
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tarot_miyu_purchase_quota(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tarot_miyu_purchase_quota(uuid, uuid, text, text)
  TO service_role;
COMMIT;
