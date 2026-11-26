BEGIN;

CREATE TABLE IF NOT EXISTS core.wallets (
  id uuid DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT wallets_pkey PRIMARY KEY (id),
  CONSTRAINT wallets_user_id_key UNIQUE (user_id),
  CONSTRAINT wallets_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES core.users(id) ON DELETE RESTRICT,
  CONSTRAINT wallets_status_check
    CHECK (status IN ('active', 'suspended', 'closed')),
  CONSTRAINT wallets_closed_at_status_check
    CHECK (
      (status = 'closed' AND closed_at IS NOT NULL)
      OR
      (status <> 'closed' AND closed_at IS NULL)
    )
);

COMMENT ON TABLE core.wallets IS
'Wallet aggregate root for platform value ownership. Wallet value must be derived from Ledger entries and this table must not store mutable currency totals.';
COMMENT ON COLUMN core.wallets.id IS
'Wallet aggregate UUID.';
COMMENT ON COLUMN core.wallets.user_id IS
'Owning User aggregate reference. V1 allows one Wallet per User.';
COMMENT ON COLUMN core.wallets.status IS
'Wallet status. Allowed values are active, suspended, and closed.';
COMMENT ON COLUMN core.wallets.created_at IS
'Timestamp when the Wallet was created.';
COMMENT ON COLUMN core.wallets.updated_at IS
'Timestamp when the Wallet was last updated.';
COMMENT ON COLUMN core.wallets.closed_at IS
'Timestamp when the Wallet was closed. This may be set only when status is closed.';

CREATE INDEX IF NOT EXISTS wallets_status_idx
  ON core.wallets (status);

CREATE TABLE IF NOT EXISTS core.wallet_ledgers (
  id uuid DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL,
  currency_type text NOT NULL,
  entry_type text NOT NULL,
  amount bigint NOT NULL,
  reference_type text NOT NULL,
  reference_id uuid,
  idempotency_key text NOT NULL,
  description text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_ledgers_pkey PRIMARY KEY (id),
  CONSTRAINT wallet_ledgers_wallet_id_fkey
    FOREIGN KEY (wallet_id) REFERENCES core.wallets(id) ON DELETE RESTRICT,
  CONSTRAINT wallet_ledgers_currency_type_check
    CHECK (currency_type IN ('gold', 'paid_crystal', 'gifted_crystal', 'farm_bound_crystal')),
  CONSTRAINT wallet_ledgers_entry_type_check
    CHECK (entry_type IN ('credit', 'debit', 'refund', 'adjustment')),
  CONSTRAINT wallet_ledgers_amount_check
    CHECK (amount > 0),
  CONSTRAINT wallet_ledgers_reference_type_check
    CHECK (
      btrim(reference_type) <> ''
      AND lower(btrim(reference_type)) <> 'secret'
      AND lower(btrim(reference_type)) <> 'token'
      AND lower(btrim(reference_type)) <> 'payment_credential'
    ),
  CONSTRAINT wallet_ledgers_idempotency_key_check
    CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT wallet_ledgers_idempotency_key_key UNIQUE (idempotency_key)
);

COMMENT ON TABLE core.wallet_ledgers IS
'Immutable append-only Wallet ledger entries. Wallet Ledger is Level 4 Highly Sensitive and must not be updated, deleted, or used to store payment credentials.';
COMMENT ON COLUMN core.wallet_ledgers.id IS
'Wallet Ledger entry UUID.';
COMMENT ON COLUMN core.wallet_ledgers.wallet_id IS
'Owning Wallet aggregate reference. Deletion is restricted to preserve ledger continuity.';
COMMENT ON COLUMN core.wallet_ledgers.currency_type IS
'Approved currency type. Allowed values are gold, paid_crystal, gifted_crystal, and farm_bound_crystal.';
COMMENT ON COLUMN core.wallet_ledgers.entry_type IS
'Ledger entry direction and correction type. Allowed values are credit, debit, refund, and adjustment.';
COMMENT ON COLUMN core.wallet_ledgers.amount IS
'Positive ledger amount. Direction is represented by entry_type.';
COMMENT ON COLUMN core.wallet_ledgers.reference_type IS
'Structured business source type. This must not store secrets, tokens, or payment credentials.';
COMMENT ON COLUMN core.wallet_ledgers.reference_id IS
'Optional UUID reference to the structured business source.';
COMMENT ON COLUMN core.wallet_ledgers.idempotency_key IS
'Unique idempotency key for append-only ledger writes.';
COMMENT ON COLUMN core.wallet_ledgers.description IS
'Optional human-readable ledger note. This must not store secrets, tokens, or payment credentials.';
COMMENT ON COLUMN core.wallet_ledgers.occurred_at IS
'Business timestamp when the ledger event occurred.';
COMMENT ON COLUMN core.wallet_ledgers.created_at IS
'Timestamp when the ledger entry was committed to the database.';

CREATE INDEX IF NOT EXISTS wallet_ledgers_wallet_id_idx
  ON core.wallet_ledgers (wallet_id);

CREATE INDEX IF NOT EXISTS wallet_ledgers_currency_type_idx
  ON core.wallet_ledgers (currency_type);

CREATE INDEX IF NOT EXISTS wallet_ledgers_entry_type_idx
  ON core.wallet_ledgers (entry_type);

CREATE INDEX IF NOT EXISTS wallet_ledgers_occurred_at_idx
  ON core.wallet_ledgers (occurred_at);

CREATE INDEX IF NOT EXISTS wallet_ledgers_wallet_currency_occurred_at_idx
  ON core.wallet_ledgers (wallet_id, currency_type, occurred_at);

ALTER TABLE core.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.wallet_ledgers ENABLE ROW LEVEL SECURITY;

COMMIT;
