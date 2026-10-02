import { describe, expect, it } from 'vitest';
import { createInitialFarmAccess, reconcilePaidLandAccess } from './accessRuntime';
import { CHAOS_CYCLE_MS, createChaosSeedState } from './chaosSeedRuntime';
import { createEmptyFarmWarehouse } from './warehouseRuntime';
import { settleAndClaimChaosSeeds } from './chaosClaimTransaction';

describe('Farm V2 chaos claim transaction', () => {
  it('settles elapsed active cycles then moves pending seeds into warehouse', () => {
    const access = reconcilePaidLandAccess({
      access: createInitialFarmAccess(),
      effectivePaidCrystals: 600,
      now: 0,
    }).access;

    const result = settleAndClaimChaosSeeds({
      state: createChaosSeedState(0),
      access,
      warehouse: createEmptyFarmWarehouse(),
      now: CHAOS_CYCLE_MS * 3,
    });

    expect(result.claimed).toBe(3);
    expect(result.warehouse.seeds[6]).toBe(3);
    expect(result.state.pending).toBe(0);
    expect(result.state.processedCycle).toBe(3);
    expect(result.state.anchorAt).toBe(0);
  });

  it('does not claim seeds for suspended elapsed cycles', () => {
    const unlocked = reconcilePaidLandAccess({
      access: createInitialFarmAccess(),
      effectivePaidCrystals: 600,
      now: 0,
    }).access;
    const suspended = reconcilePaidLandAccess({
      access: unlocked,
      effectivePaidCrystals: 0,
      now: 1,
    }).access;

    const result = settleAndClaimChaosSeeds({
      state: createChaosSeedState(0),
      access: suspended,
      warehouse: createEmptyFarmWarehouse(),
      now: CHAOS_CYCLE_MS * 3,
    });

    expect(result.claimed).toBe(0);
    expect(result.warehouse.seeds[6]).toBe(0);
    expect(result.state.processedCycle).toBe(3);
  });
});
