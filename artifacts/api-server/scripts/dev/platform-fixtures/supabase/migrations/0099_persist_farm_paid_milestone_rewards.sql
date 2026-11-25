BEGIN;

CREATE OR REPLACE FUNCTION public.farm_v1_apply_paid_milestones(
  p_owner_id uuid,
  p_land4_entitled boolean,
  p_land5_entitled boolean,
  p_diting_entitled boolean,
  p_land6_entitled boolean,
  p_qilin_entitled boolean,
  p_now timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_owner_id IS NULL
    OR p_land4_entitled IS NULL OR p_land5_entitled IS NULL
    OR p_diting_entitled IS NULL OR p_land6_entitled IS NULL
    OR p_qilin_entitled IS NULL
  THEN RAISE EXCEPTION 'FARM_PAID_MILESTONE_INVALID'; END IF;

  PERFORM public.initialize_farm_v1_runtime(p_owner_id,p_now);

  -- Milestone qualification grants persistent ownership/unlock state once.
  -- Refunds suspend entitlement elsewhere; they never erase persisted state.
  IF p_land4_entitled THEN
    UPDATE public.farm_v1_lands
    SET unlocked_at=COALESCE(unlocked_at,p_now),updated_at=p_now
    WHERE owner_id=p_owner_id AND land_index=4;
  END IF;
  IF p_land5_entitled THEN
    UPDATE public.farm_v1_lands
    SET unlocked_at=COALESCE(unlocked_at,p_now),updated_at=p_now
    WHERE owner_id=p_owner_id AND land_index=5;
  END IF;
  IF p_land6_entitled THEN
    UPDATE public.farm_v1_lands
    SET unlocked_at=COALESCE(unlocked_at,p_now),updated_at=p_now
    WHERE owner_id=p_owner_id AND land_index=6;
  END IF;

  IF p_diting_entitled THEN
    INSERT INTO public.farm_v1_owned_pets(owner_id,pet_id,obtained_at)
    VALUES(p_owner_id,'shi-shi-di-ting',p_now)
    ON CONFLICT(owner_id,pet_id) DO NOTHING;
  END IF;
  IF p_qilin_entitled THEN
    INSERT INTO public.farm_v1_owned_pets(owner_id,pet_id,obtained_at)
    VALUES(p_owner_id,'qian-kun-qi-lin',p_now)
    ON CONFLICT(owner_id,pet_id) DO NOTHING;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.farm_v1_apply_paid_milestones(uuid,boolean,boolean,boolean,boolean,boolean,timestamptz)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_apply_paid_milestones(uuid,boolean,boolean,boolean,boolean,boolean,timestamptz)
TO service_role;

COMMIT;
