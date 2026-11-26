BEGIN;

CREATE OR REPLACE FUNCTION public.farm_v1_friend_read_fields(
  p_viewer_id uuid,
  p_owner_id uuid,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $friend_fields_final$
BEGIN
  IF p_viewer_id IS NULL OR p_owner_id IS NULL OR p_viewer_id=p_owner_id THEN RAISE EXCEPTION 'FRIEND_FIELDS_NOT_ALLOWED'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.platform_friendships
    WHERE user_a_id=least(p_viewer_id,p_owner_id) AND user_b_id=greatest(p_viewer_id,p_owner_id) AND status='active')
  THEN RAISE EXCEPTION 'FRIEND_FIELDS_NOT_ALLOWED'; END IF;

  PERFORM public.farm_v1_read_runtime(p_owner_id,p_now);

  RETURN jsonb_build_object('ownerId',p_owner_id::text,'lands',COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'landIndex',land.land_index,
      'unlocked',land.unlocked_at IS NOT NULL,
      'cropId',land.planted_crop_id,
      'cropQuantity',land.planted_quantity,
      'isMature',CASE land.planted_crop_id
        WHEN 'yao-jin-su' THEN p_now>=land.planted_at+interval '4 hours'
        WHEN 'yue-hai-tan' THEN p_now>=land.planted_at+interval '6 hours'
        WHEN 'chi-xue-shen' THEN p_now>=land.planted_at+interval '8 hours'
        WHEN 'tian-shu-man' THEN p_now>=land.planted_at+interval '10 hours'
        WHEN 'tai-wei-lian' THEN p_now>=land.planted_at+interval '12 hours'
        WHEN 'hun-dun-jing-hua' THEN p_now>=land.planted_at+interval '60 hours'
        ELSE false END,
      'assistAvailable',land.planted_quantity>0 AND CASE land.planted_crop_id
        WHEN 'yao-jin-su' THEN p_now>=land.planted_at+interval '4 hours'
        WHEN 'yue-hai-tan' THEN p_now>=land.planted_at+interval '6 hours'
        WHEN 'chi-xue-shen' THEN p_now>=land.planted_at+interval '8 hours'
        WHEN 'tian-shu-man' THEN p_now>=land.planted_at+interval '10 hours'
        WHEN 'tai-wei-lian' THEN p_now>=land.planted_at+interval '12 hours'
        WHEN 'hun-dun-jing-hua' THEN p_now>=land.planted_at+interval '60 hours'
        ELSE false END,
      'borrowAvailable',land.land_index BETWEEN 2 AND 5 AND land.planted_quantity>1 AND CASE land.planted_crop_id
        WHEN 'yue-hai-tan' THEN p_now>=land.planted_at+interval '7 hours'
        WHEN 'chi-xue-shen' THEN p_now>=land.planted_at+interval '9 hours'
        WHEN 'tian-shu-man' THEN p_now>=land.planted_at+interval '11 hours'
        WHEN 'tai-wei-lian' THEN p_now>=land.planted_at+interval '13 hours'
        ELSE false END,
      'borrowProtectionUntil',CASE
        WHEN land.land_index BETWEEN 2 AND 5 AND land.planted_at IS NOT NULL THEN land.planted_at+CASE land.planted_crop_id
          WHEN 'yue-hai-tan' THEN interval '7 hours'
          WHEN 'chi-xue-shen' THEN interval '9 hours'
          WHEN 'tian-shu-man' THEN interval '11 hours'
          WHEN 'tai-wei-lian' THEN interval '13 hours'
          ELSE interval '0' END
        ELSE NULL END,
      'actionLockedToday',false
    ) ORDER BY land.land_index) FROM public.farm_v1_lands land WHERE land.owner_id=p_owner_id
  ),'[]'::jsonb));
END; $friend_fields_final$;

REVOKE ALL ON FUNCTION public.farm_v1_friend_read_fields(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_friend_read_fields(uuid,uuid,timestamptz) TO service_role;

COMMIT;
