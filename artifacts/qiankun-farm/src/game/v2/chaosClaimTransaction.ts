import type { ChaosSeedState } from './chaosSeedRuntime';
import type { FarmAccessState } from './accessRuntime';
import type { FarmWarehouse } from './warehouseRuntime';
import { settleChaosSeedsFromAccess } from './chaosAccessBridge';
import { claimChaosSeedsToWarehouse } from './chaosSeedTransactions';

export function settleAndClaimChaosSeeds(input: {
  state: ChaosSeedState;
  access: FarmAccessState;
  warehouse: FarmWarehouse;
  now: number;
}): {
  state: ChaosSeedState;
  warehouse: FarmWarehouse;
  claimed: number;
} {
  const settled = settleChaosSeedsFromAccess({
    state: input.state,
    access: input.access,
    now: input.now,
  });

  return claimChaosSeedsToWarehouse({
    state: settled,
    warehouse: input.warehouse,
  });
}
