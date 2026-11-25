BEGIN;

ALTER TABLE platform.rpg_life_reward_master
  ADD CONSTRAINT rpg_life_reward_master_item_key_fkey
  FOREIGN KEY (item_key)
  REFERENCES platform.rpg_item_master(item_key)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE platform.rpg_life_reward_master
  VALIDATE CONSTRAINT rpg_life_reward_master_item_key_fkey;

CREATE OR REPLACE FUNCTION platform.assert_rpg_gathering_reward_item_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $$
DECLARE v_item platform.rpg_item_master;
BEGIN
 SELECT * INTO v_item FROM platform.rpg_item_master WHERE item_key=NEW.item_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'RPG_LIFE_REWARD_ITEM_NOT_FOUND'; END IF;
 IF v_item.item_type<>'MATERIAL'
   OR v_item.gathering_skill IS DISTINCT FROM NEW.skill_key
   OR v_item.gathering_tier IS DISTINCT FROM NEW.work_tier
 THEN RAISE EXCEPTION 'RPG_LIFE_REWARD_ITEM_MISMATCH'; END IF;
 RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_rpg_gathering_reward_item_match ON platform.rpg_life_reward_master;
CREATE TRIGGER trg_rpg_gathering_reward_item_match
BEFORE INSERT OR UPDATE OF item_key,skill_key,work_tier
ON platform.rpg_life_reward_master
FOR EACH ROW EXECUTE FUNCTION platform.assert_rpg_gathering_reward_item_match();

REVOKE ALL ON FUNCTION platform.assert_rpg_gathering_reward_item_match() FROM PUBLIC,anon,authenticated;

COMMENT ON CONSTRAINT rpg_life_reward_master_item_key_fkey ON platform.rpg_life_reward_master IS
 'Every life reward item must exist in the canonical RPG item master.';
COMMENT ON FUNCTION platform.assert_rpg_gathering_reward_item_match() IS
 'Rejects ghost or mismatched gathering rewards: item skill and tier must match reward skill and tier.';

COMMIT;
