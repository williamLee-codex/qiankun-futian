import type { FarmMissionReward, MissionState } from './missionRuntime';
import { claimMissionReward } from './missionRuntime';
import type { Wallet } from './warehouseRuntime';

export interface FarmMaterialInventory {
  蘊靈砂: number;
  九霄玉髓: number;
}

export function createEmptyFarmMaterialInventory(): FarmMaterialInventory {
  return { 蘊靈砂: 0, 九霄玉髓: 0 };
}

export function creditMissionReward(input: {
  wallet: Wallet;
  materials: FarmMaterialInventory;
  reward: FarmMissionReward;
}): { wallet: Wallet; materials: FarmMaterialInventory } {
  return {
    wallet: { ...input.wallet, coins: input.wallet.coins + input.reward.coins },
    materials: {
      ...input.materials,
      [input.reward.materialId]:
        input.materials[input.reward.materialId] + input.reward.materialQuantity,
    },
  };
}

export function executeMissionClaimTransaction(input: {
  missions: MissionState;
  wallet: Wallet;
  materials: FarmMaterialInventory;
  missionId: string;
  now: number;
}): {
  missions: MissionState;
  wallet: Wallet;
  materials: FarmMaterialInventory;
} {
  const claimed = claimMissionReward(input.missions, input.missionId, input.now);
  const credited = creditMissionReward({
    wallet: input.wallet,
    materials: input.materials,
    reward: claimed.reward,
  });

  return {
    missions: claimed.state,
    wallet: credited.wallet,
    materials: credited.materials,
  };
}
