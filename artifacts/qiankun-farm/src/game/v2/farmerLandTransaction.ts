import type { FarmerState } from './farmerRuntime';
import { settleFarmerLand } from './farmerRuntime';
import type { FarmLandEntity } from './landRuntime';
import { FARM_V2_LANDS } from './canonicalLandData';
import type { FarmWarehouse } from './warehouseRuntime';
import { depositHarvest } from './warehouseRuntime';
import { applyNewbieHarvestMultiplier, NEWBIE_WINDOW_MS } from './timeRuntime';

function getNewbieEligibleHarvestQuantity(input: {
  land: FarmLandEntity;
  completedCycles: number;
  firstFarmEnteredAt: number;
}): number {
  if (input.completedCycles === 0) return 0;
  if (!Number.isSafeInteger(input.firstFarmEnteredAt)) {
    throw new Error('INVALID_HARVEST_TIME');
  }

  const firstMaturesAt = input.land.maturesAt;
  if (firstMaturesAt === null || !Number.isSafeInteger(firstMaturesAt)) {
    throw new Error('INVALID_HARVEST_TIME');
  }
  const windowEnd = input.firstFarmEnteredAt + NEWBIE_WINDOW_MS;
  if (!Number.isSafeInteger(windowEnd)) throw new Error('INVALID_HARVEST_TIME');

  const landDefinition = FARM_V2_LANDS.find((item) => item.id === input.land.landId);
  if (!landDefinition) throw new Error('UNKNOWN_LAND');
  const growthMs = landDefinition.growthHours * 60 * 60 * 1000;

  let eligibleQuantity =
    firstMaturesAt >= input.firstFarmEnteredAt && firstMaturesAt < windowEnd
      ? input.land.plantedQuantity
      : 0;

  // Later farmer cycles mature at firstMaturesAt + k * growthMs, k >= 1.
  // Count only those whose maturity falls inside the newbie window.
  const firstEligibleCycle = Math.max(
    1,
    Math.ceil((input.firstFarmEnteredAt - firstMaturesAt) / growthMs),
  );
  const afterLastEligibleCycle = Math.min(
    input.completedCycles,
    Math.ceil((windowEnd - firstMaturesAt) / growthMs),
  );
  const eligibleAdditionalCycles = Math.max(
    0,
    afterLastEligibleCycle - firstEligibleCycle,
  );
  eligibleQuantity += eligibleAdditionalCycles * landDefinition.capacity;

  if (!Number.isSafeInteger(eligibleQuantity) || eligibleQuantity < 0) {
    throw new Error('HARVEST_QUANTITY_OVERFLOW');
  }
  return eligibleQuantity;
}

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

  const newbieEligibleQuantity = getNewbieEligibleHarvestQuantity({
    land: input.land,
    completedCycles: settlement.completedCycles,
    firstFarmEnteredAt: input.firstFarmEnteredAt,
  });
  if (newbieEligibleQuantity > settlement.harvestedQuantity) {
    throw new Error('INVALID_FARMER_SETTLEMENT');
  }
  const boostedEligibleQuantity = applyNewbieHarvestMultiplier(
    newbieEligibleQuantity,
    input.firstFarmEnteredAt,
    input.firstFarmEnteredAt,
  );
  const creditedHarvestQuantity =
    boostedEligibleQuantity + settlement.harvestedQuantity - newbieEligibleQuantity;
  if (!Number.isSafeInteger(creditedHarvestQuantity)) {
    throw new Error('HARVEST_QUANTITY_OVERFLOW');
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
