import type { FarmAccessState } from "./accessRuntime";
import type { FarmLandEntity } from "./landRuntime";
import type { FarmWarehouse } from "./warehouseRuntime";
import type { ChaosSeedState } from "./chaosSeedRuntime";
import { settleChaosSeeds } from "./chaosSeedRuntime";
import { applyAccessToLandEntities } from "./accessLandBridge";
import { reconcilePaidLandAccessTransaction } from "./chaosSeedTransactions";

export function reconcilePaidFarmState(input: {
  access: FarmAccessState;
  lands: readonly FarmLandEntity[];
  warehouse: FarmWarehouse;
  chaosState: ChaosSeedState | null;
  effectivePaidCrystals: number;
  now: number;
}): {
  access: FarmAccessState;
  lands: FarmLandEntity[];
  warehouse: FarmWarehouse;
  chaosState: ChaosSeedState | null;
} {
  const accessResult = reconcilePaidLandAccessTransaction({
    access: input.access,
    warehouse: input.warehouse,
    chaosState: input.chaosState,
    effectivePaidCrystals: input.effectivePaidCrystals,
    now: input.now,
  });

  return {
    access: accessResult.access,
    lands: applyAccessToLandEntities(input.lands, accessResult.access),
    warehouse: accessResult.warehouse,
    chaosState:
      accessResult.chaosState === null
        ? null
        : settleChaosSeeds({
            state: accessResult.chaosState,
            now: input.now,
            // Revocation and restoration both advance missed ticks without awards.
            // Only an uninterrupted active interval can generate new pending seeds.
            accessActive:
              input.access.accessActive.has(6) &&
              accessResult.access.accessActive.has(6),
          }),
  };
}
