import type { FarmAccessState } from './accessRuntime';
import { reconcilePaidLandAccess } from './accessRuntime';
import type { ChaosSeedState } from './chaosSeedRuntime';
import { claimChaosSeeds, createChaosSeedState } from './chaosSeedRuntime';
import type { FarmWarehouse } from './warehouseRuntime';

function addChaosSeeds(warehouse: FarmWarehouse, quantity: number): FarmWarehouse {
  const currentQuantity = warehouse.seeds[6];
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error('INVALID_CHAOS_SEED_QUANTITY');
  }
  if (!Number.isSafeInteger(currentQuantity) || currentQuantity < 0) {
    throw new Error('INVALID_FARM_INVENTORY');
  }
  const nextQuantity = currentQuantity + quantity;
  if (!Number.isSafeInteger(nextQuantity)) {
    throw new Error('INVALID_FARM_INVENTORY');
  }
  if (quantity === 0) return warehouse;
  return {
    ...warehouse,
    seeds: { ...warehouse.seeds, 6: nextQuantity },
  };
}

/**
 * Paid-access transaction. The first historical Land 6 unlock grants exactly
 * one chaos seed and establishes the permanent 72h anchor from firstUnlockedAt.
 */
export function reconcilePaidLandAccessTransaction(input: {
  access: FarmAccessState;
  warehouse: FarmWarehouse;
  chaosState: ChaosSeedState | null;
  effectivePaidCrystals: number;
  now: number;
}): {
  access: FarmAccessState;
  warehouse: FarmWarehouse;
  chaosState: ChaosSeedState | null;
} {
  const result = reconcilePaidLandAccess({
    access: input.access,
    effectivePaidCrystals: input.effectivePaidCrystals,
    now: input.now,
  });

  let chaosState = input.chaosState;
  const land6Anchor = result.access.firstUnlockedAt[6];
  if (land6Anchor !== undefined && chaosState === null) {
    chaosState = createChaosSeedState(land6Anchor);
  }

  return {
    access: result.access,
    warehouse: addChaosSeeds(input.warehouse, result.chaosSeedsGranted),
    chaosState,
  };
}

/**
 * Claims only already-pending chaos seeds into Farm warehouse.
 * Claiming never changes anchorAt or processedCycle.
 */
export function claimChaosSeedsToWarehouse(input: {
  state: ChaosSeedState;
  warehouse: FarmWarehouse;
}): {
  state: ChaosSeedState;
  warehouse: FarmWarehouse;
  claimed: number;
} {
  const result = claimChaosSeeds(input.state);
  return {
    state: result.state,
    warehouse: addChaosSeeds(input.warehouse, result.claimed),
    claimed: result.claimed,
  };
}
