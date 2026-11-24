-- Isolated test snapshot only. Apply after core-schema-extract.sql and farm_v2_wallet_closures migration.
-- Requires auth.uid(), authenticated and service_role.
CREATE OR REPLACE FUNCTION public.core_crystal_policy_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$
declare
  v_forbidden constant text[] := array[
    'transfer', 'transferred', 'gift', 'gifted', 'cashout',
    'resale', 'exchange', 'loan', 'collateral', 'handover'
  ];
  v_wallet_owner uuid;
  v_tokens text[];
begin
  select w.owner_id into v_wallet_owner from public.core_wallets w where w.id = new.wallet_id;
  if v_wallet_owner is null then
    raise exception 'WALLET_NOT_FOUND';
  end if;
  if v_wallet_owner <> new.owner_id then
    raise exception 'WALLET_OWNER_MISMATCH';
  end if;

  if new.reversal_of is not null then
    if exists (
      select 1 from public.core_wallet_ledger l
       where l.id = new.reversal_of
         and (l.owner_id <> new.owner_id or l.currency <> new.currency)
    ) then
      raise exception 'WALLET_REVERSAL_CROSS_ACCOUNT';
    end if;
  end if;

  if new.currency = 'crystal' then
    v_tokens := regexp_split_to_array(
      lower(coalesce(new.reason, '') || ' ' || coalesce(new.reference_type, '')),
      '[^a-z]+'
    );
    if v_tokens && v_forbidden then
      raise exception 'CRYSTAL_TRANSFER_FORBIDDEN';
    end if;
    -- Punctuation-stripped comparison catches cash_out, cash-out, cashOut, and similar.
    if regexp_replace(lower(coalesce(new.reason, '')), '[^a-z0-9]', '', 'g')
         ~ '(transfer|gift|cashout|resale|exchange|collateral|handover)'
       or regexp_replace(lower(coalesce(new.reference_type, '')), '[^a-z0-9]', '', 'g')
         ~ '(transfer|gift|cashout|resale|exchange|collateral|handover)' then
      raise exception 'CRYSTAL_TRANSFER_FORBIDDEN';
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.farm_v2_closed_wallet_request_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF TG_OP<>'INSERT' THEN
  -- Do not change non-Farm Core/V1 writers; protect both sides of a rename.
  IF OLD.idempotency_key LIKE 'farm-v2:%' OR NEW.idempotency_key LIKE 'farm-v2:%'
   OR OLD.reason IN ('farm_seed_purchase','farm_crop_exchange','farm_pot_synthesis','farm_decor_purchase','farm_mission_reward','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase','farm_wallet_compensation')
   OR NEW.reason IN ('farm_seed_purchase','farm_crop_exchange','farm_pot_synthesis','farm_decor_purchase','farm_mission_reward','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase','farm_wallet_compensation')
  THEN RAISE EXCEPTION 'FARM_LEDGER_IMMUTABLE'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 IF NEW.reason IN ('farm_seed_purchase','farm_crop_exchange','farm_pot_synthesis','farm_decor_purchase','farm_mission_reward','farm_pet_food_purchase','farm_pet_purchase','farm_formation_purchase') AND EXISTS(
  SELECT 1 FROM public.farm_v2_wallet_closures c WHERE c.user_id=NEW.owner_id
  AND NEW.idempotency_key IN ('farm-v2:'||c.request_id||':primary','farm-v2:'||c.request_id||':primary:debit:coin','farm-v2:'||c.request_id||':primary:credit:coin','farm-v2:'||c.request_id||':primary:credit:crystal')
 ) THEN RAISE EXCEPTION 'FARM_MUTATION_COMPENSATED'; END IF;
 RETURN NEW;
END;
$function$
;
ALTER TABLE public.core_wallets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.core_wallets FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.core_wallet_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.core_wallet_ledger FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.farm_v2_atomic_pot_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farm_v2_atomic_pot_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT ALL ON public.core_wallets, public.core_wallet_ledger TO service_role;
GRANT SELECT ON public.core_wallets, public.core_wallet_ledger TO authenticated;
GRANT SELECT ON public.farm_v2_atomic_pot_receipts TO service_role;
CREATE POLICY core_wallets_owner_select ON public.core_wallets FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE POLICY core_wallet_ledger_owner_select ON public.core_wallet_ledger FOR SELECT TO authenticated USING ((SELECT auth.uid()) = owner_id);
CREATE TRIGGER core_wallet_ledger_crystal_policy BEFORE INSERT ON public.core_wallet_ledger FOR EACH ROW EXECUTE FUNCTION public.core_crystal_policy_guard();
CREATE TRIGGER farm_v2_atomic_pot_compensation_guard BEFORE INSERT ON public.core_wallet_ledger FOR EACH ROW EXECUTE FUNCTION public.farm_v2_atomic_pot_receipt_guard();
CREATE TRIGGER farm_v2_closed_wallet_request_guard BEFORE INSERT OR DELETE OR UPDATE ON public.core_wallet_ledger FOR EACH ROW EXECUTE FUNCTION public.farm_v2_closed_wallet_request_guard();
CREATE TRIGGER farm_v2_atomic_pot_receipt_immutable BEFORE DELETE OR UPDATE ON public.farm_v2_atomic_pot_receipts FOR EACH ROW EXECUTE FUNCTION public.farm_v2_atomic_pot_receipt_guard();
