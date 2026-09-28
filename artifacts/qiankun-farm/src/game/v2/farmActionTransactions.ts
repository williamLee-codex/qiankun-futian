import type { FarmLandEntity } from './landRuntime';
import { plantFullBatch, settleLandMaturity, harvestMatureLand } from './landRuntime';
import type { FarmWarehouse } from './warehouseRuntime';
import { settleHarvestToWarehouse } from './harvestSettlement';
import type { MissionState } from './missionRuntime';
import { recordMissionEvent } from './missionRuntime';

export interface FarmActionState {
  land: FarmLandEntity;
  warehouse: FarmWarehouse;
  missions: MissionState;
}

export function executeSowTransaction(input: {
  state: FarmActionState;
  now: number;
}): FarmActionState {
  const availableSeeds = input.state.warehouse.seeds[input.state.land.landId];
  const planted = plantFullBatch({
    land: input.state.land,
    availableSeeds,
    now: input.now,
  });

  return {
    land: planted.land,
    warehouse: {
      ...input.state.warehouse,
      seeds: {
        ...input.state.warehouse.seeds,
        [input.state.land.landId]: availableSeeds - planted.consumedSeeds,
      },
    },
    missions: recordMissionEvent(input.state.missions, 'SOW', input.now),
  };
}

export function executeOwnerHarvestTransaction(input: {
  state: FarmActionState;
  firstFarmEnteredAt: number;
  now: number;
}): FarmActionState & { creditedQuantity: number } {
  const matureLand = settleLandMaturity(input.state.land, input.now);
  const harvested = harvestMatureLand(matureLand);
  const settled = settleHarvestToWarehouse({
    warehouse: input.state.warehouse,
    landId: matureLand.landId,
    baseHarvestQuantity: harvested.harvestedQuantity,
    firstFarmEnteredAt: input.firstFarmEnteredAt,
    harvestedAt: input.now,
  });

  return {
    land: harvested.land,
    warehouse: settled.warehouse,
    missions: recordMissionEvent(input.state.missions, 'HARVEST', input.now),
    creditedQuantity: settled.creditedQuantity,
  };
}
