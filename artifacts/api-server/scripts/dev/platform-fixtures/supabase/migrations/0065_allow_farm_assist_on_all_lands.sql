BEGIN;

-- Borrow remains restricted to lands 2-5, while assist is valid on lands 1-6.
ALTER TABLE public.farm_v1_friend_action_events
  DROP CONSTRAINT IF EXISTS farm_v1_friend_action_events_land_index_check;

ALTER TABLE public.farm_v1_friend_action_events
  ADD CONSTRAINT farm_v1_friend_action_events_land_index_check
  CHECK (
    (action_type = 'assist' AND land_index BETWEEN 1 AND 6)
    OR
    (action_type = 'borrow' AND land_index BETWEEN 2 AND 5)
  );

-- Extra lands exist only for Diting's second borrow and therefore remain 2-5.
ALTER TABLE public.farm_v1_friend_action_extra_lands
  DROP CONSTRAINT IF EXISTS farm_v1_friend_action_extra_lands_land_index_check;

ALTER TABLE public.farm_v1_friend_action_extra_lands
  ADD CONSTRAINT farm_v1_friend_action_extra_lands_land_index_check
  CHECK (land_index BETWEEN 2 AND 5);

COMMIT;
