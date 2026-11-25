BEGIN;

-- Retire the immediately previous overload so no caller can bypass the live
-- milestone entitlement flags introduced by this migration.
DROP FUNCTION IF EXISTS public.farm_v1_borrow_luck(uuid,uuid,text,timestamptz);
DROP FUNCTION IF EXISTS public.farm_v1_borrow_luck(uuid,uuid,text,numeric,numeric,timestamptz);

-- Final V1 borrow contract:
-- lands 2-5 only; mature + 1h protection; highest quantity then lower index;
-- 30% floor, guarded Suanni 21% floor; guarded Qilin 50% blocks the whole action;
-- guarded Diting 30% enables at most one second field; one successful action counts once.
CREATE OR REPLACE FUNCTION public.farm_v1_borrow_luck(
  p_helper_id uuid,
  p_owner_id uuid,
  p_idempotency_key text,
  p_diting_entitled boolean,
  p_qilin_entitled boolean,
  p_owner_exclusive_farmer_entitled boolean,
  p_owner_land4_entitled boolean,
  p_owner_land5_entitled boolean,
  p_owner_land6_entitled boolean,
  p_diting_roll numeric,
  p_qilin_roll numeric,
  p_now timestamptz DEFAULT now()
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $borrow_final$
DECLARE
  v_today date:=timezone('Asia/Taipei',p_now)::date;
  v_land record; v_event_id uuid; v_first_land smallint;
  v_helper integer; v_owner integer; v_field_count integer:=0;
  v_total_helper integer:=0; v_total_owner integer:=0;
  v_loss numeric:=0.30; v_max_fields integer:=1;
  v_owner_pet text; v_owner_fed timestamptz; v_helper_pet text; v_helper_fed timestamptz;
  v_attempt integer;
BEGIN
  IF p_helper_id IS NULL OR p_owner_id IS NULL OR p_helper_id=p_owner_id OR nullif(btrim(p_idempotency_key),'') IS NULL
    OR p_diting_entitled IS NULL OR p_qilin_entitled IS NULL
    OR p_owner_exclusive_farmer_entitled IS NULL OR p_owner_land4_entitled IS NULL
    OR p_owner_land5_entitled IS NULL OR p_owner_land6_entitled IS NULL
    OR p_diting_roll<0 OR p_diting_roll>=1 OR p_qilin_roll<0 OR p_qilin_roll>=1
  THEN RAISE EXCEPTION 'BORROW_NOT_ALLOWED'; END IF;

  -- Serialize idempotency and quota checks for this helper.
  -- UNIQUE(helper_id,idempotency_key) remains the final database backstop.
  -- Lock both participants in deterministic UUID order to prevent reciprocal
  -- friend actions from deadlocking while farmer settlement locks the owner.
  IF p_helper_id <= p_owner_id THEN
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_helper_id FOR UPDATE;
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;
  ELSE
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_owner_id FOR UPDATE;
    PERFORM 1 FROM public.farm_v1_profiles WHERE owner_id=p_helper_id FOR UPDATE;
  END IF;
  IF EXISTS(SELECT 1 FROM public.farm_v1_friend_action_events WHERE helper_id=p_helper_id AND idempotency_key=p_idempotency_key)
  THEN RETURN jsonb_build_object('status','duplicate'); END IF;


  IF NOT EXISTS(SELECT 1 FROM public.platform_friendships WHERE user_a_id=least(p_helper_id,p_owner_id) AND user_b_id=greatest(p_helper_id,p_owner_id) AND status='active')
  THEN RAISE EXCEPTION 'BORROW_NOT_ALLOWED'; END IF;

  -- Only successful historical actions consume the daily quota. A Qilin block writes no event.
  IF public.farm_v1_borrow_count_today(p_helper_id,p_now)>=5
  THEN RAISE EXCEPTION 'ACTION_DAILY_LIMIT'; END IF;

  PERFORM public.farm_v1_read_runtime(p_helper_id,p_now);

  SELECT resident_pet_id,fed_at INTO v_owner_pet,v_owner_fed FROM public.farm_v1_pet_care WHERE owner_id=p_owner_id;
  SELECT resident_pet_id,fed_at INTO v_helper_pet,v_helper_fed FROM public.farm_v1_pet_care WHERE owner_id=p_helper_id;

  IF p_qilin_entitled AND v_owner_pet='qian-kun-qi-lin' AND v_owner_fed IS NOT NULL AND p_now<v_owner_fed+interval '24 hours' AND p_qilin_roll<0.50
  THEN RETURN jsonb_build_object('status','blocked','blockedBy','qian-kun-qi-lin','counted',false); END IF;

  IF v_owner_pet='bi-xie-suan-ni' AND v_owner_fed IS NOT NULL AND p_now<v_owner_fed+interval '24 hours' THEN v_loss:=0.21; END IF;
  IF p_diting_entitled AND v_helper_pet='shi-shi-di-ting' AND v_helper_fed IS NOT NULL AND p_now<v_helper_fed+interval '24 hours' AND p_diting_roll<0.30 THEN v_max_fields:=2; END IF;

  -- Select and lock one field at a time. If Diting activates, the second field is
  -- re-ranked only after the first field mutation has completed.
  FOR v_attempt IN 1..v_max_fields LOOP
    SELECT land.* INTO v_land FROM public.farm_v1_lands land
    WHERE land.owner_id=p_owner_id
      AND land.land_index BETWEEN 2 AND 5
      AND land.planted_quantity>1
      AND (v_first_land IS NULL OR land.land_index<>v_first_land)
      AND p_now>=land.planted_at+CASE land.planted_crop_id
        WHEN 'yue-hai-tan' THEN interval '7 hours'
        WHEN 'chi-xue-shen' THEN interval '9 hours'
        WHEN 'tian-shu-man' THEN interval '11 hours'
        WHEN 'tai-wei-lian' THEN interval '13 hours'
        ELSE interval '100 years' END
    ORDER BY land.planted_quantity DESC,land.land_index ASC
    LIMIT 1 FOR UPDATE;

    IF NOT FOUND THEN EXIT; END IF;

    v_helper:=least(floor(v_land.planted_quantity*v_loss)::integer,v_land.planted_quantity-1);
    IF v_helper<1 THEN EXIT; END IF;
    v_owner:=v_land.planted_quantity-v_helper;

    UPDATE public.farm_v1_lands
    SET planted_quantity=v_owner,updated_at=p_now
    WHERE owner_id=p_owner_id AND land_index=v_land.land_index;

    INSERT INTO public.farm_v1_inventory(owner_id,item_key,quantity)
    VALUES(p_helper_id,v_land.planted_crop_id,v_helper)
    ON CONFLICT(owner_id,item_key) DO UPDATE
    SET quantity=farm_v1_inventory.quantity+excluded.quantity,updated_at=p_now;

    IF v_first_land IS NULL THEN
      v_first_land:=v_land.land_index;
      INSERT INTO public.farm_v1_friend_action_events(
        helper_id,owner_id,land_index,action_type,crop_id,helper_crop_quantity,
        owner_crop_quantity,taiwan_date,idempotency_key,created_at
      ) VALUES(
        p_helper_id,p_owner_id,v_land.land_index,'borrow',v_land.planted_crop_id,
        v_helper,v_owner,v_today,p_idempotency_key,p_now
      ) RETURNING id INTO v_event_id;
    ELSE
      INSERT INTO public.farm_v1_friend_action_extra_lands(event_id,land_index)
      VALUES(v_event_id,v_land.land_index);
    END IF;

    v_field_count:=v_field_count+1;
    v_total_helper:=v_total_helper+v_helper;
    v_total_owner:=v_total_owner+v_owner;
  END LOOP;
  IF v_first_land IS NULL THEN RAISE EXCEPTION 'BORROW_NOT_AVAILABLE'; END IF;
  RETURN jsonb_build_object('status','created','landIndex',v_first_land,'helperCropQuantity',v_total_helper,'ownerCropQuantity',v_total_owner,'secondFieldApplied',v_field_count=2,'counted',true);
END; $borrow_final$;

REVOKE ALL ON FUNCTION public.farm_v1_borrow_luck(uuid,uuid,text,boolean,boolean,boolean,boolean,boolean,boolean,numeric,numeric,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v1_borrow_luck(uuid,uuid,text,boolean,boolean,boolean,boolean,boolean,boolean,numeric,numeric,timestamptz) TO service_role;

COMMIT;
