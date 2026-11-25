import {
  workshopState,
  settleWorkshopTimedRights,
  type WorkshopWarehouse,
} from './workshopRuntime';
import {
  NEUTRAL_FORMATION_BONUS_RATIOS,
  PREMIUM_FORMATION_BONUS_RATIOS,
  getFormationDefinition,
  type FormationBonusRatios,
} from './formationCatalog';

export {
  PREMIUM_FORMATION_ID,
  PREMIUM_FORMATION_PRICE_CRYSTALS,
} from './formationCatalog';

/**
 * FORMATION-EFFECT-001 — 太虛星河大陣 permanent benefits.
 * Ratios are integer numerator/denominator pairs so every settlement stays in
 * exact integer arithmetic (floating point 1.15 would round 20 crops up to 24).
 */
export type FormationBonuses = FormationBonusRatios;
export { type FormationBonusRatios } from './formationCatalog';

export const NEUTRAL_FORMATION_BONUSES: FormationBonuses =
  NEUTRAL_FORMATION_BONUS_RATIOS;
export const PREMIUM_FORMATION_BONUSES: FormationBonuses =
  PREMIUM_FORMATION_BONUS_RATIOS;

/**
 * Benefits only apply while a permanent formation is owned and switched on.
 * The equipped formation supplies its own tier ratios, so a player who owns
 * several formations always gets exactly the one that is equipped.
 * Timed rights are settled first so an expired entry can never contribute.
 */
export function formationBonuses(
  warehouse: WorkshopWarehouse,
  now: number,
): FormationBonuses {
  const state = workshopState(settleWorkshopTimedRights(warehouse, now));
  const active = getFormationDefinition(state.activeFormation);
  if (!active) return NEUTRAL_FORMATION_BONUSES;
  const owned = (state.formations ?? []).some(
    (f) =>
      f.id === active.id && (f.expiresAt === null || f.expiresAt > now),
  );
  return owned ? active.bonusRatios : NEUTRAL_FORMATION_BONUSES;
}

function assertQuantity(value: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(code);
}

export function applyGrowthSpeed(
  baseDurationMs: number,
  bonuses: FormationBonuses = NEUTRAL_FORMATION_BONUSES,
): number {
  if (!Number.isSafeInteger(baseDurationMs) || baseDurationMs <= 0)
    throw new Error('INVALID_GROWTH_DURATION');
  const { numerator, denominator } = bonuses.growthSpeed;
  return Math.ceil((baseDurationMs * denominator) / numerator);
}

export function applyHarvestYield(
  baseQuantity: number,
  bonuses: FormationBonuses = NEUTRAL_FORMATION_BONUSES,
): number {
  assertQuantity(baseQuantity, 'INVALID_HARVEST_QUANTITY');
  const { numerator, denominator } = bonuses.harvestYield;
  return Math.ceil((baseQuantity * numerator) / denominator);
}

export function applyCoinReward(
  baseCoins: number,
  bonuses: FormationBonuses = NEUTRAL_FORMATION_BONUSES,
): number {
  assertQuantity(baseCoins, 'INVALID_COIN_REWARD');
  const { numerator, denominator } = bonuses.coinReward;
  return Math.ceil((baseCoins * numerator) / denominator);
}

export const PET_ASSIST_BASE_RATE = { numerator: 10, denominator: 100 };

/**
 * Helper share of a successful assist harvest: ceil(owner harvest * 10%) by
 * default, ceil(owner harvest * 12%) while the helper has the formation on.
 */
export function applyPetAssistBonus(
  ownerHarvestQuantity: number,
  bonuses: FormationBonuses = NEUTRAL_FORMATION_BONUSES,
): number {
  assertQuantity(ownerHarvestQuantity, 'INVALID_HARVEST_QUANTITY');
  const { numerator, denominator } = bonuses.petAssist;
  return Math.ceil(
    (ownerHarvestQuantity *
      PET_ASSIST_BASE_RATE.numerator *
      numerator) /
      (PET_ASSIST_BASE_RATE.denominator * denominator),
  );
}
