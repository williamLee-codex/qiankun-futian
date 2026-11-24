BEGIN;
CREATE TABLE public.farm_v2_friend_operations (
 id uuid PRIMARY KEY REFERENCES public.farm_v2_paid_operations(id), target_operation_id uuid NOT NULL UNIQUE REFERENCES public.farm_v2_paid_operations(id),
 actor_id uuid NOT NULL REFERENCES auth.users(id), target_id uuid NOT NULL REFERENCES auth.users(id), request_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('BORROW','ASSIST')), state text NOT NULL CHECK(state IN ('OPEN','SETTLED')),
 created_at timestamptz NOT NULL DEFAULT now(), settled_at timestamptz, CHECK(actor_id<>target_id)
);
CREATE INDEX farm_v2_friend_operations_open ON public.farm_v2_friend_operations(actor_id,target_id) WHERE state='OPEN';
ALTER TABLE public.farm_v2_friend_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farm_v2_friend_operations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.farm_v2_friend_operations TO service_role;
CREATE FUNCTION public.farm_v2_begin_friend_operation(p_actor_id uuid,p_target_id uuid,p_operation_id uuid,p_target_operation_id uuid,p_request_id text,p_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_actor jsonb;v_target jsonb;v_existing public.farm_v2_friend_operations;v_id uuid;
BEGIN
 IF p_actor_id IS NULL OR p_target_id IS NULL OR p_actor_id=p_target_id OR p_operation_id=p_target_operation_id OR p_kind NOT IN ('BORROW','ASSIST') THEN RAISE EXCEPTION 'INVALID_FRIEND_REQUEST'; END IF;
 -- Relationship changes and authorizations share this canonical pair lock.
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-friend:'||least(p_actor_id,p_target_id)::text||':'||greatest(p_actor_id,p_target_id)::text,0));
 FOR v_id IN SELECT x FROM unnest(ARRAY[p_actor_id,p_target_id]) x ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-paid:'||v_id::text,0));
 END LOOP;
 IF NOT public.farm_v2_identity_active(p_actor_id) OR NOT public.farm_v2_identity_active(p_target_id) OR NOT EXISTS(SELECT 1 FROM public.platform_friendships WHERE user_a_id=least(p_actor_id,p_target_id) AND user_b_id=greatest(p_actor_id,p_target_id) AND status='active') THEN RAISE EXCEPTION 'MUTUAL_FRIEND_REQUIRED'; END IF;
 SELECT * INTO v_existing FROM public.farm_v2_friend_operations WHERE id=p_operation_id;
 IF FOUND AND (v_existing.actor_id<>p_actor_id OR v_existing.target_id<>p_target_id OR v_existing.target_operation_id<>p_target_operation_id OR v_existing.request_id<>p_request_id OR v_existing.kind<>p_kind OR v_existing.state<>'OPEN') THEN RAISE EXCEPTION 'FARM_AUTHORIZATION_CONFLICT'; END IF;
 v_actor:=public.farm_v2_begin_paid_operation(p_actor_id,p_operation_id,p_request_id,'FRIEND:'||p_kind||':'||p_target_id::text);
 v_target:=public.farm_v2_begin_paid_operation(p_target_id,p_target_operation_id,p_request_id,'FRIEND:'||p_kind||':'||p_actor_id::text);
 INSERT INTO public.farm_v2_friend_operations(id,target_operation_id,actor_id,target_id,request_id,kind,state) VALUES(p_operation_id,p_target_operation_id,p_actor_id,p_target_id,p_request_id,p_kind,'OPEN') ON CONFLICT(id) DO NOTHING;
 RETURN jsonb_build_object('operationId',p_operation_id,'targetOperationId',p_target_operation_id,'effectivePaidCrystals',v_actor->'effectivePaidCrystals','targetPaidCrystals',v_target->'effectivePaidCrystals');
END;
$fn$;
-- Existing reconciliation can settle the two ordinary paid permits individually.
CREATE FUNCTION public.farm_v2_settle_friend_operation_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 UPDATE public.farm_v2_friend_operations f SET state='SETTLED',settled_at=now() WHERE f.state='OPEN' AND NEW.id IN (f.id,f.target_operation_id) AND NOT EXISTS(SELECT 1 FROM public.farm_v2_paid_operations p WHERE p.id IN (f.id,f.target_operation_id) AND p.state='OPEN');
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER farm_v2_settle_friend_operation_guard AFTER UPDATE OF state ON public.farm_v2_paid_operations FOR EACH ROW EXECUTE FUNCTION public.farm_v2_settle_friend_operation_guard();
CREATE FUNCTION public.farm_v2_end_friend_operation(p_actor_id uuid,p_target_id uuid,p_operation_id uuid,p_target_operation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_existing public.farm_v2_friend_operations;v_id uuid;
BEGIN
 SELECT * INTO v_existing FROM public.farm_v2_friend_operations WHERE id=p_operation_id;
 IF FOUND AND (v_existing.actor_id<>p_actor_id OR v_existing.target_id<>p_target_id OR v_existing.target_operation_id<>p_target_operation_id) THEN RAISE EXCEPTION 'FARM_AUTHORIZATION_CONFLICT'; END IF;
 FOR v_id IN SELECT x FROM unnest(ARRAY[p_actor_id,p_target_id]) x ORDER BY x LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-paid:'||v_id::text,0));
 END LOOP;
 -- Tombstones are also safe when a begin response was lost or arrived late.
 PERFORM public.farm_v2_end_paid_operation(p_actor_id,p_operation_id);
 PERFORM public.farm_v2_end_paid_operation(p_target_id,p_target_operation_id);
END;
$fn$;
CREATE FUNCTION public.farm_v2_friend_relationship_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-friend:'||OLD.user_a_id::text||':'||OLD.user_b_id::text,0));
 IF EXISTS(SELECT 1 FROM public.farm_v2_friend_operations WHERE state='OPEN' AND least(actor_id,target_id)=OLD.user_a_id AND greatest(actor_id,target_id)=OLD.user_b_id) THEN RAISE EXCEPTION 'FARM_FRIEND_OPERATION_IN_PROGRESS' USING ERRCODE='55P03'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$fn$;
CREATE TRIGGER farm_v2_friend_relationship_guard BEFORE UPDATE OR DELETE ON public.platform_friendships FOR EACH ROW EXECUTE FUNCTION public.farm_v2_friend_relationship_guard();
CREATE FUNCTION public.farm_v2_friend_identity_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_user uuid;
BEGIN
 IF TG_TABLE_SCHEMA='auth' THEN v_user:=OLD.id; ELSE v_user:=OLD.auth_user_id; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('farm-v2-paid:'||v_user::text,0));
 IF EXISTS(SELECT 1 FROM public.farm_v2_friend_operations WHERE state='OPEN' AND v_user IN (actor_id,target_id)) THEN RAISE EXCEPTION 'FARM_FRIEND_OPERATION_IN_PROGRESS' USING ERRCODE='55P03'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$fn$;
CREATE TRIGGER farm_v2_friend_auth_identity_guard BEFORE UPDATE OF banned_until,deleted_at OR DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION public.farm_v2_friend_identity_guard();
CREATE TRIGGER farm_v2_friend_core_identity_guard BEFORE UPDATE OF status,deleted_at OR DELETE ON core.users FOR EACH ROW EXECUTE FUNCTION public.farm_v2_friend_identity_guard();
CREATE OR REPLACE FUNCTION public.farm_v2_read_friend_access(p_owner_id uuid,p_target_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF NOT public.farm_v2_identity_active(p_owner_id) THEN RETURN jsonb_build_object('allowed',false); END IF;
 IF p_target_id IS NOT NULL THEN
  IF NOT public.farm_v2_identity_active(p_target_id) OR NOT EXISTS(SELECT 1 FROM public.platform_friendships WHERE user_a_id=least(p_owner_id,p_target_id) AND user_b_id=greatest(p_owner_id,p_target_id) AND status='active') THEN RETURN jsonb_build_object('allowed',false); END IF;
  RETURN jsonb_build_object('allowed',true,'targetPaidCrystals',public.farm_v2_effective_paid_crystals(p_target_id));
 END IF;
 RETURN jsonb_build_object('friends',coalesce((SELECT jsonb_agg(jsonb_build_object('id',CASE WHEN user_a_id=p_owner_id THEN user_b_id ELSE user_a_id END)) FROM public.platform_friendships WHERE p_owner_id IN (user_a_id,user_b_id) AND status='active' AND public.farm_v2_identity_active(CASE WHEN user_a_id=p_owner_id THEN user_b_id ELSE user_a_id END)),'[]'::jsonb));
END;
$fn$;
REVOKE ALL ON FUNCTION public.farm_v2_begin_friend_operation(uuid,uuid,uuid,uuid,text,text),public.farm_v2_end_friend_operation(uuid,uuid,uuid,uuid),public.farm_v2_friend_relationship_guard(),public.farm_v2_friend_identity_guard(),public.farm_v2_settle_friend_operation_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_begin_friend_operation(uuid,uuid,uuid,uuid,text,text),public.farm_v2_end_friend_operation(uuid,uuid,uuid,uuid) TO service_role;
COMMIT;
