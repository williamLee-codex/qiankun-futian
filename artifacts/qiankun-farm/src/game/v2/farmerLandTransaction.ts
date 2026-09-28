import type { FarmerState } from './farmerRuntime';
import { settleFarmerLand } from './farmerRuntime';
import type { FarmLandEntity } from './landRuntime';
import type { FarmWarehouse } from './warehouseRuntime';
import { depositHarvest } from './warehouseRuntime';
import { applyNewbieHarvestMultiplier } from './timeRuntime';

export function executeFarmerLandTransaction(input: {
  farmer: FarmerState;
  land: FarmLandEntity;
  warehouse: FarmWarehouse;
  firstFarmEnteredAt: number;
  now: number;
}): {
  land: FarmLandEntity;
  warehouse: FarmWarehouse;
  rawHarvestedQuantity: number;
  creditedHarvestQuantity: number;
  completedCycles: number;
} {
  const landId = input.land.landId;
  const settlement = settleFarmerLand({
    farmer: input.farmer,
    land: input.land,
    seedsAvailable: input.warehouse.seeds[landId],
    now: input.now,
  });

  const creditedHarvestQuantity = applyNewbieHarvestMultiplier(
    settlement.harvestedQuantity,
    input.firstFarmEnteredAt,
    input.now,
  );

  return {
    land: settlement.land,
    warehouse: {
      ...depositHarvest(input.warehouse, landId, creditedHarvestQuantity),
      seeds: {
        ...input.warehouse.seeds,
        [landId]: settlement.seedsRemaining,
      },
    },
    rawHarvestedQuantity: settlement.harvestedQuantity,
    creditedHarvestQuantity,
    completedCycles: settlement.completedCycles,
  };
}
