import type { FarmLandId } from './canonicalLandData';
import type { FarmWarehouse, Wallet } from './warehouseRuntime';
import { exchangeCrops } from './warehouseRuntime';
import type { MissionState } from './missionRuntime';
import { recordMissionEvent } from './missionRuntime';

export function executeCropExchangeTransaction(input: {
  warehouse: FarmWarehouse;
  wallet: Wallet;
  missions: MissionState;
  landId: FarmLandId;
  cropQuantity: number;
  now: number;
}): {
  warehouse: FarmWarehouse;
  wallet: Wallet;
  missions: MissionState;
  cropsConsumed: number;
  rewardQuantity: number;
} {
  const exchanged = exchangeCrops({
    warehouse: input.warehouse,
    wallet: input.wallet,
    landId: input.landId,
    cropQuantity: input.cropQuantity,
  });

  return {
    ...exchanged,
    // Exactly one successful exchange transaction = one mission event,
    // regardless of how many crop units were exchanged.
    missions: recordMissionEvent(input.missions, 'EXCHANGE', input.now),
  };
}
