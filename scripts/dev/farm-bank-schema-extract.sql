-- Isolated test reference only; do not apply over existing farm migrations.
-- Requires auth.users and public.core_wallet_ledger. ACL/RLS not included.
CREATE SCHEMA IF NOT EXISTS farm_v2_bank;
CREATE TABLE farm_v2_bank.ledger (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, request_key text NOT NULL, amount integer NOT NULL, direction text NOT NULL, reason text NOT NULL, reference text NOT NULL, central_transaction_id uuid, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE farm_v2_bank.wallets (user_id uuid NOT NULL, balance integer DEFAULT 0 NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL);

ALTER TABLE farm_v2_bank.ledger ADD CONSTRAINT ledger_amount_check CHECK ((amount > 0));

ALTER TABLE farm_v2_bank.ledger ADD CONSTRAINT ledger_direction_check CHECK ((direction = ANY (ARRAY['credit'::text, 'debit'::text])));

ALTER TABLE farm_v2_bank.ledger ADD CONSTRAINT ledger_pkey PRIMARY KEY (id);

ALTER TABLE farm_v2_bank.ledger ADD CONSTRAINT ledger_user_id_request_key_key UNIQUE (user_id, request_key);

ALTER TABLE farm_v2_bank.wallets ADD CONSTRAINT wallets_balance_check CHECK ((balance >= 0));

ALTER TABLE farm_v2_bank.wallets ADD CONSTRAINT wallets_pkey PRIMARY KEY (user_id);

ALTER TABLE farm_v2_bank.ledger ADD CONSTRAINT ledger_central_transaction_id_fkey FOREIGN KEY (central_transaction_id) REFERENCES core_wallet_ledger(id);

ALTER TABLE farm_v2_bank.ledger ADD CONSTRAINT ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES farm_v2_bank.wallets(user_id);

ALTER TABLE farm_v2_bank.wallets ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION farm_v2_bank.immutable_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN RAISE EXCEPTION 'FARM_COIN_LEDGER_IMMUTABLE'; END; $function$
;

CREATE OR REPLACE FUNCTION farm_v2_bank.post_coin(p_user uuid, p_request text, p_amount integer, p_direction text, p_reason text, p_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE w farm_v2_bank.wallets; e farm_v2_bank.ledger;
BEGIN
 IF p_user IS NULL OR p_request IS NULL OR p_request !~ '^[A-Za-z0-9._:-]{1,120}$' OR p_amount IS NULL OR p_amount<=0
 OR p_direction IS NULL OR p_direction NOT IN ('credit','debit') OR p_reference IS NULL OR p_reason IS NULL
 OR NOT ((p_direction='debit' AND p_reason IN ('farm_seed_purchase','farm_pot_synthesis','farm_decor_purchase','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase','farm_v2_land_unlock'))
 OR (p_direction='credit' AND p_reason IN ('farm_crop_exchange','farm_mission_reward'))) THEN
 RAISE EXCEPTION 'INVALID_FARM_WALLET_OPERATION'; END IF;
 INSERT INTO farm_v2_bank.wallets(user_id) VALUES(p_user) ON CONFLICT DO NOTHING;
 SELECT * INTO w FROM farm_v2_bank.wallets WHERE user_id=p_user FOR UPDATE;
 SELECT * INTO e FROM farm_v2_bank.ledger WHERE user_id=p_user AND request_key='op:'||p_request;
 IF FOUND THEN
  IF (e.amount,e.direction,e.reason,e.reference) IS DISTINCT FROM (p_amount,p_direction,p_reason,p_reference) THEN RAISE EXCEPTION 'FARM_WALLET_INTENT_MISMATCH'; END IF;
  RETURN jsonb_build_object('id',e.id,'duplicate',true,'coins',w.balance);
 END IF;
 IF p_direction='debit' AND w.balance<p_amount THEN RAISE EXCEPTION 'FARM_COIN_INSUFFICIENT'; END IF;
 UPDATE farm_v2_bank.wallets SET balance=balance+CASE WHEN p_direction='credit' THEN p_amount ELSE -p_amount END,updated_at=now() WHERE user_id=p_user RETURNING * INTO w;
 INSERT INTO farm_v2_bank.ledger(user_id,request_key,amount,direction,reason,reference) VALUES(p_user,'op:'||p_request,p_amount,p_direction,p_reason,p_reference) RETURNING * INTO e;
 RETURN jsonb_build_object('id',e.id,'duplicate',false,'coins',w.balance);
END; $function$
;

CREATE OR REPLACE FUNCTION farm_v2_bank.read_balances(p_user uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT jsonb_build_object('coins',coalesce((SELECT balance FROM farm_v2_bank.wallets WHERE user_id=p_user),0),
 'centralCoins',coalesce((SELECT coin_balance FROM public.core_wallets WHERE owner_id=p_user),0), 'localCoinsEnabled',true);
$function$
;

CREATE TRIGGER immutable_ledger BEFORE DELETE OR UPDATE ON farm_v2_bank.ledger FOR EACH ROW EXECUTE FUNCTION farm_v2_bank.immutable_ledger();
