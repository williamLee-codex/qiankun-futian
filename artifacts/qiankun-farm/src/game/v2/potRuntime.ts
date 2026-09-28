import type { FarmLandId } from './canonicalLandData';

export type PotGrade = '黃' | '玄' | '地' | '天' | '仙' | '神';

export const POT_GRADES: readonly PotGrade[] = ['黃', '玄', '地', '天', '仙', '神'];

export interface PotGradeCost {
  coins: number;
}

export const POT_GRADE_COSTS: Readonly<Record<PotGrade, PotGradeCost>> = {
  黃: { coins: 3 },
  玄: { coins: 7 },
  地: { coins: 20 },
  天: { coins: 60 },
  仙: { coins: 200 },
  神: { coins: 600 },
};

export const POT_FIRST_UNLOCK_REWARDS: Readonly<Record<PotGrade, number>> = {
  黃: 15,
  玄: 30,
  地: 60,
  天: 90,
  仙: 150,
  神: 300,
};

export interface PotItem {
  speciesLandId: FarmLandId;
  grade: PotGrade;
}

export function nextPotGrade(grade: PotGrade): PotGrade | null {
  const index = POT_GRADES.indexOf(grade);
  return index < 0 || index === POT_GRADES.length - 1 ? null : POT_GRADES[index + 1];
}

/**
 * Number of same-species, same-grade source pots required for one next grade.
 * Normal crops: 3→3→3→3→3, so one 神 requires 3^6 = 729 base crops.
 * Chaos: 黃 uses 3 crops; subsequent upgrades use 2 same-grade pots,
 * so one 神 requires 3*2^5 = 96 crops.
 */
export function sourcePotCountForUpgrade(speciesLandId: FarmLandId, fromGrade: PotGrade): number {
  if (fromGrade === '神') return 0;
  return speciesLandId === 6 ? 2 : 3;
}

export function baseCropCountForYellow(speciesLandId: FarmLandId): number {
  return 3;
}

export function baseCropCountForGodGrade(speciesLandId: FarmLandId): number {
  return speciesLandId === 6 ? 96 : 729;
}

export interface PotUpgradeRequest {
  speciesLandId: FarmLandId;
  fromGrade: PotGrade;
  sourceCount: number;
  coinsAvailable: number;
}

/**
 * Validates exactly one manual one-grade upgrade. Material requirements are
 * intentionally supplied/settled by the transaction layer because Canonical
 * specifies that materials are required but their per-grade quantities belong
 * to Master Data rather than being inferred here.
 */
export function validatePotUpgrade(request: PotUpgradeRequest): {
  toGrade: PotGrade;
  sourcePotsConsumed: number;
  coinsConsumed: number;
} {
  const toGrade = nextPotGrade(request.fromGrade);
  if (!toGrade) throw new Error('POT_ALREADY_MAX_GRADE');

  const requiredSources = sourcePotCountForUpgrade(request.speciesLandId, request.fromGrade);
  if (request.sourceCount < requiredSources) throw new Error('INSUFFICIENT_SAME_GRADE_POTS');

  const coinsConsumed = POT_GRADE_COSTS[toGrade].coins;
  if (request.coinsAvailable < coinsConsumed) throw new Error('INSUFFICIENT_COINS');

  return { toGrade, sourcePotsConsumed: requiredSources, coinsConsumed };
}
