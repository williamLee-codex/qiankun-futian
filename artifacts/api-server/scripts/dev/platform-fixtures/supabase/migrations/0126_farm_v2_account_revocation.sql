BEGIN;
CREATE TABLE public.farm_v2_session_revocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.farm_v2_session_revocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farm_v2_session_revocations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.farm_v2_session_revocations TO service_role;
CREATE FUNCTION public.farm_v2_session_audit_append_only() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN RAISE EXCEPTION 'FARM_AUDIT_IMMUTABLE'; END;
$fn$;
CREATE TRIGGER farm_v2_session_audit_append_only BEFORE UPDATE OR DELETE ON public.farm_v2_session_revocations FOR EACH ROW EXECUTE FUNCTION public.farm_v2_session_audit_append_only();
REVOKE ALL ON FUNCTION public.farm_v2_session_audit_append_only() FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.farm_v2_identity_active(p_user_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path='' AS $fn$
 SELECT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user_id AND deleted_at IS NULL
  AND (banned_until IS NULL OR banned_until<=now()))
 AND NOT EXISTS(SELECT 1 FROM core.users WHERE auth_user_id=p_user_id AND (status<>'active' OR deleted_at IS NOT NULL));
$fn$;
CREATE OR REPLACE FUNCTION public.farm_v2_revoke_user_sessions(p_user_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF p_user_id IS NULL OR p_reason NOT IN ('logout','account_disabled','admin_revocation') THEN RAISE EXCEPTION 'INVALID_FARM_REVOCATION'; END IF;
 UPDATE public.launch_tokens SET revoked_at=coalesce(revoked_at,now()) WHERE user_id=p_user_id AND app_id='qiankun-futian';
 UPDATE public.farm_v2_sessions SET revoked_at=coalesce(revoked_at,now()) WHERE user_id=p_user_id;
 INSERT INTO public.farm_v2_session_revocations(user_id,reason) VALUES(p_user_id,p_reason);
END;
$fn$;
CREATE OR REPLACE FUNCTION public.farm_v2_account_revocation_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
BEGIN
 IF TG_TABLE_SCHEMA='auth' THEN
  IF NEW.deleted_at IS NOT NULL OR NEW.banned_until>now() THEN PERFORM public.farm_v2_revoke_user_sessions(NEW.id,'account_disabled'); END IF;
 ELSE
  IF NEW.status<>'active' OR NEW.deleted_at IS NOT NULL THEN PERFORM public.farm_v2_revoke_user_sessions(NEW.auth_user_id,'account_disabled'); END IF;
 END IF;
 RETURN NEW;
END;
$fn$;
CREATE TRIGGER farm_v2_auth_account_revocation AFTER UPDATE OF banned_until,deleted_at ON auth.users FOR EACH ROW EXECUTE FUNCTION public.farm_v2_account_revocation_trigger();
CREATE TRIGGER farm_v2_core_account_revocation AFTER UPDATE OF status,deleted_at ON core.users FOR EACH ROW EXECUTE FUNCTION public.farm_v2_account_revocation_trigger();
CREATE OR REPLACE FUNCTION public.farm_v2_exchange_session(p_user_id uuid,p_source_token_hash text,p_session_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_launch record; v_session public.farm_v2_sessions;
BEGIN
  IF p_user_id IS NULL OR p_source_token_hash IS NULL OR p_session_token_hash IS NULL
    OR p_source_token_hash !~ '^[a-f0-9]{64}$' OR p_session_token_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('error','FARM_SESSION_NOT_ACTIVE');
  END IF;
  IF NOT public.farm_v2_identity_active(p_user_id) THEN RETURN jsonb_build_object('error','FARM_SESSION_NOT_ACTIVE'); END IF;
  SELECT * INTO v_launch FROM public.launch_tokens WHERE token_hash=p_source_token_hash
    AND user_id=p_user_id AND app_id='qiankun-futian' AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','FARM_SESSION_NOT_ACTIVE'); END IF;
  SELECT * INTO v_session FROM public.farm_v2_sessions WHERE source_token_hash=p_source_token_hash;
  IF FOUND THEN
    IF v_session.revoked_at IS NOT NULL OR v_session.expires_at<=now()
      OR v_session.last_seen_at<=now()-interval '30 minutes' OR v_session.token_hash<>p_session_token_hash THEN
      RETURN jsonb_build_object('error','FARM_SESSION_NOT_ACTIVE');
    END IF;
  ELSE
    IF v_launch.used_at IS NOT NULL THEN RETURN jsonb_build_object('error','FARM_SESSION_NOT_ACTIVE'); END IF;
    INSERT INTO public.farm_v2_sessions(token_hash,user_id,app_id,source_token_hash)
      VALUES(p_session_token_hash,p_user_id,'qiankun-futian',p_source_token_hash) RETURNING * INTO v_session;
    UPDATE public.launch_tokens SET used_at=now() WHERE token_hash=p_source_token_hash AND user_id=p_user_id;
  END IF;
  RETURN jsonb_build_object('userId',v_session.user_id,'appId',v_session.app_id,'expiresAt',v_session.expires_at);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.farm_v2_use_session(p_token_hash text,p_revoke boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_session public.farm_v2_sessions;
BEGIN
  -- Atomic expiry check/activity update; neither expired nor revoked sessions
  -- can be revived. Launch expiry no longer grants access; root revocation does.
  UPDATE public.farm_v2_sessions s SET last_seen_at=now(),
    revoked_at=CASE WHEN p_revoke THEN now() ELSE s.revoked_at END
  WHERE public.farm_v2_identity_active(s.user_id) AND s.token_hash=p_token_hash AND s.revoked_at IS NULL AND s.expires_at>now()
    AND s.last_seen_at>now()-interval '30 minutes'
    AND EXISTS(SELECT 1 FROM public.launch_tokens l WHERE l.token_hash=s.source_token_hash
      AND l.user_id=s.user_id AND l.app_id=s.app_id AND l.revoked_at IS NULL)
  RETURNING s.* INTO v_session;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','FARM_SESSION_NOT_ACTIVE'); END IF;
  RETURN jsonb_build_object('userId',v_session.user_id,'appId',v_session.app_id,
    'expiresAt',v_session.expires_at,'revoked',p_revoke);
END;
$fn$;
REVOKE ALL ON FUNCTION public.farm_v2_identity_active(uuid),public.farm_v2_revoke_user_sessions(uuid,text),public.farm_v2_account_revocation_trigger() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_identity_active(uuid),public.farm_v2_revoke_user_sessions(uuid,text) TO service_role;
COMMIT;
