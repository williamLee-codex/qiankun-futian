/**
 * FORMATION-PREMIUM-001 / FORMATION-EFFECT-001 — 玄天陣典 canonical data.
 * Kept dependency-free so both the runtime planner and the effect settlement
 * can import it without a module cycle.
 */
export const PREMIUM_FORMATION_ID = 'FORMATION_PREMIUM_V2';
export const PREMIUM_FORMATION_PRICE_CRYSTALS = 388;

export interface FormationBonusRatios {
  /** growth speed: duration = base * denominator/numerator */
  growthSpeed: { numerator: number; denominator: number };
  /** harvest quantity */
  harvestYield: { numerator: number; denominator: number };
  /** coins from crop exchange */
  coinReward: { numerator: number; denominator: number };
  /** pet assist efficiency (helper share 10% base -> base * numerator/denominator) */
  petAssist: { numerator: number; denominator: number };
}

export interface FormationDefinition {
  id: string;
  name: string;
  /** Permanent purchase price in crystals. */
  priceCrystals: number;
  bonusRatios: FormationBonusRatios;
}

function ratios(
  growthSpeed: number,
  harvestYield: number,
  coinReward: number,
  petAssist: number,
): FormationBonusRatios {
  return Object.freeze({
    growthSpeed: { numerator: growthSpeed, denominator: 100 },
    harvestYield: { numerator: harvestYield, denominator: 100 },
    coinReward: { numerator: coinReward, denominator: 100 },
    petAssist: { numerator: petAssist, denominator: 100 },
  });
}

/**
 * Ascending tiers. The 388 id is the id already persisted in player warehouses,
 * so it must never change; upgrades only ever move towards a higher price.
 */
export const FORMATION_DEFINITIONS: readonly FormationDefinition[] = Object.freeze([
  Object.freeze({
    id: 'FORMATION_XUANLING_188',
    name: '玄靈聚元大陣',
    priceCrystals: 188,
    bonusRatios: ratios(108, 106, 106, 108),
  }),
  Object.freeze({
    id: 'FORMATION_JIUXIAO_288',
    name: '九霄造化大陣',
    priceCrystals: 288,
    bonusRatios: ratios(112, 109, 109, 112),
  }),
  Object.freeze({
    id: PREMIUM_FORMATION_ID,
    name: '太虛星河大陣',
    priceCrystals: PREMIUM_FORMATION_PRICE_CRYSTALS,
    bonusRatios: ratios(120, 115, 115, 120),
  }),
]);

export const NEUTRAL_FORMATION_BONUS_RATIOS: FormationBonusRatios = Object.freeze({
  growthSpeed: { numerator: 1, denominator: 1 },
  harvestYield: { numerator: 1, denominator: 1 },
  coinReward: { numerator: 1, denominator: 1 },
  petAssist: { numerator: 1, denominator: 1 },
});

export const PREMIUM_FORMATION_BONUS_RATIOS: FormationBonusRatios =
  FORMATION_DEFINITIONS[FORMATION_DEFINITIONS.length - 1].bonusRatios;

export function getFormationDefinition(
  id: string | null | undefined,
): FormationDefinition | null {
  if (!id) return null;
  return FORMATION_DEFINITIONS.find((f) => f.id === id) ?? null;
}

/** Highest priced permanent formation the player currently holds. */
export function highestOwnedFormation(
  formations: readonly { id: string; expiresAt: number | null }[] | undefined,
  now: number,
): FormationDefinition | null {
  let best: FormationDefinition | null = null;
  for (const entry of formations ?? []) {
    if (entry.expiresAt !== null && entry.expiresAt <= now) continue;
    const definition = getFormationDefinition(entry.id);
    if (definition && (!best || definition.priceCrystals > best.priceCrystals))
      best = definition;
  }
  return best;
}

/**
 * Wallet reference the Core contract prices. The legacy 388 reference stays
 * byte-identical so already-released purchases keep their frozen contract.
 */
export function formationPurchaseReference(
  targetId: string,
  upgradeFromId: string | null,
): string {
  if (upgradeFromId) return `FORMATION_UPGRADE:${upgradeFromId}:${targetId}`;
  return targetId === PREMIUM_FORMATION_ID
    ? PREMIUM_FORMATION_ID
    : `FORMATION_PURCHASE:${targetId}`;
}

/** Upgrade only ever pays the price difference towards a higher tier. */
export function formationPurchaseCost(
  target: FormationDefinition,
  owned: FormationDefinition | null,
): number {
  return target.priceCrystals - (owned?.priceCrystals ?? 0);
}
