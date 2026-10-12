BEGIN;

CREATE TABLE IF NOT EXISTS public.core_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  coin_balance integer NOT NULL DEFAULT 0 CHECK (coin_balance >= 0),
  crystal_balance integer NOT NULL DEFAULT 0 CHECK (crystal_balance >= 0),
  destiny_ticket_balance integer NOT NULL DEFAULT 0 CHECK (destiny_ticket_balance >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.core_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES public.core_wallets(id) ON DELETE RESTRICT,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency IN ('coin', 'crystal', 'destiny_ticket')),
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  idempotency_key text NOT NULL,
  reason text NOT NULL,
  reference_id text NOT NULL,
  reference_type text NOT NULL,
  reversal_of uuid REFERENCES public.core_wallet_ledger(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS core_wallet_ledger_owner_created_at_idx
  ON public.core_wallet_ledger (owner_id, created_at DESC);

ALTER TABLE public.core_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.core_wallet_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.core_wallets, public.core_wallet_ledger FROM anon, authenticated;
GRANT SELECT ON TABLE public.core_wallets, public.core_wallet_ledger TO authenticated;

CREATE POLICY core_wallets_owner_select ON public.core_wallets
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY core_wallet_ledger_owner_select ON public.core_wallet_ledger
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);

CREATE OR REPLACE FUNCTION public.core_wallet_get_or_create(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_wallet public.core_wallets;
BEGIN
  INSERT INTO public.core_wallets(owner_id) VALUES (p_owner_id)
  ON CONFLICT (owner_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.core_wallets WHERE owner_id = p_owner_id;
  RETURN jsonb_build_object(
    'wallet_id', v_wallet.id, 'owner_id', v_wallet.owner_id,
    'coin_balance', v_wallet.coin_balance, 'crystal_balance', v_wallet.crystal_balance,
    'destiny_ticket_balance', v_wallet.destiny_ticket_balance, 'status', v_wallet.status,
    'created_at', v_wallet.created_at, 'updated_at', v_wallet.updated_at
  );
END; $$;

CREATE OR REPLACE FUNCTION public.core_wallet_apply_transaction(
  p_owner_id uuid, p_amount integer, p_currency text, p_direction text,
  p_idempotency_key text, p_reason text, p_reference_id text,
  p_reference_type text, p_reversal_of uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_wallet public.core_wallets; v_entry public.core_wallet_ledger; v_balance integer;
BEGIN
  IF p_owner_id IS NULL OR p_amount <= 0 OR p_currency NOT IN ('coin','crystal','destiny_ticket')
    OR p_direction NOT IN ('credit','debit') OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Invalid core wallet transaction';
  END IF;
  PERFORM public.core_wallet_get_or_create(p_owner_id);
  SELECT * INTO v_entry FROM public.core_wallet_ledger WHERE owner_id = p_owner_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_entry.amount <> p_amount OR v_entry.currency <> p_currency OR v_entry.direction <> p_direction
      OR v_entry.reason <> p_reason OR v_entry.reference_id <> p_reference_id OR v_entry.reference_type <> p_reference_type THEN
      RETURN jsonb_build_object('result_status','duplicate_conflict');
    END IF;
    SELECT * INTO v_wallet FROM public.core_wallets WHERE owner_id = p_owner_id;
    RETURN jsonb_build_object('result_status','duplicate','wallet', public.core_wallet_get_or_create(p_owner_id), 'transaction', to_jsonb(v_entry));
  END IF;
  SELECT * INTO v_wallet FROM public.core_wallets WHERE owner_id = p_owner_id FOR UPDATE;
  v_balance := CASE p_currency WHEN 'coin' THEN v_wallet.coin_balance WHEN 'crystal' THEN v_wallet.crystal_balance ELSE v_wallet.destiny_ticket_balance END;
  IF p_direction = 'debit' AND v_balance < p_amount THEN RETURN jsonb_build_object('result_status','insufficient_funds'); END IF;
  UPDATE public.core_wallets SET
    coin_balance = coin_balance + CASE WHEN p_currency = 'coin' THEN CASE WHEN p_direction = 'credit' THEN p_amount ELSE -p_amount END ELSE 0 END,
    crystal_balance = crystal_balance + CASE WHEN p_currency = 'crystal' THEN CASE WHEN p_direction = 'credit' THEN p_amount ELSE -p_amount END ELSE 0 END,
    destiny_ticket_balance = destiny_ticket_balance + CASE WHEN p_currency = 'destiny_ticket' THEN CASE WHEN p_direction = 'credit' THEN p_amount ELSE -p_amount END ELSE 0 END,
    updated_at = now()
  WHERE id = v_wallet.id RETURNING * INTO v_wallet;
  INSERT INTO public.core_wallet_ledger(wallet_id, owner_id, amount, currency, direction, idempotency_key, reason, reference_id, reference_type, reversal_of)
  VALUES (v_wallet.id, p_owner_id, p_amount, p_currency, p_direction, p_idempotency_key, p_reason, p_reference_id, p_reference_type, p_reversal_of)
  RETURNING * INTO v_entry;
  RETURN jsonb_build_object('result_status','created','wallet', public.core_wallet_get_or_create(p_owner_id), 'transaction', to_jsonb(v_entry));
END; $$;

CREATE OR REPLACE FUNCTION public.core_wallet_find_transaction(p_owner_id uuid, p_transaction_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT to_jsonb(entry) FROM public.core_wallet_ledger entry WHERE entry.owner_id = p_owner_id AND entry.id = p_transaction_id;
$$;

CREATE OR REPLACE FUNCTION public.core_wallet_list_transactions(p_owner_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jsonb_agg(to_jsonb(entry) ORDER BY entry.created_at DESC), '[]'::jsonb)
  FROM public.core_wallet_ledger entry WHERE entry.owner_id = p_owner_id;
$$;

REVOKE ALL ON FUNCTION public.core_wallet_get_or_create(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.core_wallet_apply_transaction(uuid, integer, text, text, text, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.core_wallet_find_transaction(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.core_wallet_list_transactions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.core_wallet_get_or_create(uuid), public.core_wallet_apply_transaction(uuid, integer, text, text, text, text, text, text, uuid), public.core_wallet_find_transaction(uuid, uuid), public.core_wallet_list_transactions(uuid) TO service_role;

COMMIT;
