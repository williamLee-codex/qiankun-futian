import { describe, expect, it } from 'vitest';
import {
  CHAOS_CYCLE_MS,
  claimChaosSeeds,
  createChaosSeedState,
  settleChaosSeeds,
} from './chaosSeedRuntime';

describe('Farm V2 chaos seed runtime', () => {
  it('uses the permanent first-unlock anchor and awards one seed each 72h', () => {
    const state = createChaosSeedState(1000);
    const settled = settleChaosSeeds({
      state,
      now: 1000 + CHAOS_CYCLE_MS * 2,
      accessActive: true,
    });
    expect(settled.processedCycle).toBe(2);
    expect(settled.pending).toBe(2);
    expect(settled.anchorAt).toBe(1000);
  });

  it('caps pending seeds at three and permanently processes overflow ticks', () => {
    const state = createChaosSeedState(0);
    const settled = settleChaosSeeds({
      state,
      now: CHAOS_CYCLE_MS * 8,
      accessActive: true,
    });
    expect(settled.pending).toBe(3);
    expect(settled.processedCycle).toBe(8);

    const claim = claimChaosSeeds(settled);
    expect(claim.claimed).toBe(3);
    expect(claim.state.pending).toBe(0);

    const sameTime = settleChaosSeeds({
      state: claim.state,
      now: CHAOS_CYCLE_MS * 8,
      accessActive: true,
    });
    expect(sameTime.pending).toBe(0);
    expect(sameTime.processedCycle).toBe(8);
  });

  it('processes suspended cycles without awarding and never backfills them', () => {
    const initial = createChaosSeedState(0);
    const suspended = settleChaosSeeds({
      state: initial,
      now: CHAOS_CYCLE_MS * 4,
      accessActive: false,
    });
    expect(suspended.pending).toBe(0);
    expect(suspended.processedCycle).toBe(4);

    const restored = settleChaosSeeds({
      state: suspended,
      now: CHAOS_CYCLE_MS * 5,
      accessActive: true,
    });
    expect(restored.pending).toBe(1);
    expect(restored.processedCycle).toBe(5);
  });

  it('claiming does not reset anchor or processed cursor', () => {
    const settled = settleChaosSeeds({
      state: createChaosSeedState(777),
      now: 777 + CHAOS_CYCLE_MS * 2,
      accessActive: true,
    });
    const claimed = claimChaosSeeds(settled);
    expect(claimed.claimed).toBe(2);
    expect(claimed.state.anchorAt).toBe(777);
    expect(claimed.state.processedCycle).toBe(2);
  });

  it('supports offline lazy settlement up to the pending cap', () => {
    const offline = settleChaosSeeds({
      state: createChaosSeedState(0),
      now: CHAOS_CYCLE_MS * 3 + 12345,
      accessActive: true,
    });
    expect(offline.pending).toBe(3);
    expect(offline.processedCycle).toBe(3);
  });
});
