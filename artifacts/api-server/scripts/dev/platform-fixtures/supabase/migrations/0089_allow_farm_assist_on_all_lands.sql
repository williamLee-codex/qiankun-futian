BEGIN;

-- Production may predate 0028 even when the later Farm base runtime exists.
-- Restore the Diting second-borrow relation before aligning its final constraint.
CREATE TABLE IF NOT EXISTS public.farm_v1_friend_action_extra_lands (
  event_id uuid NOT NULL REFERENCES public.farm_v1_friend_action_events(id) ON DELETE CASCADE,
  land_index smallint NOT NULL CHECK (land_index BETWEEN 2 AND 5),
  PRIMARY KEY (event_id, land_index)
);

ALTER TABLE public.farm_v1_friend_action_extra_lands ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.farm_v1_friend_action_extra_lands FROM PUBLIC, anon, authenticated;

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
