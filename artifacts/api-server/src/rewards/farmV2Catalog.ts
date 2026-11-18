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

// Official plan names. Plan identifiers (A/B/C), pricing, payment and claim
// logic are unchanged; only the displayed name was corrected.
export const FIRST_PURCHASE_PLANS = {
  A: {
    name: '靈田初耕', priceTwd: 390, baseCrystals: 60, bonusCrystals: 60,
    gifts: [reward('spirit_sand',6),reward('jade_marrow',3),reward('double_harvest',8),
      reward('random_mystic_pot',1),reward('random_earth_pot',1)],
  },
  B: {
    name: '仙田豐穰', priceTwd: 990, baseCrystals: 180, bonusCrystals: 180,
    gifts: [reward('spirit_sand',18),reward('jade_marrow',9),reward('double_harvest',24),
      reward('random_heaven_pot_distinct',2)],
  },
  C: {
    name: '神田天賜', priceTwd: 1790, baseCrystals: 360, bonusCrystals: 360,
    gifts: [reward('spirit_sand',36),reward('jade_marrow',18),reward('double_harvest',48),
      reward('random_sacred_pot_distinct',2)],
  },
} as const;

/** First-purchase accounting contract. A, B and C may each be bought once, independently. */
export const FIRST_PURCHASE_ACCOUNTING = {
  planPurchaseLimitPerAccount: 1,
  purchaseOrderIndependent: true,
  baseCrystalsCredit: 'payment_confirmed',
  baseCrystalsCountTowardPaidMilestones: true,
  bonusCrystalsLedgerType: 'gift_crystals',
  bonusCrystalsCountTowardPaidMilestones: false,
  bonusDays: [1, 2, 3],
  dayOneAvailable: 'payment_confirmed',
  nextDayBoundary: 'Asia/Taipei 05:00',
  unclaimedGiftsExpire: false,
} as const;

/** Day-one to day-three claimable bonuses; base crystals are NOT included here. */
export const FIRST_PURCHASE_DAILY_GIFTS: Record<keyof typeof FIRST_PURCHASE_PLANS, readonly (readonly Reward[])[]> = {
  A: [
    [reward('gift_crystals',20), reward('spirit_sand',6), reward('random_mystic_pot',1)],
    [reward('gift_crystals',20), reward('jade_marrow',3), reward('double_harvest',4)],
    [reward('gift_crystals',20), reward('double_harvest',4), reward('random_earth_pot',1)],
  ],
  B: [
    [reward('gift_crystals',60), reward('spirit_sand',18), reward('random_heaven_pot_distinct',1)],
    [reward('gift_crystals',60), reward('jade_marrow',9), reward('double_harvest',12)],
    [reward('gift_crystals',60), reward('double_harvest',12), reward('random_heaven_pot_distinct',1)],
  ],
  C: [
    [reward('gift_crystals',120), reward('spirit_sand',36), reward('random_sacred_pot_distinct',1)],
    [reward('gift_crystals',120), reward('jade_marrow',18), reward('double_harvest',24)],
    [reward('gift_crystals',120), reward('double_harvest',24), reward('random_sacred_pot_distinct',1)],
  ],
};

/** Paid milestones use purchased base crystals only, never gifted crystals. */
export const PAID_CRYSTAL_MILESTONES = {
  field4: 100, field5: 300, field6: 600, divinePet: 799, dedicatedFarmer: 999,
} as const;

for (const planId of Object.keys(FIRST_PURCHASE_PLANS) as (keyof typeof FIRST_PURCHASE_PLANS)[]) {
  const plan = FIRST_PURCHASE_PLANS[planId];
  const days = FIRST_PURCHASE_DAILY_GIFTS[planId];
  if (days.length !== 3 || days.reduce((sum, gifts) => sum + gifts.filter(g => g.item === 'gift_crystals').reduce((n,g) => n + g.quantity,0),0) !== plan.bonusCrystals) {
    throw new Error('INVALID_FIRST_PURCHASE_BONUS_DISTRIBUTION');
  }
  const totals = new Map<string,number>();
  for (const gift of days.flat()) {
    if (gift.item !== 'gift_crystals') totals.set(gift.item, (totals.get(gift.item) ?? 0) + gift.quantity);
  }
  for (const gift of plan.gifts) {
    if (totals.get(gift.item) !== gift.quantity) throw new Error('INVALID_FIRST_PURCHASE_GIFT_TOTAL');
    totals.delete(gift.item);
  }
  if (totals.size) throw new Error('UNEXPECTED_FIRST_PURCHASE_GIFT');
}

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
