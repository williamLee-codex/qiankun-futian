BEGIN;

ALTER TABLE public.farm_v1_inventory
  DROP CONSTRAINT IF EXISTS farm_v1_inventory_item_check;

ALTER TABLE public.farm_v1_inventory
  ADD CONSTRAINT farm_v1_inventory_item_check CHECK (item_key IN (
    'yao-jin-seed', 'you-ying-seed', 'zhu-sha-seed', 'yao-zi-seed',
    'fei-cui-seed', 'hun-dun-seed', 'tai-yi-wu-gu-san', 'yao-jin-su',
    'yue-hai-tan', 'chi-xue-shen', 'tian-shu-man', 'tai-wei-lian', 'hun-dun-jing-hua'
  ));

COMMIT;
