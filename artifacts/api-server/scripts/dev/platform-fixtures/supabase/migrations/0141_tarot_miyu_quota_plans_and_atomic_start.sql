BEGIN;
-- Tarot Miyu: approved plan catalogue, category taxonomy, and one atomic
-- "confirm quota, then draw" transaction.
--
-- Approved plans: subcategory_5 (6 crystals / 5 uses), major_20 (18/20),
-- all_40 (30/40). Legacy question_5 (3/5) and category_20 (12/20) stop being
-- sold in 0142, once the new client is live. This migration still sells them
-- so the deployed build keeps working between the schema change and the
-- frontend switch.
CREATE TABLE IF NOT EXISTS public.tarot_miyu_majors (
  id text PRIMARY KEY CHECK (id ~ '^M0[1-3]$'),
  name text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.tarot_miyu_subcategories (
  id text PRIMARY KEY CHECK (id ~ '^(0[1-9]|10)$'),
  name text NOT NULL,
  major_id text NOT NULL REFERENCES public.tarot_miyu_majors(id)
);

INSERT INTO public.tarot_miyu_majors (id, name) VALUES
  ('M01', '情感與人際'),
  ('M02', '事業與財富'),
  ('M03', '人生與成長')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.tarot_miyu_subcategories (id, name, major_id) VALUES
  ('01', '愛情與伴侶', 'M01'),
  ('02', '曖昧與新戀情', 'M01'),
  ('06', '家庭與親情', 'M01'),
  ('07', '友誼與人際', 'M01'),
  ('03', '工作與職涯', 'M02'),
  ('04', '創業與新計畫', 'M02'),
  ('05', '金錢與財務', 'M02'),
  ('08', '人生抉擇', 'M03'),
  ('09', '學習與成長', 'M03'),
  ('10', '未來方向與機會', 'M03')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, major_id = EXCLUDED.major_id;

ALTER TABLE public.tarot_miyu_majors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tarot_miyu_majors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tarot_miyu_majors TO authenticated;
DROP POLICY IF EXISTS tarot_miyu_majors_read ON public.tarot_miyu_majors;
CREATE POLICY tarot_miyu_majors_read ON public.tarot_miyu_majors
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.tarot_miyu_subcategories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tarot_miyu_subcategories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tarot_miyu_subcategories TO authenticated;
DROP POLICY IF EXISTS tarot_miyu_subcategories_read ON public.tarot_miyu_subcategories;
CREATE POLICY tarot_miyu_subcategories_read ON public.tarot_miyu_subcategories
  FOR SELECT TO authenticated USING (true);

-- Widen the plan constraints. Existing rows keep satisfying them because the
-- legacy branches are unchanged.
ALTER TABLE public.tarot_miyu_quota_grants
  DROP CONSTRAINT IF EXISTS tarot_miyu_quota_grants_plan_code_check,
  DROP CONSTRAINT IF EXISTS tarot_miyu_quota_grants_granted_uses_check,
  DROP CONSTRAINT IF EXISTS tarot_miyu_quota_grants_price_crystal_check,
  DROP CONSTRAINT IF EXISTS tarot_quota_plan_consistency;

ALTER TABLE public.tarot_miyu_quota_grants
  ADD CONSTRAINT tarot_miyu_quota_grants_plan_code_check CHECK (
    plan_code IN ('question_5', 'category_20', 'subcategory_5', 'major_20', 'all_40')
  ),
  ADD CONSTRAINT tarot_miyu_quota_grants_granted_uses_check CHECK (
    granted_uses IN (5, 20, 40)
  ),
  ADD CONSTRAINT tarot_miyu_quota_grants_price_crystal_check CHECK (
    price_crystal IN (3, 6, 12, 18, 30)
  ),
  ADD CONSTRAINT tarot_quota_plan_consistency CHECK (
    (plan_code = 'question_5' AND granted_uses = 5 AND price_crystal = 3
      AND scope_id ~ '^(0[1-9]|[1-5][0-9]|60)$')
    OR (plan_code = 'category_20' AND granted_uses = 20 AND price_crystal = 12
      AND scope_id ~ '^(0[1-9]|10)$')
    OR (plan_code = 'subcategory_5' AND granted_uses = 5 AND price_crystal = 6
      AND scope_id ~ '^(0[1-9]|10)$')
    OR (plan_code = 'major_20' AND granted_uses = 20 AND price_crystal = 18
      AND scope_id ~ '^M0[1-3]$')
    OR (plan_code = 'all_40' AND granted_uses = 40 AND price_crystal = 30
      AND scope_id = 'all')
  );

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

  -- Serialize this owner's request retries before touching the wallet.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tarot_miyu_purchase:' || p_owner_id::text || ':' || p_purchase_request_id::text, 0
  ));

  -- Retries resolve before plan validation, so a request recorded under a plan
  -- that later stops being sold still returns the same grant instead of an error.
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

  IF p_plan_code = 'subcategory_5'
     AND EXISTS (SELECT 1 FROM public.tarot_miyu_subcategories WHERE id = p_scope_id) THEN
    v_price := 6; v_uses := 5;
  ELSIF p_plan_code = 'major_20'
     AND EXISTS (SELECT 1 FROM public.tarot_miyu_majors WHERE id = p_scope_id) THEN
    v_price := 18; v_uses := 20;
  ELSIF p_plan_code = 'all_40' AND p_scope_id = 'all' THEN
    v_price := 30; v_uses := 40;
  ELSIF p_plan_code = 'question_5'
     AND p_scope_id ~ '^(0[1-9]|[1-5][0-9]|60)$' THEN
    v_price := 3; v_uses := 5;
  ELSIF p_plan_code = 'category_20'
     AND p_scope_id ~ '^(0[1-9]|10)$' THEN
    v_price := 12; v_uses := 20;
  ELSE
    RETURN jsonb_build_object('result_status', 'invalid_plan_or_scope');
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

-- Person snapshot and request identity for the paid draw.
ALTER TABLE public.tarot_miyu_draw_sessions
  ADD COLUMN IF NOT EXISTS reading_request_id uuid,
  ADD COLUMN IF NOT EXISTS grant_id uuid REFERENCES public.tarot_miyu_quota_grants(id),
  ADD COLUMN IF NOT EXISTS major_id text REFERENCES public.tarot_miyu_majors(id),
  ADD COLUMN IF NOT EXISTS person_id uuid,
  ADD COLUMN IF NOT EXISTS person_nickname text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS tarot_miyu_draw_sessions_owner_request_unique
  ON public.tarot_miyu_draw_sessions (owner_id, reading_request_id)
  WHERE reading_request_id IS NOT NULL;

ALTER TABLE public.tarot_miyu_readings
  ADD COLUMN IF NOT EXISTS person_id uuid,
  ADD COLUMN IF NOT EXISTS person_nickname text NOT NULL DEFAULT '';

-- One transaction: consume exactly one use, persist the draw and the reading.
-- Nothing is written when the quota is missing, so a failed draw never costs a use.
DROP FUNCTION IF EXISTS public.tarot_miyu_start_reading(uuid, uuid, text, text, jsonb, jsonb, uuid, text);

CREATE OR REPLACE FUNCTION public.tarot_miyu_start_reading(
  p_owner_id uuid,
  p_reading_request_id uuid,
  p_question_id text,
  p_subcategory_id text,
  p_draws jsonb,
  p_reading jsonb,
  p_person_id uuid,
  p_person_nickname text,
  p_grant_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_major_id text;
  v_existing public.tarot_miyu_draw_sessions%ROWTYPE;
  v_existing_reading public.tarot_miyu_readings%ROWTYPE;
  v_grant public.tarot_miyu_quota_grants%ROWTYPE;
  v_session public.tarot_miyu_draw_sessions%ROWTYPE;
  v_reading public.tarot_miyu_readings%ROWTYPE;
  v_nickname text;
BEGIN
  IF p_owner_id IS NULL OR p_reading_request_id IS NULL
     OR p_question_id IS NULL OR p_question_id !~ '^(0[1-9]|[1-5][0-9]|60)$'
     OR p_subcategory_id IS NULL OR p_subcategory_id !~ '^(0[1-9]|10)$'
     OR p_draws IS NULL OR jsonb_typeof(p_draws) <> 'array'
     OR jsonb_array_length(p_draws) <> 3
     OR p_reading IS NULL OR jsonb_typeof(p_reading) <> 'object' THEN
    RETURN jsonb_build_object('result_status', 'invalid_request');
  END IF;

  v_nickname := left(coalesce(btrim(p_person_nickname), ''), 64);

  SELECT major_id INTO v_major_id
  FROM public.tarot_miyu_subcategories WHERE id = p_subcategory_id;
  IF v_major_id IS NULL THEN
    RETURN jsonb_build_object('result_status', 'invalid_request');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'tarot_miyu_start:' || p_owner_id::text || ':' || p_reading_request_id::text, 0
  ));

  -- Replay of a completed request returns the stored draw and reading.
  SELECT * INTO v_existing FROM public.tarot_miyu_draw_sessions
  WHERE owner_id = p_owner_id AND reading_request_id = p_reading_request_id;
  IF FOUND THEN
    IF v_existing.question_id <> p_question_id
       OR v_existing.category_id <> p_subcategory_id
       OR v_existing.person_id IS DISTINCT FROM p_person_id
       OR (p_grant_id IS NOT NULL AND v_existing.grant_id IS DISTINCT FROM p_grant_id) THEN
      RETURN jsonb_build_object('result_status', 'idempotency_conflict');
    END IF;
    SELECT * INTO v_existing_reading FROM public.tarot_miyu_readings
    WHERE owner_id = p_owner_id AND draw_id = v_existing.id;
    SELECT * INTO v_grant FROM public.tarot_miyu_quota_grants
    WHERE id = v_existing.grant_id;
    RETURN jsonb_build_object(
      'result_status', 'duplicate',
      'draw_id', v_existing.id,
      'question_id', v_existing.question_id,
      'category_id', v_existing.category_id,
      'major_id', v_existing.major_id,
      'draws', v_existing.draws,
      'reading', v_existing_reading.reading,
      'person_id', v_existing.person_id,
      'person_nickname', v_existing.person_nickname,
      'grant_id', v_existing.grant_id,
      'plan_code', v_grant.plan_code,
      'remaining_uses', coalesce(v_grant.granted_uses - v_grant.consumed_uses, 0)
    );
  END IF;

  IF p_grant_id IS NOT NULL THEN
    -- A chosen grant must belong to the reader, cover this question and still
    -- have a use left. Ownership is part of the lookup, so another reader's
    -- grant can never be spent.
    SELECT * INTO v_grant FROM public.tarot_miyu_quota_grants
    WHERE id = p_grant_id AND owner_id = p_owner_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('result_status', 'grant_not_found');
    END IF;
    IF NOT (
      (v_grant.plan_code = 'question_5' AND v_grant.scope_id = p_question_id)
      OR (v_grant.plan_code IN ('category_20', 'subcategory_5') AND v_grant.scope_id = p_subcategory_id)
      OR (v_grant.plan_code = 'major_20' AND v_grant.scope_id = v_major_id)
      OR (v_grant.plan_code = 'all_40' AND v_grant.scope_id = 'all')
    ) THEN
      RETURN jsonb_build_object('result_status', 'grant_scope_mismatch');
    END IF;
    IF v_grant.consumed_uses >= v_grant.granted_uses THEN
      RETURN jsonb_build_object('result_status', 'grant_exhausted');
    END IF;
  ELSE
    -- No grant chosen: spend the narrowest usable grant first (question, then
    -- subcategory, then major, then everything) and the oldest within a tier,
    -- so broad and flexible value is preserved for questions the narrow plans
    -- cannot cover.
    SELECT * INTO v_grant FROM public.tarot_miyu_quota_grants g
    WHERE g.owner_id = p_owner_id
      AND g.consumed_uses < g.granted_uses
      AND (
        (g.plan_code = 'question_5' AND g.scope_id = p_question_id)
        OR (g.plan_code IN ('category_20', 'subcategory_5') AND g.scope_id = p_subcategory_id)
        OR (g.plan_code = 'major_20' AND g.scope_id = v_major_id)
        OR (g.plan_code = 'all_40' AND g.scope_id = 'all')
      )
    ORDER BY CASE g.plan_code
        WHEN 'question_5' THEN 0
        WHEN 'subcategory_5' THEN 1
        WHEN 'category_20' THEN 1
        WHEN 'major_20' THEN 2
        ELSE 3
      END,
      g.created_at, g.id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('result_status', 'quota_required');
    END IF;
  END IF;

  UPDATE public.tarot_miyu_quota_grants
  SET consumed_uses = consumed_uses + 1
  WHERE id = v_grant.id;

  INSERT INTO public.tarot_miyu_draw_sessions (
    owner_id, reading_request_id, grant_id, question_id, category_id, major_id,
    person_id, person_nickname, draws
  ) VALUES (
    p_owner_id, p_reading_request_id, v_grant.id, p_question_id, p_subcategory_id, v_major_id,
    p_person_id, v_nickname, p_draws
  ) RETURNING * INTO v_session;

  INSERT INTO public.tarot_miyu_readings (
    owner_id, reading_request_id, grant_id, question_id, category_id,
    draws, reading, draw_id, person_id, person_nickname
  ) VALUES (
    p_owner_id, p_reading_request_id, v_grant.id, p_question_id, p_subcategory_id,
    p_draws, p_reading, v_session.id, p_person_id, v_nickname
  ) RETURNING * INTO v_reading;

  RETURN jsonb_build_object(
    'result_status', 'created',
    'draw_id', v_session.id,
    'reading_id', v_reading.id,
    'question_id', v_session.question_id,
    'category_id', v_session.category_id,
    'major_id', v_session.major_id,
    'draws', v_session.draws,
    'reading', v_reading.reading,
    'person_id', v_session.person_id,
    'person_nickname', v_session.person_nickname,
    'grant_id', v_grant.id,
    'plan_code', v_grant.plan_code,
    'remaining_uses', v_grant.granted_uses - v_grant.consumed_uses - 1
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tarot_miyu_start_reading(uuid, uuid, text, text, jsonb, jsonb, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tarot_miyu_start_reading(uuid, uuid, text, text, jsonb, jsonb, uuid, text, uuid)
  TO service_role;

COMMIT;
