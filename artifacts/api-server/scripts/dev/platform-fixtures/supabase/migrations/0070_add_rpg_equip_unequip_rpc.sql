BEGIN;

CREATE OR REPLACE FUNCTION platform.equip_rpg_item(
  p_character_id uuid,
  p_instance_id uuid,
  p_operation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing platform.rpg_equipment_operations;
  v_slot text;
  v_result jsonb;
BEGIN
  IF p_character_id IS NULL OR p_instance_id IS NULL
     OR char_length(btrim(coalesce(p_operation_id,''))) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'RPG_EQUIPMENT_INVALID_OPERATION';
  END IF;

  SELECT * INTO v_existing FROM platform.rpg_equipment_operations
  WHERE character_id=p_character_id AND operation_id=btrim(p_operation_id);
  IF FOUND THEN
    IF v_existing.operation_type <> 'equip' OR v_existing.instance_id IS DISTINCT FROM p_instance_id THEN
      RAISE EXCEPTION 'RPG_EQUIPMENT_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus','duplicate');
  END IF;

  SELECT equipment_slot INTO v_slot
  FROM platform.rpg_item_instances
  WHERE id=p_instance_id AND character_id=p_character_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RPG_EQUIPMENT_NOT_OWNED'; END IF;

  INSERT INTO platform.rpg_equipment_loadout(character_id,equipment_slot,instance_id,updated_at)
  VALUES(p_character_id,v_slot,p_instance_id,now())
  ON CONFLICT(character_id,equipment_slot)
  DO UPDATE SET instance_id=EXCLUDED.instance_id, updated_at=now();

  v_result:=jsonb_build_object(
    'resultStatus','created','operationType','equip',
    'characterId',p_character_id::text,'instanceId',p_instance_id::text,'slot',v_slot
  );
  INSERT INTO platform.rpg_equipment_operations(
    character_id,operation_id,operation_type,instance_id,equipment_slot,result
  ) VALUES(p_character_id,btrim(p_operation_id),'equip',p_instance_id,v_slot,v_result);

  INSERT INTO platform.rpg_item_instance_events(
    character_id,instance_id,event_type,idempotency_key,payload
  ) VALUES(p_character_id,p_instance_id,'equipped',btrim(p_operation_id),
    jsonb_build_object('slot',v_slot));

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION platform.unequip_rpg_item(
  p_character_id uuid,
  p_equipment_slot text,
  p_operation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing platform.rpg_equipment_operations;
  v_instance_id uuid;
  v_result jsonb;
BEGIN
  IF p_character_id IS NULL
     OR p_equipment_slot NOT IN ('weapon','helmet','armor','legs','shoes','gloves')
     OR char_length(btrim(coalesce(p_operation_id,''))) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'RPG_EQUIPMENT_INVALID_OPERATION';
  END IF;

  SELECT * INTO v_existing FROM platform.rpg_equipment_operations
  WHERE character_id=p_character_id AND operation_id=btrim(p_operation_id);
  IF FOUND THEN
    IF v_existing.operation_type <> 'unequip' OR v_existing.equipment_slot IS DISTINCT FROM p_equipment_slot THEN
      RAISE EXCEPTION 'RPG_EQUIPMENT_IDEMPOTENCY_CONFLICT';
    END IF;
    RETURN v_existing.result || jsonb_build_object('resultStatus','duplicate');
  END IF;

  SELECT instance_id INTO v_instance_id
  FROM platform.rpg_equipment_loadout
  WHERE character_id=p_character_id AND equipment_slot=p_equipment_slot
  FOR UPDATE;

  DELETE FROM platform.rpg_equipment_loadout
  WHERE character_id=p_character_id AND equipment_slot=p_equipment_slot;

  v_result:=jsonb_build_object(
    'resultStatus','created','operationType','unequip',
    'characterId',p_character_id::text,'instanceId',
    CASE WHEN v_instance_id IS NULL THEN NULL ELSE to_jsonb(v_instance_id::text) END,
    'slot',p_equipment_slot
  );

  INSERT INTO platform.rpg_equipment_operations(
    character_id,operation_id,operation_type,instance_id,equipment_slot,result
  ) VALUES(p_character_id,btrim(p_operation_id),'unequip',v_instance_id,p_equipment_slot,v_result);

  IF v_instance_id IS NOT NULL THEN
    INSERT INTO platform.rpg_item_instance_events(
      character_id,instance_id,event_type,idempotency_key,payload
    ) VALUES(p_character_id,v_instance_id,'unequipped',btrim(p_operation_id),
      jsonb_build_object('slot',p_equipment_slot));
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION platform.equip_rpg_item(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.equip_rpg_item(uuid,uuid,text) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION platform.equip_rpg_item(uuid,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION platform.unequip_rpg_item(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform.unequip_rpg_item(uuid,text,text) FROM anon,authenticated;
GRANT EXECUTE ON FUNCTION platform.unequip_rpg_item(uuid,text,text) TO service_role;

COMMIT;
