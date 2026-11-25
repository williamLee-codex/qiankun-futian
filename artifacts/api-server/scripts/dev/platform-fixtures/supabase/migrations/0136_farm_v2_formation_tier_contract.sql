BEGIN;
-- Forward after 0130. Canonical FORMATION-PREMIUM-001 three-tier pricing:
--   玄靈聚元大陣 188, 九霄造化大陣 288, 太虛星河大陣 388 (crystals).
-- A first purchase of any tier costs its full price; an upgrade costs only the
-- difference towards a strictly higher tier, so 188 -> 288 -> 388 charges
-- exactly 388 in total. The legacy 'FORMATION_PREMIUM_V2' reference keeps its
-- frozen 388 contract so already-released purchases are unaffected.
-- Only the price table changes: no ledger, grant or authorization rule moves.
CREATE OR REPLACE FUNCTION public.farm_v2_workshop_wallet_contract(p_reason text,p_reference text)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $fn$
DECLARE v_cost integer;v_reward integer;v_grade integer;v_first integer;v_currency text:='coin';
        v_from text;v_to text;v_from_cost integer;v_to_cost integer;
BEGIN
 IF p_reason='farm_pot_synthesis' AND p_reference ~ '^[1-6]:[0-5]:[01]$' THEN
  v_grade:=split_part(p_reference,':',2)::integer;v_first:=split_part(p_reference,':',3)::integer;
  v_cost:=(ARRAY[3,7,20,60,200,600])[v_grade+1];v_reward:=(ARRAY[15,30,60,90,150,300])[v_grade+1]*v_first;
 ELSIF p_reason='farm_decor_purchase' AND p_reference ~ '^DF[0-9]{3}:[01]$' THEN
  v_first:=split_part(p_reference,':',2)::integer;
  v_cost:=CASE split_part(p_reference,':',1) WHEN 'DF001' THEN 88 WHEN 'DF002' THEN 188 WHEN 'DF003' THEN 288 WHEN 'DF004' THEN 588 WHEN 'DF005' THEN 888 WHEN 'DF006' THEN 1288 WHEN 'DF007' THEN 1888 WHEN 'DF008' THEN 2888 WHEN 'DF009' THEN 3888 WHEN 'DF010' THEN 5888 WHEN 'DF011' THEN 6888 WHEN 'DF012' THEN 7888 WHEN 'DF013' THEN 8888 WHEN 'DF014' THEN 9888 WHEN 'DF015' THEN 11888 WHEN 'DF016' THEN 13888 WHEN 'DF017' THEN 15888 WHEN 'DF018' THEN 18888 ELSE NULL END;
  IF v_cost IS NULL THEN RETURN NULL; END IF;v_reward:=30*v_first;
 ELSIF p_reason='farm_mission_reward' AND p_reference ~ '^MISSION_[DW]0[1-4]:[0-9]{1,16}$' THEN
  v_cost:=0;v_reward:=CASE split_part(p_reference,':',1) WHEN 'MISSION_D01' THEN 2 WHEN 'MISSION_D02' THEN 3 WHEN 'MISSION_D03' THEN 3 WHEN 'MISSION_D04' THEN 5 WHEN 'MISSION_W01' THEN 10 WHEN 'MISSION_W02' THEN 15 WHEN 'MISSION_W03' THEN 15 WHEN 'MISSION_W04' THEN 20 END;
 ELSIF p_reason='farm_pet_food_purchase' AND p_reference ~ '^[1-9][0-9]{0,9}$' AND p_reference::bigint<=1073741823 THEN
  v_cost:=p_reference::integer*2;v_reward:=0;
 ELSIF p_reason='farm_pet_purchase' AND p_reference IN ('1','2') THEN
  v_cost:=CASE p_reference WHEN '1' THEN 300 ELSE 100 END;v_reward:=0;v_currency:=CASE p_reference WHEN '1' THEN 'coin' ELSE 'crystal' END;
 ELSIF p_reason='farm_formation_purchase' THEN
  IF p_reference='FORMATION_PREMIUM_V2' THEN
   v_cost:=388;
  ELSIF p_reference ~ '^FORMATION_PURCHASE:(FORMATION_XUANLING_188|FORMATION_JIUXIAO_288|FORMATION_PREMIUM_V2)$' THEN
   v_cost:=CASE split_part(p_reference,':',2) WHEN 'FORMATION_XUANLING_188' THEN 188 WHEN 'FORMATION_JIUXIAO_288' THEN 288 WHEN 'FORMATION_PREMIUM_V2' THEN 388 END;
  ELSIF p_reference ~ '^FORMATION_UPGRADE:(FORMATION_XUANLING_188|FORMATION_JIUXIAO_288|FORMATION_PREMIUM_V2):(FORMATION_XUANLING_188|FORMATION_JIUXIAO_288|FORMATION_PREMIUM_V2)$' THEN
   v_from:=split_part(p_reference,':',2);v_to:=split_part(p_reference,':',3);
   v_from_cost:=CASE v_from WHEN 'FORMATION_XUANLING_188' THEN 188 WHEN 'FORMATION_JIUXIAO_288' THEN 288 ELSE 388 END;
   v_to_cost:=CASE v_to WHEN 'FORMATION_XUANLING_188' THEN 188 WHEN 'FORMATION_JIUXIAO_288' THEN 288 ELSE 388 END;
   IF v_to_cost<=v_from_cost THEN RETURN NULL; END IF;
   v_cost:=v_to_cost-v_from_cost;
  ELSE
   RETURN NULL;
  END IF;
  v_reward:=0;v_currency:='crystal';
 ELSE RETURN NULL;
 END IF;
 RETURN jsonb_build_object('cost',v_cost,'reward',v_reward,'currency',v_currency);
END;
$fn$;
REVOKE ALL ON FUNCTION public.farm_v2_workshop_wallet_contract(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.farm_v2_workshop_wallet_contract(text,text) TO service_role;
COMMIT;
