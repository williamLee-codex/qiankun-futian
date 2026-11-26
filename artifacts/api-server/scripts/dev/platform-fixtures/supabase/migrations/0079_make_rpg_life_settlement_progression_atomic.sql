BEGIN;

ALTER TABLE platform.rpg_life_dispatches
  ADD COLUMN IF NOT EXISTS ability_advanced_at timestamptz;

CREATE OR REPLACE FUNCTION platform.settle_rpg_life_dispatch(
  p_character_id uuid,
  p_dispatch_id uuid,
  p_operation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
 v_dispatch platform.rpg_life_dispatches;
 v_reward platform.rpg_life_reward_master;
 v_quantity integer; v_inventory_changes jsonb; v_economy jsonb;
 v_settled_at timestamptz; v_ability_value integer;
BEGIN
 IF p_character_id IS NULL OR p_dispatch_id IS NULL
   OR char_length(btrim(coalesce(p_operation_id,''))) NOT BETWEEN 1 AND 160
 THEN RAISE EXCEPTION 'RPG_LIFE_INVALID_SETTLEMENT'; END IF;

 SELECT * INTO v_dispatch FROM platform.rpg_life_dispatches
 WHERE id=p_dispatch_id AND character_id=p_character_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'RPG_LIFE_DISPATCH_NOT_FOUND'; END IF;

 IF v_dispatch.status='COMPLETED' THEN
   IF v_dispatch.settlement_operation_id=btrim(p_operation_id) THEN
     SELECT skill_value INTO v_ability_value FROM platform.rpg_character_life_abilities
     WHERE character_id=p_character_id AND skill_key=v_dispatch.skill_key;
     RETURN jsonb_build_object('resultStatus','duplicate','dispatchId',v_dispatch.id::text,
       'settledAt',v_dispatch.settled_at,'abilityValue',v_ability_value);
   END IF;
   RAISE EXCEPTION 'RPG_LIFE_SETTLEMENT_CONFLICT';
 END IF;
 IF v_dispatch.status<>'ACTIVE' THEN RAISE EXCEPTION 'RPG_LIFE_DISPATCH_NOT_ACTIVE'; END IF;
 IF now()<v_dispatch.completes_at THEN RAISE EXCEPTION 'RPG_LIFE_DISPATCH_NOT_READY'; END IF;

 SELECT * INTO v_reward FROM platform.rpg_life_reward_master
 WHERE work_id=v_dispatch.work_id AND skill_key=v_dispatch.skill_key AND work_tier=v_dispatch.work_tier;
 IF NOT FOUND THEN RAISE EXCEPTION 'RPG_LIFE_REWARD_NOT_CONFIGURED'; END IF;

 v_quantity:=CASE v_dispatch.qualification WHEN 'GENERAL' THEN v_reward.general_quantity
   WHEN 'PROFESSIONAL' THEN v_reward.professional_quantity WHEN 'MASTER' THEN v_reward.master_quantity END;
 IF v_quantity IS NULL OR v_quantity<=0 THEN RAISE EXCEPTION 'RPG_LIFE_REWARD_INVALID'; END IF;

 v_inventory_changes:=jsonb_build_array(jsonb_build_object(
   'itemKey',v_reward.item_key,'itemClass',v_reward.item_class,'direction','credit','quantity',v_quantity));
 v_economy:=platform.settle_rpg_economy(p_character_id,'life-dispatch:'||v_dispatch.id::text,
   'LIFE_DISPATCH',v_dispatch.id::text,'[]'::jsonb,v_inventory_changes);

 v_settled_at:=now();
 UPDATE platform.rpg_life_dispatches SET status='COMPLETED',settled_at=v_settled_at,
   settlement_operation_id=btrim(p_operation_id) WHERE id=v_dispatch.id;

 v_ability_value:=platform.advance_rpg_life_ability(p_character_id,v_dispatch.skill_key,v_dispatch.id);

 UPDATE platform.rpg_life_dispatches SET ability_advanced_at=v_settled_at WHERE id=v_dispatch.id;

 RETURN jsonb_build_object('resultStatus','created','dispatchId',v_dispatch.id::text,
   'settledAt',v_settled_at,'abilityValue',v_ability_value,
   'reward',jsonb_build_object('itemKey',v_reward.item_key,'quantity',v_quantity,'qualification',v_dispatch.qualification),
   'economy',v_economy);
END;
$$;

COMMENT ON COLUMN platform.rpg_life_dispatches.ability_advanced_at IS
 'Set only when the same atomic settlement that completes this dispatch also advances its life ability.';
COMMENT ON FUNCTION platform.settle_rpg_life_dispatch(uuid,uuid,text) IS
 'Atomic trusted settlement: reward credit, dispatch completion, and +1 used life ability. Any failure rolls back all steps.';

COMMIT;
