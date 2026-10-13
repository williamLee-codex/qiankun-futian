-- Durable Farm V2 mission claim journal fields and fixed material rewards.
-- Apply only after reviewing the target database and backend connection role.
BEGIN;
ALTER TABLE public.farm_v2_mutation
  ADD COLUMN mission_id text,
  ADD COLUMN mission_period_start timestamptz,
  ADD COLUMN mission_material_id text,
  ADD COLUMN mission_material_quantity integer;

ALTER TABLE public.farm_v2_mutation
  ADD CONSTRAINT farm_v2_mutation_mission_claim_check CHECK (
    (
      mission_id IS NULL
      AND mission_period_start IS NULL
      AND mission_material_id IS NULL
      AND mission_material_quantity IS NULL
    )
    OR
    (
      mission_id IS NOT NULL
      AND mission_material_id IS NOT NULL
      AND mission_material_quantity IS NOT NULL
      AND wallet_direction IS NOT NULL
      AND wallet_currency IS NOT NULL
      AND wallet_amount IS NOT NULL
      AND mission_id IN (
        'MISSION_D01','MISSION_D02','MISSION_D03','MISSION_D04',
        'MISSION_W01','MISSION_W02','MISSION_W03','MISSION_W04'
      )
      AND mission_period_start IS NOT NULL
      AND mission_material_id = CASE
        WHEN mission_id LIKE 'MISSION_D%' THEN '蘊靈砂'
        ELSE '九霄玉髓'
      END
      AND mission_material_quantity = CASE
        WHEN mission_id = 'MISSION_D04' THEN 3
        ELSE 1
      END
      AND wallet_direction = 'credit'
      AND wallet_currency = 'coin'
      AND wallet_amount = CASE mission_id
        WHEN 'MISSION_D01' THEN 2
        WHEN 'MISSION_D02' THEN 3
        WHEN 'MISSION_D03' THEN 3
        WHEN 'MISSION_D04' THEN 5
        WHEN 'MISSION_W01' THEN 10
        WHEN 'MISSION_W02' THEN 15
        WHEN 'MISSION_W03' THEN 15
        WHEN 'MISSION_W04' THEN 20
      END
      AND action = 'mission-claim:' || mission_id
    )
  );

CREATE UNIQUE INDEX farm_v2_mutation_mission_period_unique
  ON public.farm_v2_mutation(user_id, mission_id, mission_period_start)
  WHERE mission_id IS NOT NULL;
COMMIT;
