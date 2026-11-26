import type { FarmLandId } from './canonicalLandData';

export interface FarmAccessState {
  historicallyUnlocked: ReadonlySet<FarmLandId>;
  firstUnlockedAt: Partial<Record<FarmLandId, number>>;
  accessActive: ReadonlySet<FarmLandId>;
  firstChaosSeedGranted: boolean;
}

export interface UnlockResult {
  access: FarmAccessState;
  coinsSpent: number;
  chaosSeedsGranted: number;
}

function cloneSet<T>(value: ReadonlySet<T>): Set<T> {
  return new Set(value);
}

function activateHistoricalUnlock(
  state: FarmAccessState,
  landId: FarmLandId,
  now: number,
): FarmAccessState {
  const historicallyUnlocked = cloneSet(state.historicallyUnlocked);
  const accessActive = cloneSet(state.accessActive);
  const firstUnlockedAt = { ...state.firstUnlockedAt };

  historicallyUnlocked.add(landId);
  accessActive.add(landId);
  if (firstUnlockedAt[landId] === undefined) firstUnlockedAt[landId] = now;

  return { ...state, historicallyUnlocked, accessActive, firstUnlockedAt };
}

export function createInitialFarmAccess(): FarmAccessState {
  return {
    historicallyUnlocked: new Set<FarmLandId>([1]),
    firstUnlockedAt: { 1: 0 },
    accessActive: new Set<FarmLandId>([1]),
    firstChaosSeedGranted: false,
  };
}

/** Land 2/3 are one-time coin unlocks. Land 3 requires historical Land 2 unlock. */
export function unlockCoinLand(input: {
  access: FarmAccessState;
  landId: 2 | 3;
  coinBalance: number;
  now: number;
}): UnlockResult {
  if (input.access.historicallyUnlocked.has(input.landId)) {
    return { access: input.access, coinsSpent: 0, chaosSeedsGranted: 0 };
  }

  const cost = input.landId === 2 ? 88 : 888;
  if (input.landId === 3 && !input.access.historicallyUnlocked.has(2)) {
    throw new Error('LAND_2_REQUIRED');
  }
  if (input.coinBalance < cost) throw new Error('INSUFFICIENT_COINS');

  return {
    access: activateHistoricalUnlock(input.access, input.landId, input.now),
    coinsSpent: cost,
    chaosSeedsGranted: 0,
  };
}

const PAID_THRESHOLDS: Readonly<Record<4 | 5 | 6, number>> = {
  4: 100,
  5: 300,
  6: 600,
};

/**
 * Reconciles paid-land access against effective cumulative paid crystals.
 * Historical unlock and firstUnlockedAt are permanent audit facts.
 * Refunds may suspend access without clearing land/crop state.
 */
export function reconcilePaidLandAccess(input: {
  access: FarmAccessState;
  effectivePaidCrystals: number;
  now: number;
}): UnlockResult {
  let access: FarmAccessState = {
    ...input.access,
    historicallyUnlocked: cloneSet(input.access.historicallyUnlocked),
    accessActive: cloneSet(input.access.accessActive),
    firstUnlockedAt: { ...input.access.firstUnlockedAt },
  };
  let chaosSeedsGranted = 0;

  for (const landId of [4, 5, 6] as const) {
    const qualified = input.effectivePaidCrystals >= PAID_THRESHOLDS[landId];

    if (qualified) {
      const wasHistorical = access.historicallyUnlocked.has(landId);
      access = activateHistoricalUnlock(access, landId, input.now);

      if (landId === 6 && !wasHistorical && !access.firstChaosSeedGranted) {
        access = { ...access, firstChaosSeedGranted: true };
        chaosSeedsGranted = 1;
      }
    } else {
      const active = cloneSet(access.accessActive);
      active.delete(landId);
      access = { ...access, accessActive: active };
    }
  }

  return { access, coinsSpent: 0, chaosSeedsGranted };
}

export function isLandAccessActive(access: FarmAccessState, landId: FarmLandId): boolean {
  return access.accessActive.has(landId);
}
