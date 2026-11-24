-- Isolated test reference only. Requires core.users(id).
-- RLS, ACL and triggers not included. Not a production migration.
CREATE SCHEMA IF NOT EXISTS core;
CREATE TABLE core.wallet_ledgers (id uuid DEFAULT gen_random_uuid() NOT NULL, wallet_id uuid NOT NULL, currency_type text NOT NULL, entry_type text NOT NULL, amount bigint NOT NULL, reference_type text NOT NULL, reference_id uuid, idempotency_key text NOT NULL, description text, occurred_at timestamp with time zone DEFAULT now() NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL);

CREATE TABLE core.wallets (id uuid DEFAULT gen_random_uuid() NOT NULL, user_id uuid NOT NULL, status text DEFAULT 'active'::text NOT NULL, created_at timestamp with time zone DEFAULT now() NOT NULL, updated_at timestamp with time zone DEFAULT now() NOT NULL, closed_at timestamp with time zone);

ALTER TABLE core.wallet_ledgers ADD CONSTRAINT wallet_ledgers_amount_check CHECK ((amount > 0));

ALTER TABLE core.wallet_ledgers ADD CONSTRAINT wallet_ledgers_currency_type_check CHECK ((currency_type = ANY (ARRAY['gold'::text, 'paid_crystal'::text, 'gifted_crystal'::text, 'farm_bound_crystal'::text])));

ALTER TABLE core.wallet_ledgers ADD CONSTRAINT wallet_ledgers_entry_type_check CHECK ((entry_type = ANY (ARRAY['credit'::text, 'debit'::text, 'refund'::text, 'adjustment'::text])));

ALTER TABLE core.wallet_ledgers ADD CONSTRAINT wallet_ledgers_idempotency_key_check CHECK ((btrim(idempotency_key) <> ''::text));

ALTER TABLE core.wallet_ledgers ADD CONSTRAINT wallet_ledgers_idempotency_key_key UNIQUE (idempotency_key);

ALTER TABLE core.wallet_ledgers ADD CONSTRAINT wallet_ledgers_pkey PRIMARY KEY (id);

ALTER TABLE core.wallet_ledgers ADD CONSTRAINT wallet_ledgers_reference_type_check CHECK (((btrim(reference_type) <> ''::text) AND (lower(btrim(reference_type)) <> 'secret'::text) AND (lower(btrim(reference_type)) <> 'token'::text) AND (lower(btrim(reference_type)) <> 'payment_credential'::text)));

ALTER TABLE core.wallets ADD CONSTRAINT wallets_closed_at_status_check CHECK ((((status = 'closed'::text) AND (closed_at IS NOT NULL)) OR ((status <> 'closed'::text) AND (closed_at IS NULL))));

ALTER TABLE core.wallets ADD CONSTRAINT wallets_pkey PRIMARY KEY (id);

ALTER TABLE core.wallets ADD CONSTRAINT wallets_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'closed'::text])));

ALTER TABLE core.wallets ADD CONSTRAINT wallets_user_id_key UNIQUE (user_id);

ALTER TABLE core.wallet_ledgers ADD CONSTRAINT wallet_ledgers_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES core.wallets(id) ON DELETE RESTRICT;

ALTER TABLE core.wallets ADD CONSTRAINT wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE RESTRICT;

CREATE INDEX wallet_ledgers_currency_type_idx ON core.wallet_ledgers USING btree (currency_type);

CREATE INDEX wallet_ledgers_entry_type_idx ON core.wallet_ledgers USING btree (entry_type);

CREATE INDEX wallet_ledgers_occurred_at_idx ON core.wallet_ledgers USING btree (occurred_at);

CREATE INDEX wallet_ledgers_wallet_currency_occurred_at_idx ON core.wallet_ledgers USING btree (wallet_id, currency_type, occurred_at);

CREATE INDEX wallet_ledgers_wallet_id_idx ON core.wallet_ledgers USING btree (wallet_id);

CREATE INDEX wallets_status_idx ON core.wallets USING btree (status);
