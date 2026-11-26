BEGIN;

CREATE OR REPLACE FUNCTION system.reject_immutable_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'IMMUTABLE_RESOURCE_MODIFICATION_REJECTED';
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION system.reject_immutable_change() IS
'Rejects UPDATE and DELETE attempts for immutable append-only resources without exposing row contents.';

DROP TRIGGER IF EXISTS trg_wallet_ledgers_reject_update ON core.wallet_ledgers;
CREATE TRIGGER trg_wallet_ledgers_reject_update
  BEFORE UPDATE ON core.wallet_ledgers
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_wallet_ledgers_reject_update ON core.wallet_ledgers IS
'Rejects all UPDATE attempts on immutable Wallet Ledger entries.';

DROP TRIGGER IF EXISTS trg_wallet_ledgers_reject_delete ON core.wallet_ledgers;
CREATE TRIGGER trg_wallet_ledgers_reject_delete
  BEFORE DELETE ON core.wallet_ledgers
  FOR EACH ROW
  EXECUTE FUNCTION system.reject_immutable_change();

COMMENT ON TRIGGER trg_wallet_ledgers_reject_delete ON core.wallet_ledgers IS
'Rejects all DELETE attempts on immutable Wallet Ledger entries.';

COMMIT;
