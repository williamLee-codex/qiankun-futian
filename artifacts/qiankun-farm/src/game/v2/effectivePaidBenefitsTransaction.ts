import type { FarmAccessState } from './accessRuntime';
import type { FarmLandEntity } from './landRuntime';
import type { FarmWarehouse } from './warehouseRuntime';
import type { ChaosSeedState } from './chaosSeedRuntime';
import type { FarmPetState } from './petRuntime';
import type { FarmerState } from './farmerRuntime';
import { reconcileMilestonePets } from './petRuntime';
import { reconcileFarmerEntitlement } from './farmerRuntime';
import { reconcilePaidFarmState } from './paidAccessTransactions';

export function reconcileEffectivePaidBenefits(input: {
  access: FarmAccessState;
  lands: readonly FarmLandEntity[];
  warehouse: FarmWarehouse;
  chaosState: ChaosSeedState | null;
  pets: FarmPetState;
  farmer: FarmerState;
  effectivePaidCrystals: number;
  now: number;
}): {
  access: FarmAccessState;
  lands: FarmLandEntity[];
  warehouse: FarmWarehouse;
  chaosState: ChaosSeedState | null;
  pets: FarmPetState;
  farmer: FarmerState;
} {
  const paidFarm = reconcilePaidFarmState({
    access: input.access,
    lands: input.lands,
    warehouse: input.warehouse,
    chaosState: input.chaosState,
    effectivePaidCrystals: input.effectivePaidCrystals,
    now: input.now,
  });

  return {
    ...paidFarm,
    pets: reconcileMilestonePets({
      state: input.pets,
      effectivePaidCrystals: input.effectivePaidCrystals,
      now: input.now,
    }),
    farmer: reconcileFarmerEntitlement(input.farmer, input.effectivePaidCrystals),
  };
}
