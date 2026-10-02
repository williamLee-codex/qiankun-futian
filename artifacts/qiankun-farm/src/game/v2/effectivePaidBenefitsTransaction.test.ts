import { describe, expect, it } from 'vitest';
import { createInitialFarmAccess } from './accessRuntime';
import { createInitialLandEntities } from './landRuntime';
import { createEmptyFarmWarehouse } from './warehouseRuntime';
import { createFarmPetState } from './petRuntime';
import { createFarmerState } from './farmerRuntime';
import { reconcileEffectivePaidBenefits } from './effectivePaidBenefitsTransaction';

describe('Farm V2 effective paid benefits transaction', () => {
  it('reconciles 600/799/999 milestones in one authoritative state transition', () => {
    const base = {
      access: createInitialFarmAccess(),
      lands: createInitialLandEntities(),
      warehouse: createEmptyFarmWarehouse(),
      chaosState: null,
      pets: createFarmPetState(),
      farmer: createFarmerState(),
      now: 1000,
    };

    const at600 = reconcileEffectivePaidBenefits({ ...base, effectivePaidCrystals: 600 });
    expect(at600.access.accessActive.has(6)).toBe(true);
    expect(at600.warehouse.seeds[6]).toBe(1);
    expect(at600.pets.owned.has('噬時諦聽')).toBe(true);
    expect(at600.pets.owned.has('乾坤麒麟')).toBe(false);
    expect(at600.farmer.entitled).toBe(false);

    const at999 = reconcileEffectivePaidBenefits({
      ...at600,
      effectivePaidCrystals: 999,
      now: 2000,
    });
    expect(at999.pets.owned.has('乾坤麒麟')).toBe(true);
    expect(at999.farmer.entitled).toBe(true);
    expect(at999.warehouse.seeds[6]).toBe(1);
  });

  it('refund below thresholds suspends paid land, reclaims milestone pets and farmer entitlement', () => {
    const unlocked = reconcileEffectivePaidBenefits({
      access: createInitialFarmAccess(),
      lands: createInitialLandEntities(),
      warehouse: createEmptyFarmWarehouse(),
      chaosState: null,
      pets: createFarmPetState(),
      farmer: createFarmerState(),
      effectivePaidCrystals: 999,
      now: 1000,
    });

    const refunded = reconcileEffectivePaidBenefits({
      ...unlocked,
      effectivePaidCrystals: 99,
      now: 2000,
    });

    expect(refunded.access.accessActive.has(4)).toBe(false);
    expect(refunded.access.accessActive.has(5)).toBe(false);
    expect(refunded.access.accessActive.has(6)).toBe(false);
    expect(refunded.pets.owned.has('噬時諦聽')).toBe(false);
    expect(refunded.pets.owned.has('乾坤麒麟')).toBe(false);
    expect(refunded.farmer.entitled).toBe(false);
    expect(refunded.warehouse.seeds[6]).toBe(1);
    expect(refunded.chaosState?.anchorAt).toBe(1000);
  });
});
