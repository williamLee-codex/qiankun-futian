import type { FarmLandId } from './canonicalLandData';
import type { FarmWarehouse, Wallet } from './warehouseRuntime';
import type { MissionState } from './missionRuntime';
import { executeCropExchangeTransaction } from './exchangeTransaction';

export interface FarmEconomyState {
  warehouse: FarmWarehouse;
  wallet: Wallet;
  missions: MissionState;
}

export function executeExchangeFromEconomyState(input: {
  state: FarmEconomyState;
  landId: FarmLandId;
  cropQuantity: number;
  now: number;
}): FarmEconomyState & {
  cropsConsumed: number;
  rewardQuantity: number;
} {
  const result = executeCropExchangeTransaction({
    warehouse: input.state.warehouse,
    wallet: input.state.wallet,
    missions: input.state.missions,
    landId: input.landId,
    cropQuantity: input.cropQuantity,
    now: input.now,
  });

  return {
    warehouse: result.warehouse,
    wallet: result.wallet,
    missions: result.missions,
    cropsConsumed: result.cropsConsumed,
    rewardQuantity: result.rewardQuantity,
  };
}
