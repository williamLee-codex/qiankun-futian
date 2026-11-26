BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_friend_profiles (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  invitation_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_friend_profiles_code_check CHECK (invitation_code ~ '^FT-[A-Z0-9]{12}$')
);

CREATE TABLE IF NOT EXISTS public.platform_friend_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message text NULL CHECK (message IS NULL OR char_length(message) BETWEEN 1 AND 60),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT platform_friend_invites_not_self CHECK (sender_id <> recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_friend_invites_pending_pair_idx
  ON public.platform_friend_invites(sender_id, recipient_id) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.platform_friendships (
  user_a_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  blocked_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_a_id, user_b_id),
  CONSTRAINT platform_friendships_ordered_pair CHECK (user_a_id < user_b_id),
  CONSTRAINT platform_friendships_blocker_check CHECK (
    (status = 'active' AND blocked_by_user_id IS NULL) OR
    (status = 'blocked' AND blocked_by_user_id IN (user_a_id, user_b_id))
  )
);

CREATE TABLE IF NOT EXISTS public.farm_v1_assist_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  helper_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  land_index smallint NOT NULL CHECK (land_index BETWEEN 2 AND 5),
  crop_id text NOT NULL CHECK (crop_id IN ('yue-hai-tan','chi-xue-shen','tian-shu-man','tai-wei-lian')),
  total_crop_quantity integer NOT NULL CHECK (total_crop_quantity > 0),
  helper_crop_quantity integer NOT NULL CHECK (helper_crop_quantity > 0),
  owner_crop_quantity integer NOT NULL CHECK (owner_crop_quantity >= 0),
  taiwan_date date NOT NULL,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(helper_id, idempotency_key),
  UNIQUE(owner_id, land_index, taiwan_date),
  CONSTRAINT farm_v1_assist_events_not_self CHECK (helper_id <> owner_id),
  CONSTRAINT farm_v1_assist_events_split_check CHECK (total_crop_quantity = helper_crop_quantity + owner_crop_quantity)
);

CREATE INDEX IF NOT EXISTS farm_v1_assist_events_helper_created_idx
  ON public.farm_v1_assist_events(helper_id, created_at DESC);

ALTER TABLE public.platform_friend_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_friend_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.farm_v1_assist_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.platform_friend_profile(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF p_owner_id IS NULL THEN RAISE EXCEPTION 'FRIEND_PROFILE_INVALID'; END IF;
  SELECT invitation_code INTO v_code FROM public.platform_friend_profiles WHERE owner_id = p_owner_id;
  IF v_code IS NULL THEN
    LOOP
      v_code := 'FT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
      BEGIN
        INSERT INTO public.platform_friend_profiles(owner_id, invitation_code) VALUES (p_owner_id, v_code);
        EXIT;
      EXCEPTION WHEN unique_violation THEN
      END;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('ownerId', p_owner_id::text, 'invitationCode', v_code);
END; $$;

CREATE OR REPLACE FUNCTION public.platform_friend_send_invite(
  p_sender_id uuid, p_recipient_code text, p_message text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_recipient_id uuid; v_message text := nullif(btrim(p_message), ''); v_a uuid; v_b uuid; v_invite public.platform_friend_invites;
BEGIN
  IF p_sender_id IS NULL OR nullif(btrim(p_recipient_code), '') IS NULL THEN RAISE EXCEPTION 'INVITATION_NOT_ALLOWED'; END IF;
  IF v_message IS NOT NULL AND char_length(v_message) > 60 THEN RAISE EXCEPTION 'MESSAGE_TOO_LONG'; END IF;
  PERFORM public.platform_friend_profile(p_sender_id);
  SELECT owner_id INTO v_recipient_id FROM public.platform_friend_profiles WHERE invitation_code = upper(btrim(p_recipient_code));
  IF v_recipient_id IS NULL OR v_recipient_id = p_sender_id THEN RAISE EXCEPTION 'INVITATION_NOT_ALLOWED'; END IF;
  v_a := least(p_sender_id, v_recipient_id); v_b := greatest(p_sender_id, v_recipient_id);
  IF EXISTS (SELECT 1 FROM public.platform_friendships WHERE user_a_id=v_a AND user_b_id=v_b) THEN RAISE EXCEPTION 'INVITATION_NOT_ALLOWED'; END IF;
  IF EXISTS (SELECT 1 FROM public.platform_friend_invites WHERE sender_id=p_sender_id AND recipient_id=v_recipient_id AND status='rejected' AND resolved_at > now() - interval '7 days') THEN RAISE EXCEPTION 'INVITATION_COOLDOWN'; END IF;
  INSERT INTO public.platform_friend_invites(sender_id, recipient_id, message) VALUES (p_sender_id, v_recipient_id, v_message) RETURNING * INTO v_invite;
  RETURN jsonb_build_object('id',v_invite.id::text,'senderId',v_invite.sender_id::text,'recipientId',v_invite.recipient_id::text,'message',v_invite.message,'status',v_invite.status,'createdAt',v_invite.created_at,'resolvedAt',v_invite.resolved_at);
END; $$;

CREATE OR REPLACE FUNCTION public.platform_friend_resolve_invite(
  p_actor_id uuid, p_invite_id uuid, p_action text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_invite public.platform_friend_invites; v_a uuid; v_b uuid;
BEGIN
  SELECT * INTO v_invite FROM public.platform_friend_invites WHERE id=p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVITE_NOT_FOUND'; END IF;
  IF v_invite.status <> 'pending' THEN RAISE EXCEPTION 'INVITE_NOT_ALLOWED'; END IF;
  IF p_action='withdraw' THEN
    IF p_actor_id <> v_invite.sender_id THEN RAISE EXCEPTION 'INVITE_NOT_ALLOWED'; END IF;
    UPDATE public.platform_friend_invites SET status='withdrawn', resolved_at=now() WHERE id=v_invite.id;
  ELSIF p_action IN ('accept','reject') THEN
    IF p_actor_id <> v_invite.recipient_id THEN RAISE EXCEPTION 'INVITE_NOT_ALLOWED'; END IF;
    UPDATE public.platform_friend_invites SET status=p_action || 'ed', resolved_at=now() WHERE id=v_invite.id;
    IF p_action='accept' THEN
      v_a := least(v_invite.sender_id,v_invite.recipient_id); v_b := greatest(v_invite.sender_id,v_invite.recipient_id);
      INSERT INTO public.platform_friendships(user_a_id,user_b_id,status) VALUES(v_a,v_b,'active')
      ON CONFLICT(user_a_id,user_b_id) DO UPDATE SET status='active',blocked_by_user_id=NULL,updated_at=now();
    END IF;
  ELSE RAISE EXCEPTION 'INVITE_NOT_ALLOWED';
  END IF;
  RETURN jsonb_build_object('status','ok');
END; $$;

CREATE OR REPLACE FUNCTION public.platform_friend_read_context(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code jsonb; v_today date := timezone('Asia/Taipei', now())::date;
BEGIN
  v_code := public.platform_friend_profile(p_owner_id);
  RETURN jsonb_build_object(
    'invitationCode', v_code->>'invitationCode',
    'incomingInvites', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id::text,'senderId',sender_id::text,'recipientId',recipient_id::text,'message',message,'status',status,'createdAt',created_at,'resolvedAt',resolved_at) ORDER BY created_at DESC) FROM public.platform_friend_invites WHERE recipient_id=p_owner_id AND status='pending'),'[]'::jsonb),
    'friends', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',(CASE WHEN user_a_id=p_owner_id THEN user_b_id ELSE user_a_id END)::text,'cooldownUntil',(SELECT max(created_at)+interval '24 hours' FROM public.farm_v1_assist_events WHERE helper_id=p_owner_id AND owner_id=(CASE WHEN user_a_id=p_owner_id THEN user_b_id ELSE user_a_id END)),'matureLandIndexes','[]'::jsonb)) FROM public.platform_friendships WHERE status='active' AND p_owner_id IN (user_a_id,user_b_id)),'[]'::jsonb),
    'remainingDailyAssists', greatest(0,5-(SELECT count(*) FROM public.farm_v1_assist_events WHERE helper_id=p_owner_id AND taiwan_date=v_today))
  );
END; $$;

CREATE OR REPLACE FUNCTION public.farm_v1_assist_harvest(
  p_helper_id uuid, p_owner_id uuid, p_land_index smallint, p_idempotency_key text, p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_land public.farm_v1_lands; v_total integer; v_helper integer; v_owner integer; v_crop record; v_existing public.farm_v1_assist_events; v_today date := timezone('Asia/Taipei', p_now)::date; v_wallet jsonb;
BEGIN
  IF p_helper_id IS NULL OR p_owner_id IS NULL OR p_helper_id=p_owner_id OR p_land_index NOT BETWEEN 2 AND 5 OR nullif(btrim(p_idempotency_key),'') IS NULL THEN RAISE EXCEPTION 'ASSIST_NOT_ALLOWED'; END IF;
  SELECT * INTO v_existing FROM public.farm_v1_assist_events WHERE helper_id=p_helper_id AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('status','duplicate','cropId',v_existing.crop_id,'landIndex',v_existing.land_index,'helperCropQuantity',v_existing.helper_crop_quantity,'ownerCropQuantity',v_existing.owner_crop_quantity,'remainingDailyAssists',greatest(0,5-(SELECT count(*) FROM public.farm_v1_assist_events WHERE helper_id=p_helper_id AND taiwan_date=v_today))); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.platform_friendships WHERE user_a_id=least(p_helper_id,p_owner_id) AND user_b_id=greatest(p_helper_id,p_owner_id) AND status='active') THEN RAISE EXCEPTION 'ASSIST_NOT_ALLOWED'; END IF;
  IF (SELECT count(*) FROM public.farm_v1_assist_events WHERE helper_id=p_helper_id AND taiwan_date=v_today) >= 5 THEN RAISE EXCEPTION 'ASSIST_DAILY_LIMIT'; END IF;
  IF EXISTS (SELECT 1 FROM public.farm_v1_assist_events WHERE helper_id=p_helper_id AND owner_id=p_owner_id AND created_at > p_now-interval '24 hours') THEN RAISE EXCEPTION 'ASSIST_FRIEND_COOLDOWN'; END IF;
  PERFORM public.farm_v1_read_runtime(p_owner_id,p_now);
  PERFORM public.farm_v1_read_runtime(p_helper_id,p_now);
  SELECT * INTO v_land FROM public.farm_v1_lands WHERE owner_id=p_owner_id AND land_index=p_land_index FOR UPDATE;
  IF v_land.planted_at IS NULL OR v_land.planted_crop_id IS NULL OR v_land.planted_quantity < 1 THEN RAISE EXCEPTION 'ASSIST_NOT_MATURE'; END IF;
  SELECT exchange_quantity,exchange_value,exchange_currency INTO v_crop FROM (VALUES
    ('yue-hai-tan'::text,8,1,'coin'::text,interval '6 hours'),('chi-xue-shen',3,1,'coin',interval '8 hours'),('tian-shu-man',2,1,'coin',interval '10 hours'),('tai-wei-lian',1,1,'coin',interval '12 hours')
  ) AS c(crop_id,exchange_quantity,exchange_value,exchange_currency,growth) WHERE crop_id=v_land.planted_crop_id;
  IF v_crop.crop_id IS NULL OR p_now < v_land.planted_at + v_crop.growth THEN RAISE EXCEPTION 'ASSIST_NOT_MATURE'; END IF;
  v_total:=v_land.planted_quantity; v_helper:=ceil(v_total*0.10); v_owner:=v_total-v_helper;
  UPDATE public.farm_v1_lands SET planted_at=NULL,planted_crop_id=NULL,planted_quantity=0,updated_at=p_now WHERE owner_id=p_owner_id AND land_index=p_land_index;
  INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity) VALUES(p_helper_id,v_land.planted_crop_id,v_helper % v_crop.exchange_quantity) ON CONFLICT(owner_id,item_key) DO UPDATE SET quantity=excluded.quantity+farm_v1_inventory.quantity,updated_at=p_now;
  INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity) VALUES(p_owner_id,v_land.planted_crop_id,v_owner % v_crop.exchange_quantity) ON CONFLICT(owner_id,item_key) DO UPDATE SET quantity=excluded.quantity+farm_v1_inventory.quantity,updated_at=p_now;
  IF floor(v_helper/v_crop.exchange_quantity)*v_crop.exchange_value > 0 THEN v_wallet:=public.core_wallet_apply_transaction(p_helper_id,(floor(v_helper/v_crop.exchange_quantity)*v_crop.exchange_value)::integer,v_crop.exchange_currency,'credit',p_idempotency_key||':helper','farm_friend_assist','assist:'||p_owner_id||':'||p_land_index,'farm_assist',NULL); END IF;
  IF floor(v_owner/v_crop.exchange_quantity)*v_crop.exchange_value > 0 THEN v_wallet:=public.core_wallet_apply_transaction(p_owner_id,(floor(v_owner/v_crop.exchange_quantity)*v_crop.exchange_value)::integer,v_crop.exchange_currency,'credit',p_idempotency_key||':owner','farm_friend_assist','assist:'||p_helper_id||':'||p_land_index,'farm_assist',NULL); END IF;
  INSERT INTO public.farm_v1_assist_events(helper_id,owner_id,land_index,crop_id,total_crop_quantity,helper_crop_quantity,owner_crop_quantity,taiwan_date,idempotency_key,created_at) VALUES(p_helper_id,p_owner_id,p_land_index,v_land.planted_crop_id,v_total,v_helper,v_owner,v_today,p_idempotency_key,p_now);
  RETURN jsonb_build_object('status','created','cropId',v_land.planted_crop_id,'landIndex',p_land_index,'helperCropQuantity',v_helper,'ownerCropQuantity',v_owner,'remainingDailyAssists',greatest(0,4-(SELECT count(*) FROM public.farm_v1_assist_events WHERE helper_id=p_helper_id AND taiwan_date=v_today)));
END; $$;

REVOKE ALL ON FUNCTION public.platform_friend_profile(uuid), public.platform_friend_send_invite(uuid,text,text), public.platform_friend_resolve_invite(uuid,uuid,text), public.platform_friend_read_context(uuid), public.farm_v1_assist_harvest(uuid,uuid,smallint,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_friend_profile(uuid), public.platform_friend_send_invite(uuid,text,text), public.platform_friend_resolve_invite(uuid,uuid,text), public.platform_friend_read_context(uuid), public.farm_v1_assist_harvest(uuid,uuid,smallint,text,timestamptz) TO service_role;

COMMIT;