-- ISOLATED TEST ONLY. Partial catalog extract, not a production migration.
-- Requires auth.users. RLS, grants and triggers not yet included.
CREATE TABLE public.core_wallet_ledger (id uuid DEFAULT gen_random_uuid() NOT NULL, wallet_id uuid NOT NULL, owner_id uuid NOT NULL, amount integer NOT NULL, currency text NOT NULL, direction text NOT NULL, idempotency_key text NOT NULL, reason text NOT NULL, reference_id text NOT NULL, reference_type text NOT NULL, reversal_of uuid, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.core_wallets (id uuid DEFAULT gen_random_uuid() NOT NULL, owner_id uuid NOT NULL, coin_balance integer DEFAULT 0 NOT NULL, crystal_balance integer DEFAULT 0 NOT NULL, destiny_ticket_balance integer DEFAULT 0 NOT NULL, status text DEFAULT 'active'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE public.farm_v2_atomic_pot_receipts (user_id uuid NOT NULL, request_id text NOT NULL, transaction_id uuid NOT NULL, command jsonb NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

ALTER TABLE public.core_wallet_ledger ADD CONSTRAINT core_wallet_ledger_amount_check CHECK ((amount > 0));

ALTER TABLE public.core_wallet_ledger ADD CONSTRAINT core_wallet_ledger_currency_check CHECK ((currency = ANY (ARRAY['coin'::text, 'crystal'::text, 'destiny_ticket'::text])));

ALTER TABLE public.core_wallet_ledger ADD CONSTRAINT core_wallet_ledger_direction_check CHECK ((direction = ANY (ARRAY['credit'::text, 'debit'::text])));

ALTER TABLE public.core_wallet_ledger ADD CONSTRAINT core_wallet_ledger_owner_id_idempotency_key_key UNIQUE (owner_id, idempotency_key);

ALTER TABLE public.core_wallet_ledger ADD CONSTRAINT core_wallet_ledger_pkey PRIMARY KEY (id);

ALTER TABLE public.core_wallets ADD CONSTRAINT core_wallets_coin_balance_check CHECK ((coin_balance >= 0));

ALTER TABLE public.core_wallets ADD CONSTRAINT core_wallets_crystal_balance_check CHECK ((crystal_balance >= 0));

ALTER TABLE public.core_wallets ADD CONSTRAINT core_wallets_destiny_ticket_balance_check CHECK ((destiny_ticket_balance >= 0));

ALTER TABLE public.core_wallets ADD CONSTRAINT core_wallets_owner_id_key UNIQUE (owner_id);

ALTER TABLE public.core_wallets ADD CONSTRAINT core_wallets_pkey PRIMARY KEY (id);

ALTER TABLE public.core_wallets ADD CONSTRAINT core_wallets_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text])));

ALTER TABLE public.farm_v2_atomic_pot_receipts ADD CONSTRAINT farm_v2_atomic_pot_receipts_command_check CHECK ((jsonb_typeof(command) = 'object'::text));

ALTER TABLE public.farm_v2_atomic_pot_receipts ADD CONSTRAINT farm_v2_atomic_pot_receipts_pkey PRIMARY KEY (user_id, request_id);

ALTER TABLE public.farm_v2_atomic_pot_receipts ADD CONSTRAINT farm_v2_atomic_pot_receipts_transaction_id_key UNIQUE (transaction_id);

ALTER TABLE public.core_wallet_ledger ADD CONSTRAINT core_wallet_ledger_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.core_wallet_ledger ADD CONSTRAINT core_wallet_ledger_reversal_of_fkey FOREIGN KEY (reversal_of) REFERENCES core_wallet_ledger(id) ON DELETE RESTRICT;

ALTER TABLE public.core_wallet_ledger ADD CONSTRAINT core_wallet_ledger_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES core_wallets(id) ON DELETE RESTRICT;

ALTER TABLE public.core_wallets ADD CONSTRAINT core_wallets_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.farm_v2_atomic_pot_receipts ADD CONSTRAINT farm_v2_atomic_pot_receipts_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES core_wallet_ledger(id);

ALTER TABLE public.farm_v2_atomic_pot_receipts ADD CONSTRAINT farm_v2_atomic_pot_receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

CREATE INDEX core_wallet_ledger_owner_created_at_idx ON public.core_wallet_ledger USING btree (owner_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.core_wallet_apply_transaction(p_owner_id uuid, p_amount integer, p_currency text, p_direction text, p_idempotency_key text, p_reason text, p_reference_id text, p_reference_type text, p_reversal_of uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$
;

CREATE OR REPLACE FUNCTION public.core_wallet_find_transaction(p_owner_id uuid, p_transaction_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT to_jsonb(entry) FROM public.core_wallet_ledger entry WHERE entry.owner_id = p_owner_id AND entry.id = p_transaction_id;
$function$
;

CREATE OR REPLACE FUNCTION public.core_wallet_get_or_create(p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END; $function$
;

CREATE OR REPLACE FUNCTION public.core_wallet_list_transactions(p_owner_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(entry) ORDER BY entry.created_at DESC), '[]'::jsonb)
  FROM public.core_wallet_ledger entry WHERE entry.owner_id = p_owner_id;
$function$
;

CREATE OR REPLACE FUNCTION public.farm_v2_atomic_pot_receipt_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_TABLE_NAME='farm_v2_atomic_pot_receipts' THEN RAISE EXCEPTION 'FARM_ATOMIC_RECEIPT_IMMUTABLE'; END IF;
 -- Legacy Saga compensation must never reverse just the wallet half of an
 -- atomic settlement. Inspection and legacy compensation remain unchanged.
 IF NEW.reversal_of IS NOT NULL AND EXISTS(SELECT 1 FROM public.farm_v2_atomic_pot_receipts WHERE transaction_id=NEW.reversal_of) THEN RAISE EXCEPTION 'FARM_ATOMIC_COMPENSATION_NOT_ALLOWED'; END IF;
 RETURN NEW;
END;
$function$
;
