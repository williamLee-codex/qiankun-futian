/**
 * 乾坤福田 V2 — 混沌種子 72h permanent-anchor runtime.
 *
 * Anchor = Land 6 historical firstUnlockedAt.
 * Cursor = last processed 72h cycle index.
 * Pending is capped at 3. Skipped/ineligible cycles are still processed
 * and never backfilled.
 */
export interface ChaosSeedState {
  anchorAt: number;
  processedCycle: number;
  pending: number;
}

export function createChaosSeedState(anchorAt: number): ChaosSeedState {
  if (!Number.isFinite(anchorAt) || anchorAt < 0) throw new Error('INVALID_CHAOS_ANCHOR');
  return { anchorAt, processedCycle: 0, pending: 0 };
}

export const CHAOS_CYCLE_MS = 72 * 60 * 60 * 1000;
export const CHAOS_PENDING_CAP = 3;

export function cycleIndexAt(anchorAt: number, now: number): number {
  if (now <= anchorAt) return 0;
  return Math.floor((now - anchorAt) / CHAOS_CYCLE_MS);
}

/**
 * Settles every elapsed cycle exactly once.
 * accessActive=false means cycles advance the cursor but award nothing.
 * pending>=3 also advances the cursor; missed ticks are intentionally lost.
 */
export function settleChaosSeeds(input: {
  state: ChaosSeedState;
  now: number;
  accessActive: boolean;
}): ChaosSeedState {
  const targetCycle = cycleIndexAt(input.state.anchorAt, input.now);
  if (targetCycle <= input.state.processedCycle) return input.state;

  let pending = input.state.pending;
  for (let cycle = input.state.processedCycle + 1; cycle <= targetCycle; cycle += 1) {
    if (input.accessActive && pending < CHAOS_PENDING_CAP) pending += 1;
  }

  return {
    ...input.state,
    processedCycle: targetCycle,
    pending,
  };
}

export function claimChaosSeeds(state: ChaosSeedState): {
  state: ChaosSeedState;
  claimed: number;
} {
  const claimed = state.pending;
  return {
    claimed,
    state: { ...state, pending: 0 },
  };
}
