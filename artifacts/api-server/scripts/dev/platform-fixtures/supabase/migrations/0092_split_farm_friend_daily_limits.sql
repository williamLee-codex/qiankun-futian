BEGIN;

-- Final V1 quotas are independent: five successful assists AND five successful borrows per Taiwan day.
CREATE OR REPLACE FUNCTION public.farm_v1_friend_assist_count_today(p_helper_id uuid,p_now timestamptz DEFAULT now())
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(*)::integer FROM public.farm_v1_friend_action_events
  WHERE helper_id=p_helper_id AND action_type='assist' AND taiwan_date=timezone('Asia/Taipei',p_now)::date;
$$;

CREATE OR REPLACE FUNCTION public.farm_v1_borrow_count_today(p_helper_id uuid,p_now timestamptz DEFAULT now())
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(*)::integer FROM public.farm_v1_friend_action_events
  WHERE helper_id=p_helper_id AND action_type='borrow' AND taiwan_date=timezone('Asia/Taipei',p_now)::date;
$$;

REVOKE ALL ON FUNCTION public.farm_v1_friend_assist_count_today(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.farm_v1_borrow_count_today(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_friend_assist_count_today(uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.farm_v1_borrow_count_today(uuid,timestamptz) TO service_role;

COMMIT;
