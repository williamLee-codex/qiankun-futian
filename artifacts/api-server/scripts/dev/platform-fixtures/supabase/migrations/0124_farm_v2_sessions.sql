BEGIN;
CREATE TABLE public.farm_v2_sessions (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  app_id text NOT NULL CHECK(app_id='qiankun-futian'),
  source_token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '12 hours',
  revoked_at timestamptz
);
ALTER TABLE public.farm_v2_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.farm_v2_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT,INSERT,UPDATE ON public.farm_v2_sessions TO service_role;

CREATE FUNCTION public.farm_v2_exchange_session(p_user_id uuid,p_source_token_hash text,p_session_token_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_launch record; v_session public.farm_v2_sessions;
BEGIN
  IF p_user_id IS NULL OR p_source_token_hash IS NULL OR p_session_token_hash IS NULL
    OR p_source_token_hash !~ '^[a-f0-9]{64}$' OR p_session_token_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('error','FARM_SESSION_NOT_ACTIVE');
  END IF;
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

CREATE FUNCTION public.farm_v2_use_session(p_token_hash text,p_revoke boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $fn$
DECLARE v_session public.farm_v2_sessions;
BEGIN
  -- Atomic expiry check/activity update; neither expired nor revoked sessions
  -- can be revived. Launch expiry no longer grants access; root revocation does.
  UPDATE public.farm_v2_sessions s SET last_seen_at=now(),
    revoked_at=CASE WHEN p_revoke THEN now() ELSE s.revoked_at END
  WHERE s.token_hash=p_token_hash AND s.revoked_at IS NULL AND s.expires_at>now()
    AND s.last_seen_at>now()-interval '30 minutes'
    AND EXISTS(SELECT 1 FROM public.launch_tokens l WHERE l.token_hash=s.source_token_hash
      AND l.user_id=s.user_id AND l.app_id=s.app_id AND l.revoked_at IS NULL)
  RETURNING s.* INTO v_session;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','FARM_SESSION_NOT_ACTIVE'); END IF;
  RETURN jsonb_build_object('userId',v_session.user_id,'appId',v_session.app_id,
    'expiresAt',v_session.expires_at,'revoked',p_revoke);
END;
$fn$;
REVOKE ALL ON FUNCTION public.farm_v2_exchange_session(uuid,text,text),public.farm_v2_use_session(text,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_exchange_session(uuid,text,text),public.farm_v2_use_session(text,boolean)
  TO service_role;
COMMIT;
