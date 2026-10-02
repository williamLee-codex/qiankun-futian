import { describe, expect, it } from 'vitest';
import { createInitialFarmAccess, reconcilePaidLandAccess } from './accessRuntime';
import { createChaosSeedState, CHAOS_CYCLE_MS } from './chaosSeedRuntime';
import { settleChaosSeedsFromAccess } from './chaosAccessBridge';

describe('Farm V2 chaos access bridge', () => {
  it('accrues elapsed cycles while Land 6 access is active', () => {
    const access = reconcilePaidLandAccess({
      access: createInitialFarmAccess(),
      effectivePaidCrystals: 600,
      now: 0,
    }).access;
    const result = settleChaosSeedsFromAccess({
      state: createChaosSeedState(0),
      access,
      now: CHAOS_CYCLE_MS * 2,
    });
    expect(result.pending).toBe(2);
    expect(result.processedCycle).toBe(2);
  });

  it('advances suspended cycles without backfill', () => {
    const unlocked = reconcilePaidLandAccess({
      access: createInitialFarmAccess(),
      effectivePaidCrystals: 600,
      now: 0,
    }).access;
    const suspended = reconcilePaidLandAccess({
      access: unlocked,
      effectivePaidCrystals: 0,
      now: CHAOS_CYCLE_MS,
    }).access;

    let state = settleChaosSeedsFromAccess({
      state: createChaosSeedState(0),
      access: suspended,
      now: CHAOS_CYCLE_MS * 2,
    });
    expect(state.pending).toBe(0);
    expect(state.processedCycle).toBe(2);

    const restored = reconcilePaidLandAccess({
      access: suspended,
      effectivePaidCrystals: 600,
      now: CHAOS_CYCLE_MS * 2 + 1,
    }).access;
    state = settleChaosSeedsFromAccess({
      state,
      access: restored,
      now: CHAOS_CYCLE_MS * 3,
    });
    expect(state.pending).toBe(1);
    expect(state.processedCycle).toBe(3);
  });
});
