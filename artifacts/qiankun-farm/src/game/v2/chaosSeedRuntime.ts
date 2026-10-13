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
  if (!Number.isSafeInteger(anchorAt) || anchorAt < 0) {
    throw new Error('INVALID_CHAOS_ANCHOR');
  }
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new Error('INVALID_CHAOS_TIME');
  }
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
  const { state, now, accessActive } = input;
  if (
    !Number.isSafeInteger(state.processedCycle) ||
    state.processedCycle < 0 ||
    !Number.isSafeInteger(state.pending) ||
    state.pending < 0 ||
    state.pending > CHAOS_PENDING_CAP
  ) {
    throw new Error('INVALID_CHAOS_STATE');
  }
  if (typeof accessActive !== 'boolean') throw new Error('INVALID_CHAOS_ACCESS');

  const targetCycle = cycleIndexAt(state.anchorAt, now);
  if (targetCycle <= state.processedCycle) return state;

  const elapsedCycles = targetCycle - state.processedCycle;
  const additionalPending = accessActive
    ? Math.min(elapsedCycles, CHAOS_PENDING_CAP - state.pending)
    : 0;

  return {
    ...state,
    processedCycle: targetCycle,
    pending: state.pending + additionalPending,
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
