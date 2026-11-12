-- Farm V2 is authenticated by the central platform; its isolated database may not contain a matching auth.users row.
-- Preserve existing wallets and ledger entries. Require a locally initialized Farm V2 player for every NEW wallet.
CREATE OR REPLACE FUNCTION farm_v2_bank.assert_wallet_player()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.farm_v2_player_state p WHERE p.user_id = NEW.user_id::text
  ) THEN
    RAISE EXCEPTION 'FARM_PLAYER_STATE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION farm_v2_bank.assert_wallet_player() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS farm_v2_bank_wallet_player_insert ON farm_v2_bank.wallets;
CREATE TRIGGER farm_v2_bank_wallet_player_insert
BEFORE INSERT ON farm_v2_bank.wallets
FOR EACH ROW EXECUTE FUNCTION farm_v2_bank.assert_wallet_player();
ALTER TABLE farm_v2_bank.wallets DROP CONSTRAINT IF EXISTS wallets_user_id_fkey;
