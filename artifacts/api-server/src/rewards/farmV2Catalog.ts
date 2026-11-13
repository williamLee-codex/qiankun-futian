/** Canonical V2 reward definitions. Catalog data only; never grants rewards. */
export type Reward = Readonly<{ item: string; quantity: number }>;
const reward = (item: string, quantity: number): Reward => ({ item, quantity });

export const SIGN_IN_REWARDS: readonly Reward[] = [
  reward('coins',10), reward('spirit_sand',1), reward('instant_harvest',1),
  reward('coins',20), reward('double_harvest',1), reward('jade_marrow',1),
  reward('coins',30), reward('farm_protection_1h',2), reward('yellow_upgrade',1),
  reward('crystals',1), reward('spirit_sand',2), reward('coins',30),
  reward('instant_harvest',2), reward('double_harvest',2), reward('random_yellow_pot',1),
  reward('jade_marrow',2), reward('coins',40), reward('farm_protection_1h',3),
  reward('mystic_upgrade',1), reward('random_mystic_pot',1), reward('spirit_sand',3),
  reward('coins',50), reward('double_harvest',3), reward('jade_marrow',3),
  reward('crystals',2), reward('mystic_upgrade',1), reward('coins',60),
  reward('farm_protection_1h',5), reward('spirit_sand',5), reward('random_earth_pot',1),
] as const;

export const SIGN_IN_MAKEUP_GRANT_DAYS = [3,6,9,12,15,18,21,24,27,30] as const;
export const SIGN_IN_PERFECT_ATTENDANCE: readonly Reward[] = [
  reward('perfect_attendance_badge',1), reward('crystals',3),
  reward('coins',200), reward('spirit_sand',2), reward('jade_marrow',2),
];

export const FIRST_PURCHASE_PLANS = {
  A: {
    name: '靈泉初啟', priceTwd: 390, baseCrystals: 60, bonusCrystals: 60,
    gifts: [reward('spirit_sand',6),reward('jade_marrow',3),reward('double_harvest',8),
      reward('random_mystic_pot',1),reward('random_earth_pot',1)],
  },
  B: {
    name: '天華賜福', priceTwd: 990, baseCrystals: 180, bonusCrystals: 180,
    gifts: [reward('spirit_sand',18),reward('jade_marrow',9),reward('double_harvest',24),
      reward('random_heaven_pot_distinct',2)],
  },
  C: {
    name: '聖域至尊', priceTwd: 1790, baseCrystals: 360, bonusCrystals: 360,
    gifts: [reward('spirit_sand',36),reward('jade_marrow',18),reward('double_harvest',48),
      reward('random_sacred_pot_distinct',2)],
  },
} as const;

export const DAILY_ACTIVITY = {
  resetHourTaipei: 5,
  tasksPerDay: 6,
  activityPerTask: 20,
  maximumActivity: 120,
  milestones: [
    { activity: 30, reward: reward('coins',10) },
    { activity: 60, reward: reward('random_yellow_pot',1) },
    { activity: 100, reward: reward('spirit_sand',1) },
  ],
} as const;

if (SIGN_IN_REWARDS.length !== 30 || SIGN_IN_MAKEUP_GRANT_DAYS.length !== 10) {
  throw new Error('INVALID_SIGN_IN_CATALOG');
}
