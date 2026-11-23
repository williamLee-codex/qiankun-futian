import { describe, expect, it } from 'vitest';
import {
  applyCoinReward,
  applyGrowthSpeed,
  applyHarvestYield,
  applyPetAssistBonus,
  formationBonuses,
  NEUTRAL_FORMATION_BONUSES,
  PREMIUM_FORMATION_BONUSES,
  PREMIUM_FORMATION_ID,
  PREMIUM_FORMATION_PRICE_CRYSTALS,
} from './formationEffects';
import { emptyFarmQuantities } from './warehouseRuntime';
import type { WorkshopWarehouse } from './workshopRuntime';

const NOW = Date.UTC(2026, 10, 22, 4, 0, 0);

function warehouseWith(
  formations: { id: string; expiresAt: number | null }[] | undefined,
  activeFormation: string | null | undefined,
): WorkshopWarehouse {
  return {
    seeds: emptyFarmQuantities(),
    crops: emptyFarmQuantities(),
    workshop: {
      pots: [],
      decor: [],
      potGallery: {},
      decorGallery: {},
      materials: { 蘊靈砂: 0, 九霄玉髓: 0 },
      ...(formations ? { formations } : {}),
      ...(activeFormation === undefined ? {} : { activeFormation }),
    },
  };
}

const active = () =>
  warehouseWith([{ id: PREMIUM_FORMATION_ID, expiresAt: null }], PREMIUM_FORMATION_ID);

describe('FORMATION-EFFECT-001 permanent formation benefits', () => {
  it('prices the permanent purchase at 388 crystals', () => {
    expect(PREMIUM_FORMATION_PRICE_CRYSTALS).toBe(388);
  });

  it('grants nothing without ownership, without activation or after expiry', () => {
    expect(formationBonuses(warehouseWith(undefined, null), NOW)).toBe(
      NEUTRAL_FORMATION_BONUSES,
    );
    expect(
      formationBonuses(
        warehouseWith([{ id: PREMIUM_FORMATION_ID, expiresAt: null }], null),
        NOW,
      ),
    ).toBe(NEUTRAL_FORMATION_BONUSES);
    expect(
      formationBonuses(
        warehouseWith(
          [{ id: PREMIUM_FORMATION_ID, expiresAt: NOW - 1 }],
          PREMIUM_FORMATION_ID,
        ),
        NOW,
      ),
    ).toBe(NEUTRAL_FORMATION_BONUSES);
    expect(formationBonuses(warehouseWith([], PREMIUM_FORMATION_ID), NOW)).toBe(
      NEUTRAL_FORMATION_BONUSES,
    );
  });

  it('applies all four benefits while owned and equipped', () => {
    expect(formationBonuses(active(), NOW)).toBe(PREMIUM_FORMATION_BONUSES);
  });

  it('never stacks duplicated ownership entries', () => {
    const duplicated = warehouseWith(
      [
        { id: PREMIUM_FORMATION_ID, expiresAt: null },
        { id: PREMIUM_FORMATION_ID, expiresAt: null },
      ],
      PREMIUM_FORMATION_ID,
    );
    expect(formationBonuses(duplicated, NOW)).toBe(PREMIUM_FORMATION_BONUSES);
    expect(applyHarvestYield(20, formationBonuses(duplicated, NOW))).toBe(23);
  });

  it('shortens growth by 20% of the duration (speed +20%)', () => {
    const fourHours = 4 * 60 * 60 * 1000;
    expect(applyGrowthSpeed(fourHours, PREMIUM_FORMATION_BONUSES)).toBe(
      3 * 60 * 60 * 1000 + 20 * 60 * 1000,
    );
    expect(applyGrowthSpeed(fourHours, NEUTRAL_FORMATION_BONUSES)).toBe(fourHours);
    expect(applyGrowthSpeed(6 * 3600_000, PREMIUM_FORMATION_BONUSES)).toBe(
      5 * 3600_000,
    );
  });

  it('raises harvest quantity by 15% with integer rounding', () => {
    expect(applyHarvestYield(20, PREMIUM_FORMATION_BONUSES)).toBe(23);
    expect(applyHarvestYield(10, PREMIUM_FORMATION_BONUSES)).toBe(12);
    expect(applyHarvestYield(6, PREMIUM_FORMATION_BONUSES)).toBe(7);
    expect(applyHarvestYield(3, PREMIUM_FORMATION_BONUSES)).toBe(4);
    expect(applyHarvestYield(20, NEUTRAL_FORMATION_BONUSES)).toBe(20);
  });

  it('raises coin rewards by 15%', () => {
    expect(applyCoinReward(10, PREMIUM_FORMATION_BONUSES)).toBe(12);
    expect(applyCoinReward(100, PREMIUM_FORMATION_BONUSES)).toBe(115);
    expect(applyCoinReward(0, PREMIUM_FORMATION_BONUSES)).toBe(0);
    expect(applyCoinReward(10, NEUTRAL_FORMATION_BONUSES)).toBe(10);
  });

  it('raises the pet assist share from 10% to 12%', () => {
    expect(applyPetAssistBonus(100, PREMIUM_FORMATION_BONUSES)).toBe(12);
    expect(applyPetAssistBonus(100, NEUTRAL_FORMATION_BONUSES)).toBe(10);
    expect(applyPetAssistBonus(10, NEUTRAL_FORMATION_BONUSES)).toBe(1);
    expect(applyPetAssistBonus(10, PREMIUM_FORMATION_BONUSES)).toBe(2);
  });

  it('rejects non-integer or negative inputs instead of silently rounding', () => {
    expect(() => applyHarvestYield(-1, PREMIUM_FORMATION_BONUSES)).toThrow(
      'INVALID_HARVEST_QUANTITY',
    );
    expect(() => applyHarvestYield(1.5, PREMIUM_FORMATION_BONUSES)).toThrow(
      'INVALID_HARVEST_QUANTITY',
    );
    expect(() => applyCoinReward(-5, PREMIUM_FORMATION_BONUSES)).toThrow(
      'INVALID_COIN_REWARD',
    );
    expect(() => applyGrowthSpeed(0, PREMIUM_FORMATION_BONUSES)).toThrow(
      'INVALID_GROWTH_DURATION',
    );
  });
});
