import { describe, expect, it } from 'vitest';
import { createInitialFarmAccess } from './accessRuntime';
import { createEmptyFarmWarehouse } from './warehouseRuntime';
import { claimChaosSeedsToWarehouse, reconcilePaidLandAccessTransaction } from './chaosSeedTransactions';

describe('Farm V2 chaos seed transactions', () => {
  it('grants the first Land 6 chaos seed exactly once and anchors at first unlock', () => {
    const now = 123456;
    let result = reconcilePaidLandAccessTransaction({
      access: createInitialFarmAccess(),
      warehouse: createEmptyFarmWarehouse(),
      chaosState: null,
      effectivePaidCrystals: 600,
      now,
    });
    expect(result.warehouse.seeds[6]).toBe(1);
    expect(result.chaosState?.anchorAt).toBe(now);

    result = reconcilePaidLandAccessTransaction({
      ...result,
      effectivePaidCrystals: 600,
      now: now + 1000,
    });
    expect(result.warehouse.seeds[6]).toBe(1);
    expect(result.chaosState?.anchorAt).toBe(now);
  });

  it('claims pending seeds into warehouse without resetting anchor or cycle cursor', () => {
    const warehouse = createEmptyFarmWarehouse();
    const result = claimChaosSeedsToWarehouse({
      warehouse,
      state: { anchorAt: 100, processedCycle: 9, pending: 3 },
    });
    expect(result.claimed).toBe(3);
    expect(result.warehouse.seeds[6]).toBe(3);
    expect(result.state).toEqual({ anchorAt: 100, processedCycle: 9, pending: 0 });
  });
});
