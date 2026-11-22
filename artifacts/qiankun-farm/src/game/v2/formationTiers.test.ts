import { describe, expect, it } from 'vitest';
import {
  FORMATION_DEFINITIONS,
  PREMIUM_FORMATION_ID,
  PREMIUM_FORMATION_PRICE_CRYSTALS,
  formationPurchaseCost,
  formationPurchaseReference,
  getFormationDefinition,
  highestOwnedFormation,
} from './formationCatalog';
import {
  planFormationMutation,
  workshopState,
  type WorkshopWarehouse,
} from './workshopRuntime';
import {
  NEUTRAL_FORMATION_BONUSES,
  applyCoinReward,
  applyGrowthSpeed,
  applyHarvestYield,
  applyPetAssistBonus,
  formationBonuses,
} from './formationEffects';
import { emptyFarmQuantities } from './warehouseRuntime';

const NOW = Date.UTC(2026, 10, 22, 4, 0, 0);
const XUANLING = 'FORMATION_XUANLING_188';
const JIUXIAO = 'FORMATION_JIUXIAO_288';

function emptyWarehouse(): WorkshopWarehouse {
  return { seeds: emptyFarmQuantities(), crops: emptyFarmQuantities() };
}

function buy(
  warehouse: WorkshopWarehouse,
  formationId: string,
  now = NOW,
) {
  return planFormationMutation(warehouse, { kind: 'buyFormation', formationId }, now);
}

describe('玄天陣典 catalog', () => {
  it('publishes the three canonical tiers with their exact prices and ratios', () => {
    expect(FORMATION_DEFINITIONS.map((f) => f.id)).toEqual([
      XUANLING,
      JIUXIAO,
      PREMIUM_FORMATION_ID,
    ]);
    expect(FORMATION_DEFINITIONS.map((f) => f.priceCrystals)).toEqual([
      188, 288, PREMIUM_FORMATION_PRICE_CRYSTALS,
    ]);
    expect(FORMATION_DEFINITIONS.map((f) => f.name)).toEqual([
      '玄靈聚元大陣',
      '九霄造化大陣',
      '太虛星河大陣',
    ]);
    const ratios = FORMATION_DEFINITIONS.map((f) => [
      f.bonusRatios.growthSpeed.numerator,
      f.bonusRatios.harvestYield.numerator,
      f.bonusRatios.coinReward.numerator,
      f.bonusRatios.petAssist.numerator,
    ]);
    expect(ratios).toEqual([
      [108, 106, 106, 108],
      [112, 109, 109, 112],
      [120, 115, 115, 120],
    ]);
    for (const definition of FORMATION_DEFINITIONS)
      for (const ratio of Object.values(definition.bonusRatios))
        expect(ratio.denominator).toBe(100);
  });

  it('keeps the persisted 388 id and rejects unknown ids', () => {
    expect(PREMIUM_FORMATION_ID).toBe('FORMATION_PREMIUM_V2');
    expect(getFormationDefinition('FORMATION_UNKNOWN')).toBeNull();
    expect(getFormationDefinition(null)).toBeNull();
  });

  it('prices a first purchase at full price and an upgrade at the difference', () => {
    const xuanling = getFormationDefinition(XUANLING)!;
    const jiuxiao = getFormationDefinition(JIUXIAO)!;
    expect(formationPurchaseCost(xuanling, null)).toBe(188);
    expect(formationPurchaseCost(jiuxiao, xuanling)).toBe(100);
    expect(
      formationPurchaseCost(getFormationDefinition(PREMIUM_FORMATION_ID)!, jiuxiao),
    ).toBe(100);
    expect(formationPurchaseReference(XUANLING, null)).toBe(
      'FORMATION_PURCHASE:FORMATION_XUANLING_188',
    );
    expect(formationPurchaseReference(JIUXIAO, XUANLING)).toBe(
      'FORMATION_UPGRADE:FORMATION_XUANLING_188:FORMATION_JIUXIAO_288',
    );
    // The released 388 contract stays byte-identical.
    expect(formationPurchaseReference(PREMIUM_FORMATION_ID, null)).toBe(
      PREMIUM_FORMATION_ID,
    );
  });
});

describe('FORMATION-PREMIUM-001 tiered purchase', () => {
  it('buys the 188 tier for 188 crystals and never auto-equips it', () => {
    const plan = buy(emptyWarehouse(), XUANLING);
    expect(plan.cost).toBe(188);
    expect(plan.referenceId).toBe('FORMATION_PURCHASE:FORMATION_XUANLING_188');
    const state = workshopState(plan.warehouse);
    expect(state.formations).toEqual([{ id: XUANLING, expiresAt: null }]);
    expect(state.activeFormation ?? null).toBeNull();
  });

  it('buys the 288 tier for 288 crystals', () => {
    const plan = buy(emptyWarehouse(), JIUXIAO);
    expect(plan.cost).toBe(288);
    expect(plan.referenceId).toBe('FORMATION_PURCHASE:FORMATION_JIUXIAO_288');
  });

  it('keeps the released 388 purchase on its frozen reference and price', () => {
    const plan = planFormationMutation(emptyWarehouse(), { kind: 'buyFormation' }, NOW);
    expect(plan.cost).toBe(388);
    expect(plan.referenceId).toBe(PREMIUM_FORMATION_ID);
  });

  it('charges only the difference when upgrading 188 -> 288 -> 388', () => {
    const first = buy(emptyWarehouse(), XUANLING);
    const second = buy(first.warehouse, JIUXIAO);
    expect(second.cost).toBe(100);
    expect(second.referenceId).toBe(
      'FORMATION_UPGRADE:FORMATION_XUANLING_188:FORMATION_JIUXIAO_288',
    );
    const third = buy(second.warehouse, PREMIUM_FORMATION_ID);
    expect(third.cost).toBe(100);
    expect(third.referenceId).toBe(
      `FORMATION_UPGRADE:${JIUXIAO}:${PREMIUM_FORMATION_ID}`,
    );
    expect(188 + second.cost + third.cost).toBe(388);
    // Every purchased tier is retained permanently.
    expect(
      workshopState(third.warehouse).formations?.map((f) => f.id).sort(),
    ).toEqual([XUANLING, JIUXIAO, PREMIUM_FORMATION_ID].sort());
  });

  it('refuses a duplicate purchase of the same tier', () => {
    const first = buy(emptyWarehouse(), XUANLING);
    expect(() => buy(first.warehouse, XUANLING, NOW + 1)).toThrow(
      'FORMATION_ALREADY_OWNED',
    );
  });

  it('refuses a downgrade instead of charging a negative difference', () => {
    const owned = buy(emptyWarehouse(), PREMIUM_FORMATION_ID);
    expect(() => buy(owned.warehouse, XUANLING, NOW + 1)).toThrow(
      'FORMATION_NOT_UPGRADEABLE',
    );
    expect(() => buy(owned.warehouse, JIUXIAO, NOW + 1)).toThrow(
      'FORMATION_NOT_UPGRADEABLE',
    );
  });

  it('refuses an unknown formation id', () => {
    expect(() => buy(emptyWarehouse(), 'FORMATION_HACK')).toThrow(
      'UNKNOWN_FORMATION',
    );
  });

  it('switches between owned tiers for free and refuses unowned tiers', () => {
    const owned = buy(buy(emptyWarehouse(), XUANLING).warehouse, JIUXIAO);
    const equipped = planFormationMutation(
      owned.warehouse,
      { kind: 'switchFormation', formationId: XUANLING },
      NOW + 1,
    );
    expect(equipped.cost).toBe(0);
    expect(equipped.referenceId).toBe('');
    expect(workshopState(equipped.warehouse).activeFormation).toBe(XUANLING);
    expect(() =>
      planFormationMutation(
        owned.warehouse,
        { kind: 'switchFormation', formationId: PREMIUM_FORMATION_ID },
        NOW + 1,
      ),
    ).toThrow('FORMATION_NOT_OWNED');
  });

  it('ignores an expired tier when pricing the next upgrade', () => {
    const expired = buy(emptyWarehouse(), XUANLING, NOW - 10_000);
    const withExpiry: WorkshopWarehouse = {
      ...expired.warehouse,
      workshop: {
        ...workshopState(expired.warehouse),
        formations: [{ id: XUANLING, expiresAt: NOW - 1 }],
      },
    };
    expect(highestOwnedFormation(workshopState(withExpiry).formations, NOW)).toBeNull();
    const plan = buy(withExpiry, JIUXIAO);
    expect(plan.cost).toBe(288);
    expect(plan.referenceId).toBe('FORMATION_PURCHASE:FORMATION_JIUXIAO_288');
  });
});

describe('FORMATION-EFFECT-001 tiered benefits', () => {
  it('applies the four benefits of the equipped tier only', () => {
    const owned = buy(buy(emptyWarehouse(), XUANLING).warehouse, PREMIUM_FORMATION_ID);
    const equippedLow = planFormationMutation(
      owned.warehouse,
      { kind: 'switchFormation', formationId: XUANLING },
      NOW,
    ).warehouse;
    const low = formationBonuses(equippedLow, NOW);
    expect(low.growthSpeed.numerator).toBe(108);
    expect(low.harvestYield.numerator).toBe(106);
    expect(low.coinReward.numerator).toBe(106);
    expect(low.petAssist.numerator).toBe(108);

    const equippedHigh = planFormationMutation(
      owned.warehouse,
      { kind: 'switchFormation', formationId: PREMIUM_FORMATION_ID },
      NOW,
    ).warehouse;
    expect(formationBonuses(equippedHigh, NOW).growthSpeed.numerator).toBe(120);
  });

  it('grants nothing without ownership, without activation or after expiry', () => {
    const bought = buy(emptyWarehouse(), XUANLING).warehouse;
    expect(formationBonuses(bought, NOW)).toEqual(NEUTRAL_FORMATION_BONUSES);
    const equipped = planFormationMutation(
      bought,
      { kind: 'switchFormation', formationId: XUANLING },
      NOW,
    ).warehouse;
    expect(formationBonuses(equipped, NOW + 10).growthSpeed.numerator).toBe(108);
    const expired: WorkshopWarehouse = {
      ...equipped,
      workshop: {
        ...workshopState(equipped),
        formations: [{ id: XUANLING, expiresAt: NOW + 5 }],
      },
    };
    expect(formationBonuses(expired, NOW + 10)).toEqual(NEUTRAL_FORMATION_BONUSES);
  });

  it('settles the 188 tier with exact integer arithmetic', () => {
    const bonuses = getFormationDefinition(XUANLING)!.bonusRatios;
    expect(applyGrowthSpeed(14_400_000, bonuses)).toBe(13_333_334);
    expect(applyGrowthSpeed(14_400_000, bonuses)).toBeLessThan(14_400_000);
    expect(applyHarvestYield(20, bonuses)).toBe(22);
    expect(applyCoinReward(100, bonuses)).toBe(106);
    expect(applyPetAssistBonus(20, bonuses)).toBe(3);
    expect(applyHarvestYield(0, bonuses)).toBe(0);
    expect(applyPetAssistBonus(0, bonuses)).toBe(0);
  });

  it('settles the 288 tier with exact integer arithmetic', () => {
    const bonuses = getFormationDefinition(JIUXIAO)!.bonusRatios;
    expect(applyGrowthSpeed(14_400_000, bonuses)).toBe(12_857_143);
    expect(applyHarvestYield(20, bonuses)).toBe(22);
    expect(applyCoinReward(100, bonuses)).toBe(109);
    expect(applyPetAssistBonus(20, bonuses)).toBe(3);
  });

  it('keeps every settlement neutral without an equipped formation', () => {
    expect(applyGrowthSpeed(14_400_000, NEUTRAL_FORMATION_BONUSES)).toBe(14_400_000);
    expect(applyHarvestYield(20, NEUTRAL_FORMATION_BONUSES)).toBe(20);
    expect(applyCoinReward(100, NEUTRAL_FORMATION_BONUSES)).toBe(100);
    expect(applyPetAssistBonus(20, NEUTRAL_FORMATION_BONUSES)).toBe(2);
  });

  it('keeps ownership and benefits across a re-login round trip', () => {
    const owned = buy(buy(emptyWarehouse(), XUANLING).warehouse, JIUXIAO);
    const equipped = planFormationMutation(
      owned.warehouse,
      { kind: 'switchFormation', formationId: JIUXIAO },
      NOW,
    ).warehouse;
    const restored = JSON.parse(JSON.stringify(equipped)) as WorkshopWarehouse;
    const state = workshopState(restored);
    expect(state.formations).toEqual([
      { id: XUANLING, expiresAt: null },
      { id: JIUXIAO, expiresAt: null },
    ]);
    expect(state.activeFormation).toBe(JIUXIAO);
    expect(formationBonuses(restored, NOW + 86_400_000).growthSpeed.numerator).toBe(112);
  });
});
