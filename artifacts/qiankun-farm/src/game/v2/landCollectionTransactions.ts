import type { FarmLandEntity } from './landRuntime';
import type { FarmWarehouse } from './warehouseRuntime';
import type { MissionState } from './missionRuntime';
import { executeOwnerHarvestTransaction, executeSowTransaction } from './farmActionTransactions';

export interface FarmLandCollectionState {
  lands: readonly FarmLandEntity[];
  warehouse: FarmWarehouse;
  missions: MissionState;
}

function replaceLand(
  lands: readonly FarmLandEntity[],
  nextLand: FarmLandEntity,
): FarmLandEntity[] {
  return lands.map((land) => land.landId === nextLand.landId ? nextLand : land);
}

export function executeSowOnLand(input: {
  state: FarmLandCollectionState;
  landId: FarmLandEntity['landId'];
  now: number;
}): FarmLandCollectionState {
  const land = input.state.lands.find((x) => x.landId === input.landId);
  if (!land) throw new Error('UNKNOWN_LAND');

  const result = executeSowTransaction({
    state: { land, warehouse: input.state.warehouse, missions: input.state.missions },
    now: input.now,
  });

  return {
    lands: replaceLand(input.state.lands, result.land),
    warehouse: result.warehouse,
    missions: result.missions,
  };
}

export function executeOwnerHarvestOnLand(input: {
  state: FarmLandCollectionState;
  landId: FarmLandEntity['landId'];
  firstFarmEnteredAt: number;
  now: number;
}): FarmLandCollectionState & { creditedQuantity: number } {
  const land = input.state.lands.find((x) => x.landId === input.landId);
  if (!land) throw new Error('UNKNOWN_LAND');

  const result = executeOwnerHarvestTransaction({
    state: { land, warehouse: input.state.warehouse, missions: input.state.missions },
    firstFarmEnteredAt: input.firstFarmEnteredAt,
    now: input.now,
  });

  return {
    lands: replaceLand(input.state.lands, result.land),
    warehouse: result.warehouse,
    missions: result.missions,
    creditedQuantity: result.creditedQuantity,
  };
}
