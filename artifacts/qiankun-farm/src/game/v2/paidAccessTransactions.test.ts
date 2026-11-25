import { describe, expect, it } from 'vitest';
import { createInitialFarmAccess } from './accessRuntime';
import { createInitialLandEntities } from './landRuntime';
import { createEmptyFarmWarehouse } from './warehouseRuntime';
import { reconcilePaidFarmState } from './paidAccessTransactions';

describe('Farm V2 paid access transactions', () => {
  it('unlocks paid lands and grants the first chaos seed at 600', () => {
    const result = reconcilePaidFarmState({
      access: createInitialFarmAccess(),
      lands: createInitialLandEntities(),
      warehouse: createEmptyFarmWarehouse(),
      chaosState: null,
      effectivePaidCrystals: 600,
      now: 1000,
    });
    expect(result.lands.find((x) => x.landId === 4)?.accessActive).toBe(true);
    expect(result.lands.find((x) => x.landId === 5)?.accessActive).toBe(true);
    expect(result.lands.find((x) => x.landId === 6)?.accessActive).toBe(true);
    expect(result.warehouse.seeds[6]).toBe(1);
    expect(result.chaosState?.anchorAt).toBe(1000);
  });

  it('refund suspension preserves planted paid-land crop and timestamps', () => {
    let result = reconcilePaidFarmState({
      access: createInitialFarmAccess(),
      lands: createInitialLandEntities(),
      warehouse: createEmptyFarmWarehouse(),
      chaosState: null,
      effectivePaidCrystals: 600,
      now: 1000,
    });
    const land4 = result.lands.find((x) => x.landId === 4)!;
    result = {
      ...result,
      lands: result.lands.map((x) => x.landId === 4 ? {
        ...land4,
        lifecycle: 'GROWING',
        plantedQuantity: 4,
        plantedAt: 2000,
        maturesAt: 3000,
      } : x),
    };

    const suspended = reconcilePaidFarmState({
      ...result,
      effectivePaidCrystals: 99,
      now: 2500,
    });
    const suspended4 = suspended.lands.find((x) => x.landId === 4)!;
    expect(suspended4.accessActive).toBe(false);
    expect(suspended4.lifecycle).toBe('GROWING');
    expect(suspended4.plantedQuantity).toBe(4);
    expect(suspended4.plantedAt).toBe(2000);
    expect(suspended4.maturesAt).toBe(3000);
  });
});
