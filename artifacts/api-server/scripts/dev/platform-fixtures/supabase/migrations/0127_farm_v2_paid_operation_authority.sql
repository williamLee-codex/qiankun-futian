BEGIN;
CREATE TABLE public.farm_v2_paid_operations (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), request_id text NOT NULL,
 action text NOT NULL, qualification bigint NOT NULL, state text NOT NULL CHECK(state IN ('OPEN','SETTLED')),
 created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz
);
CREATE INDEX farm_v2_paid_operations_open ON public.farm_v2_paid_operations(user_id) WHERE state='OPEN';
ALTER TABLE public.farm_v2_paid_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farm_v2_paid_operations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.farm_v2_paid_operations TO service_role;
CREATE OR REPLACE FUNCTION public.farm_v2_begin_paid_operation(p_user_id uuid,p_operation_id uuid,p_request_id text,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_existing public.farm_v2_paid_operations; v_value bigint;
BEGIN
 IF p_user_id IS NULL OR p_operation_id IS NULL OR p_request_id IS NULL OR p_request_id !~ '^[A-Za-z0-9._:-]{1,120}$' OR p_action IS NULL OR length(p_action)>250 THEN RAISE EXCEPTION 'INVALID_FARM_AUTHORIZATION'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-paid:'||p_user_id::text,0));
 SELECT * INTO v_existing FROM public.farm_v2_paid_operations WHERE id=p_operation_id;
 IF FOUND THEN
  IF v_existing.user_id<>p_user_id OR v_existing.request_id<>p_request_id OR v_existing.action<>p_action OR v_existing.state<>'OPEN' THEN RAISE EXCEPTION 'FARM_AUTHORIZATION_CONFLICT'; END IF;
  RETURN jsonb_build_object('operationId',v_existing.id,'effectivePaidCrystals',v_existing.qualification);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=now())) OR EXISTS(SELECT 1 FROM core.users WHERE auth_user_id=p_user_id AND (status<>'active' OR deleted_at IS NOT NULL)) THEN RAISE EXCEPTION 'FARM_SESSION_NOT_ACTIVE'; END IF;
 v_value:=public.farm_v2_effective_paid_crystals(p_user_id);
 INSERT INTO public.farm_v2_paid_operations(id,user_id,request_id,action,qualification,state) VALUES(p_operation_id,p_user_id,p_request_id,p_action,v_value,'OPEN');
 RETURN jsonb_build_object('operationId',p_operation_id,'effectivePaidCrystals',v_value);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.farm_v2_end_paid_operation(p_user_id uuid,p_operation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-paid:'||p_user_id::text,0));
 INSERT INTO public.farm_v2_paid_operations(id,user_id,request_id,action,qualification,state,settled_at)
 VALUES(p_operation_id,p_user_id,'canceled','canceled',0,'SETTLED',now())
 ON CONFLICT(id) DO UPDATE SET state='SETTLED',settled_at=coalesce(public.farm_v2_paid_operations.settled_at,now())
 WHERE public.farm_v2_paid_operations.user_id=p_user_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'FARM_AUTHORIZATION_CONFLICT'; END IF;
END;
$fn$;
CREATE OR REPLACE FUNCTION public.farm_v2_paid_ledger_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_owner uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN
  IF OLD.currency_type='paid_crystal' OR NEW.currency_type='paid_crystal' THEN RAISE EXCEPTION 'FARM_LEDGER_IMMUTABLE'; END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 END IF;
 IF NEW.currency_type<>'paid_crystal' THEN RETURN NEW; END IF;
 SELECT u.auth_user_id INTO v_owner FROM core.wallets w JOIN core.users u ON u.id=w.user_id WHERE w.id=NEW.wallet_id;
 IF v_owner IS NULL THEN RAISE EXCEPTION 'PAID_VALUE_OWNER_REQUIRED'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-paid:'||v_owner::text,0));
 IF NEW.entry_type IN ('refund','adjustment') AND EXISTS(SELECT 1 FROM public.farm_v2_paid_operations WHERE user_id=v_owner AND state='OPEN') THEN
  RAISE EXCEPTION 'FARM_PAID_OPERATION_IN_PROGRESS' USING ERRCODE='55P03';
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER farm_v2_paid_ledger_guard BEFORE INSERT OR UPDATE OR DELETE ON core.wallet_ledgers FOR EACH ROW EXECUTE FUNCTION public.farm_v2_paid_ledger_guard();
CREATE OR REPLACE FUNCTION public.farm_v2_core_identity_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN IF NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN RAISE EXCEPTION 'CORE_AUTH_IDENTITY_IMMUTABLE'; END IF; RETURN NEW; END;
$fn$;
CREATE TRIGGER farm_v2_core_identity_immutable BEFORE UPDATE OF auth_user_id ON core.users FOR EACH ROW EXECUTE FUNCTION public.farm_v2_core_identity_immutable();
CREATE OR REPLACE FUNCTION public.farm_v2_apply_authorized_wallet_transaction(
 p_operation_id uuid,p_owner_id uuid,p_request_id text,p_amount integer,p_currency text,p_direction text,p_reason text,p_reference_id text,p_reference_type text,p_original_transaction_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-paid:'||p_owner_id::text,0));
 PERFORM 1 FROM public.farm_v2_paid_operations WHERE id=p_operation_id AND user_id=p_owner_id AND state='OPEN' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FARM_AUTHORIZATION_FENCED'; END IF;
 RETURN public.farm_v2_apply_wallet_transaction(p_owner_id,p_request_id,p_amount,p_currency,p_direction,p_reason,p_reference_id,p_reference_type,p_original_transaction_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.farm_v2_apply_authorized_wallet_transaction(uuid,uuid,text,integer,text,text,text,text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_apply_authorized_wallet_transaction(uuid,uuid,text,integer,text,text,text,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.farm_v2_begin_paid_operation(uuid,uuid,text,text),public.farm_v2_end_paid_operation(uuid,uuid),public.farm_v2_paid_ledger_guard(),public.farm_v2_core_identity_immutable() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_begin_paid_operation(uuid,uuid,text,text),public.farm_v2_end_paid_operation(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.farm_v2_wallet_owner_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'CORE_WALLET_OWNER_IMMUTABLE'; END IF; RETURN NEW; END;
$fn$;
CREATE TRIGGER farm_v2_wallet_owner_immutable BEFORE UPDATE OF user_id ON core.wallets FOR EACH ROW EXECUTE FUNCTION public.farm_v2_wallet_owner_immutable();
REVOKE ALL ON FUNCTION public.farm_v2_wallet_owner_immutable() FROM PUBLIC,anon,authenticated;
COMMIT;
