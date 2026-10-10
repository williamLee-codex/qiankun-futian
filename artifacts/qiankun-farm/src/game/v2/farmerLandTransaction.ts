import type { FarmerState } from "./farmerRuntime";
import { settleFarmerLand } from "./farmerRuntime";
import type { FarmLandEntity } from "./landRuntime";
import type { FarmWarehouse } from "./warehouseRuntime";
import { depositHarvest } from "./warehouseRuntime";
import { applyNewbieHarvestMultiplier } from "./timeRuntime";
import { FARM_V2_LANDS } from "./canonicalLandData";

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

  // FARMER-NEWBIE-001: apply blessing at each original harvest timestamp.
  let creditedHarvestQuantity = 0;
  if (settlement.completedCycles > 0 && input.land.maturesAt !== null) {
    const growthMs =
      FARM_V2_LANDS.find((x) => x.id === landId)!.growthHours * 3600000;
    const capacity = FARM_V2_LANDS.find((x) => x.id === landId)!.capacity;
    creditedHarvestQuantity = applyNewbieHarvestMultiplier(
      input.land.plantedQuantity,
      input.firstFarmEnteredAt,
      input.land.maturesAt,
    );
    const later = settlement.completedCycles - 1;
    const end = input.firstFarmEnteredAt + 7 * 24 * 3600000;
    const blessed = Math.max(
      0,
      Math.min(later, Math.ceil((end - input.land.maturesAt) / growthMs) - 1),
    );
    creditedHarvestQuantity += capacity * (blessed * 6 + later - blessed);
  }

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
