BEGIN;

-- Farm server-side paid-value qualification reads the canonical wallet ledger.
-- Keep this boundary service-role only; browser/authenticated clients receive no access.

GRANT USAGE ON SCHEMA core TO service_role;

GRANT SELECT ON TABLE
  core.wallets,
  core.wallet_ledgers
TO service_role;

COMMIT;
