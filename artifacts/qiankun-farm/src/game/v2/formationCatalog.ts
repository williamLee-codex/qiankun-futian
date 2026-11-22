/**
 * FORMATION-PREMIUM-001 / FORMATION-EFFECT-001 — 太虛星河大陣 canonical data.
 * Kept dependency-free so both the runtime planner and the effect settlement
 * can import it without a module cycle.
 */
export const PREMIUM_FORMATION_ID = 'FORMATION_PREMIUM_V2';
export const PREMIUM_FORMATION_PRICE_CRYSTALS = 388;

export interface FormationBonusRatios {
  /** +20% growth speed: duration = base * denominator/numerator */
  growthSpeed: { numerator: number; denominator: number };
  /** +15% harvest quantity */
  harvestYield: { numerator: number; denominator: number };
  /** +15% coins from crop exchange */
  coinReward: { numerator: number; denominator: number };
  /** +20% pet assist efficiency (helper share 10% -> 12%) */
  petAssist: { numerator: number; denominator: number };
}

export const PREMIUM_FORMATION_BONUS_RATIOS: FormationBonusRatios = Object.freeze({
  growthSpeed: { numerator: 120, denominator: 100 },
  harvestYield: { numerator: 115, denominator: 100 },
  coinReward: { numerator: 115, denominator: 100 },
  petAssist: { numerator: 120, denominator: 100 },
});

export const NEUTRAL_FORMATION_BONUS_RATIOS: FormationBonusRatios = Object.freeze({
  growthSpeed: { numerator: 1, denominator: 1 },
  harvestYield: { numerator: 1, denominator: 1 },
  coinReward: { numerator: 1, denominator: 1 },
  petAssist: { numerator: 1, denominator: 1 },
});
