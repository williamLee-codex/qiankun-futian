BEGIN;

CREATE OR REPLACE FUNCTION public.platform_friend_read_context(p_owner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $friend_context_final$
DECLARE v_code jsonb; v_today date:=timezone('Asia/Taipei',now())::date; v_now timestamptz:=now();
BEGIN
  v_code:=public.platform_friend_profile(p_owner_id);
  RETURN jsonb_build_object(
    'invitationCode',v_code->>'invitationCode',
    'incomingInvites',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',i.id::text,'senderId',i.sender_id::text,
        'senderDisplayName',coalesce(p.display_name,'道友 '||right(p.invitation_code,4)),
        'recipientId',i.recipient_id::text,'message',i.message,'status',i.status,
        'createdAt',i.created_at,'resolvedAt',i.resolved_at
      ) ORDER BY i.created_at DESC)
      FROM public.platform_friend_invites i JOIN public.platform_friend_profiles p ON p.owner_id=i.sender_id
      WHERE i.recipient_id=p_owner_id AND i.status='pending'
    ),'[]'::jsonb),
    'friends',COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id',f.friend_id::text,
        'displayName',coalesce(p.display_name,'道友 '||right(p.invitation_code,4)),
        'cooldownUntil',NULL,
        'assistableLandIndexes',COALESCE((
          SELECT jsonb_agg(l.land_index ORDER BY l.land_index) FROM public.farm_v1_lands l
          WHERE l.owner_id=f.friend_id AND l.planted_quantity>0 AND CASE l.planted_crop_id
            WHEN 'yao-jin-su' THEN v_now>=l.planted_at+interval '4 hours'
            WHEN 'yue-hai-tan' THEN v_now>=l.planted_at+interval '6 hours'
            WHEN 'chi-xue-shen' THEN v_now>=l.planted_at+interval '8 hours'
            WHEN 'tian-shu-man' THEN v_now>=l.planted_at+interval '10 hours'
            WHEN 'tai-wei-lian' THEN v_now>=l.planted_at+interval '12 hours'
            WHEN 'hun-dun-jing-hua' THEN v_now>=l.planted_at+interval '60 hours'
            ELSE false END
        ),'[]'::jsonb),
        'borrowableLandIndexes',COALESCE((
          SELECT jsonb_agg(l.land_index ORDER BY l.land_index) FROM public.farm_v1_lands l
          WHERE l.owner_id=f.friend_id AND l.land_index BETWEEN 2 AND 5 AND l.planted_quantity>1 AND CASE l.planted_crop_id
            WHEN 'yue-hai-tan' THEN v_now>=l.planted_at+interval '7 hours'
            WHEN 'chi-xue-shen' THEN v_now>=l.planted_at+interval '9 hours'
            WHEN 'tian-shu-man' THEN v_now>=l.planted_at+interval '11 hours'
            WHEN 'tai-wei-lian' THEN v_now>=l.planted_at+interval '13 hours'
            ELSE false END
        ),'[]'::jsonb)
      ))
      FROM (
        SELECT CASE WHEN user_a_id=p_owner_id THEN user_b_id ELSE user_a_id END friend_id
        FROM public.platform_friendships WHERE status='active' AND p_owner_id IN(user_a_id,user_b_id)
      ) f JOIN public.platform_friend_profiles p ON p.owner_id=f.friend_id
    ),'[]'::jsonb),
    'remainingDailyAssists',greatest(0,5-public.farm_v1_friend_assist_count_today(p_owner_id,v_now)),
    'remainingDailyBorrows',greatest(0,5-public.farm_v1_borrow_count_today(p_owner_id,v_now))
  );
END; $friend_context_final$;

REVOKE ALL ON FUNCTION public.platform_friend_read_context(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_friend_read_context(uuid) TO service_role;

COMMIT;
