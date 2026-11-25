BEGIN;

ALTER TABLE public.platform_friend_profiles
  ADD COLUMN IF NOT EXISTS display_name text;

UPDATE public.platform_friend_profiles profile
SET display_name = coalesce(
  nullif(btrim(users.raw_user_meta_data->>'full_name'), ''),
  nullif(btrim(users.raw_user_meta_data->>'name'), ''),
  '道友 ' || right(profile.invitation_code, 4)
)
FROM auth.users users
WHERE users.id = profile.owner_id
  AND (profile.display_name IS NULL OR btrim(profile.display_name) = '');


CREATE OR REPLACE FUNCTION public.platform_friend_profile(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $friend_profile$
DECLARE v_code text; v_display_name text;
BEGIN
  IF p_owner_id IS NULL THEN RAISE EXCEPTION 'FRIEND_PROFILE_INVALID'; END IF;
  SELECT invitation_code, display_name INTO v_code, v_display_name
  FROM public.platform_friend_profiles WHERE owner_id = p_owner_id;
  IF v_code IS NULL THEN
    LOOP
      v_code := 'FT-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
      SELECT coalesce(
        nullif(btrim(raw_user_meta_data->>'full_name'), ''),
        nullif(btrim(raw_user_meta_data->>'name'), ''),
        '道友 ' || right(v_code, 4)
      ) INTO v_display_name
      FROM auth.users WHERE id = p_owner_id;
      BEGIN
        INSERT INTO public.platform_friend_profiles(owner_id, invitation_code, display_name)
        VALUES (p_owner_id, v_code, coalesce(v_display_name, '道友 ' || right(v_code, 4)));
        EXIT;
      EXCEPTION WHEN unique_violation THEN
      END;
    END LOOP;
  END IF;
  RETURN jsonb_build_object('ownerId', p_owner_id::text, 'invitationCode', v_code);
END; $friend_profile$;

CREATE OR REPLACE FUNCTION public.platform_friend_read_context(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code jsonb; v_today date := timezone('Asia/Taipei', now())::date;
BEGIN
  v_code := public.platform_friend_profile(p_owner_id);
  RETURN jsonb_build_object(
    'invitationCode', v_code->>'invitationCode',
    'incomingInvites', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', invite.id::text,
        'senderId', invite.sender_id::text,
        'senderDisplayName', coalesce(profile.display_name, '道友 ' || right(profile.invitation_code, 4)),
        'recipientId', invite.recipient_id::text,
        'message', invite.message,
        'status', invite.status,
        'createdAt', invite.created_at,
        'resolvedAt', invite.resolved_at
      ) ORDER BY invite.created_at DESC)
      FROM public.platform_friend_invites invite
      JOIN public.platform_friend_profiles profile ON profile.owner_id = invite.sender_id
      WHERE invite.recipient_id = p_owner_id AND invite.status = 'pending'
    ), '[]'::jsonb),
    'friends', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', friend_id::text,
        'displayName', coalesce(profile.display_name, '道友 ' || right(profile.invitation_code, 4)),
        'cooldownUntil', (
          SELECT max(created_at) + interval '24 hours'
          FROM public.farm_v1_assist_events
          WHERE helper_id = p_owner_id AND owner_id = friend_id
        ),
        'matureLandIndexes', '[]'::jsonb
      ))
      FROM (
        SELECT CASE WHEN user_a_id = p_owner_id THEN user_b_id ELSE user_a_id END AS friend_id
        FROM public.platform_friendships
        WHERE status = 'active' AND p_owner_id IN (user_a_id, user_b_id)
      ) friends
      JOIN public.platform_friend_profiles profile ON profile.owner_id = friends.friend_id
    ), '[]'::jsonb),
    'remainingDailyAssists', greatest(0, 5 - (
      SELECT count(*) FROM public.farm_v1_assist_events
      WHERE helper_id = p_owner_id AND taiwan_date = v_today
    ))
  );
END; $$;

COMMIT;
