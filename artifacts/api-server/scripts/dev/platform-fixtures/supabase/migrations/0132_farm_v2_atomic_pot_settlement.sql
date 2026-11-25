BEGIN;
-- Co-location only: the caller must use the SAME PostgreSQL transaction for
-- Farm assets, gallery, request journal and this Core-owned wallet RPC.
-- No existing migration or live asset is rewritten/migrated here.
CREATE TABLE public.farm_v2_atomic_pot_receipts (
 user_id uuid NOT NULL REFERENCES auth.users(id), request_id text NOT NULL,
 transaction_id uuid NOT NULL UNIQUE REFERENCES public.core_wallet_ledger(id),
 command jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,request_id), CHECK(jsonb_typeof(command)='object')
);
ALTER TABLE public.farm_v2_atomic_pot_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farm_v2_atomic_pot_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.farm_v2_atomic_pot_receipts TO service_role;
CREATE FUNCTION public.farm_v2_apply_atomic_pot_wallet(p_operation_id uuid,p_owner_id uuid,p_request_id text,p_command jsonb,p_reference_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_contract jsonb;v_net integer;v_result jsonb;v_transaction uuid;v_grade integer;
BEGIN
 IF p_owner_id IS NULL OR p_operation_id IS NULL OR p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$'
 OR p_command IS NULL OR jsonb_typeof(p_command)<>'object' OR p_command->>'kind' IS DISTINCT FROM 'synthesize'
 OR coalesce(p_command->>'species','') !~ '^[1-6]$' OR jsonb_typeof(p_command->'useDisplayed') IS DISTINCT FROM 'boolean'
 OR (SELECT count(*) FROM jsonb_object_keys(p_command))<>4 THEN RAISE EXCEPTION 'INVALID_ATOMIC_POT_COMMAND'; END IF;
 v_grade:=array_position(ARRAY['黃','玄','地','天','仙','神'],p_command->>'grade')-1;
 IF v_grade IS NULL OR p_reference_id IS NULL OR p_reference_id !~ '^[1-6]:[0-5]:[01]$'
 OR split_part(p_reference_id,':',1)<>p_command->>'species' OR split_part(p_reference_id,':',2)<>v_grade::text THEN RAISE EXCEPTION 'INVALID_ATOMIC_POT_COMMAND'; END IF;
 -- A fresh permit created by the real platform HTTP bridge must be visible
 -- here. A separate Farm DB/clone cannot satisfy this co-location check.
 PERFORM 1 FROM auth.users WHERE id=p_owner_id FOR SHARE;
 PERFORM 1 FROM core.users WHERE auth_user_id=p_owner_id FOR SHARE;
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-paid:'||p_owner_id::text,0));
 PERFORM 1 FROM public.farm_v2_paid_operations WHERE id=p_operation_id AND user_id=p_owner_id AND request_id=p_request_id AND action='POST:/farm/v2/workshop' AND state='OPEN' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FARM_ATOMIC_AUTHORITY_MISMATCH'; END IF;
 IF NOT public.farm_v2_identity_active(p_owner_id) THEN RAISE EXCEPTION 'FARM_SESSION_NOT_ACTIVE'; END IF;
 IF EXISTS(SELECT 1 FROM public.farm_v2_atomic_pot_receipts WHERE user_id=p_owner_id AND request_id=p_request_id) THEN RAISE EXCEPTION 'FARM_ATOMIC_JOURNAL_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM public.core_wallet_ledger WHERE owner_id=p_owner_id AND idempotency_key='farm-v2:'||p_request_id||':primary') THEN RAISE EXCEPTION 'FARM_LEGACY_WORKSHOP_RECONCILIATION_REQUIRED'; END IF;
 v_contract:=public.farm_v2_workshop_wallet_contract('farm_pot_synthesis',p_reference_id);
 v_net:=(v_contract->>'reward')::integer-(v_contract->>'cost')::integer;
 v_result:=public.farm_v2_apply_authorized_wallet_transaction(p_operation_id,p_owner_id,p_request_id,abs(v_net),'coin',CASE WHEN v_net<0 THEN 'debit' ELSE 'credit' END,'farm_pot_synthesis',p_reference_id,'farm_pot_synthesis',NULL);
 IF v_result->>'result_status'='compensated' THEN RAISE EXCEPTION 'FARM_MUTATION_COMPENSATED'; END IF;
 IF v_result->>'result_status' IS DISTINCT FROM 'created' THEN RAISE EXCEPTION '%',upper(coalesce(v_result->>'result_status','INVALID_CORE_RESULT')); END IF;
 v_transaction:=(v_result->'transaction'->>'id')::uuid;
 INSERT INTO public.farm_v2_atomic_pot_receipts(user_id,request_id,transaction_id,command) VALUES(p_owner_id,p_request_id,v_transaction,p_command);
 RETURN v_result;
END;
$fn$;
CREATE FUNCTION public.farm_v2_atomic_pot_receipt_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF TG_TABLE_NAME='farm_v2_atomic_pot_receipts' THEN RAISE EXCEPTION 'FARM_ATOMIC_RECEIPT_IMMUTABLE'; END IF;
 -- Legacy Saga compensation must never reverse just the wallet half of an
 -- atomic settlement. Inspection and legacy compensation remain unchanged.
 IF NEW.reversal_of IS NOT NULL AND EXISTS(SELECT 1 FROM public.farm_v2_atomic_pot_receipts WHERE transaction_id=NEW.reversal_of) THEN RAISE EXCEPTION 'FARM_ATOMIC_COMPENSATION_NOT_ALLOWED'; END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER farm_v2_atomic_pot_receipt_immutable BEFORE UPDATE OR DELETE ON public.farm_v2_atomic_pot_receipts FOR EACH ROW EXECUTE FUNCTION public.farm_v2_atomic_pot_receipt_guard();
CREATE TRIGGER farm_v2_atomic_pot_compensation_guard BEFORE INSERT ON public.core_wallet_ledger FOR EACH ROW EXECUTE FUNCTION public.farm_v2_atomic_pot_receipt_guard();
REVOKE ALL ON FUNCTION public.farm_v2_apply_atomic_pot_wallet(uuid,uuid,text,jsonb,text),public.farm_v2_atomic_pot_receipt_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_apply_atomic_pot_wallet(uuid,uuid,text,jsonb,text) TO service_role;
COMMIT;
