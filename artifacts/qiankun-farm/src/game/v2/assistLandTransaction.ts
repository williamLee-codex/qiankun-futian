import type { FarmLandEntity } from './landRuntime';
import type { FarmWarehouse } from './warehouseRuntime';
import type { FriendInteractionState } from './friendInteractionRuntime';
import { executeAssistHarvestTransaction } from './assistHarvestTransaction';
import { formationBonuses, type FormationBonuses } from './formationEffects';

export function executeLockedAssistLandTransaction(input: {
  interactionState: FriendInteractionState;
  friendUid: string;
  now: number;
  mutualFriends: boolean;
  targetFarmerActive: boolean;
  land: FarmLandEntity;
  ownerWarehouse: FarmWarehouse;
  helperWarehouse: FarmWarehouse;
  ownerFirstFarmEnteredAt: number | null;
  ownerBonuses?: FormationBonuses;
  helperBonuses?: FormationBonuses;
}): {
  interactionState: FriendInteractionState;
  land: FarmLandEntity;
  ownerWarehouse: FarmWarehouse;
  helperWarehouse: FarmWarehouse;
  ownerHarvestQuantity: number;
  helperBonusQuantity: number;
  successful: boolean;
} {
  const result = executeAssistHarvestTransaction({
    interactionState: input.interactionState,
    friendUid: input.friendUid,
    now: input.now,
    mutualFriends: input.mutualFriends,
    targetFarmerActive: input.targetFarmerActive,
    target: {
      landId: input.land.landId,
      currentQuantity: input.land.plantedQuantity,
      maturesAt: input.land.maturesAt ?? Number.POSITIVE_INFINITY,
    },
    ownerWarehouse: input.ownerWarehouse,
    helperWarehouse: input.helperWarehouse,
    ownerFirstFarmEnteredAt: input.ownerFirstFarmEnteredAt,
    ownerBonuses:
      input.ownerBonuses ?? formationBonuses(input.ownerWarehouse, input.now),
    helperBonuses:
      input.helperBonuses ?? formationBonuses(input.helperWarehouse, input.now),
  });

  if (!result.successful) return { ...result, land: input.land };

  return {
    ...result,
    land: {
      ...input.land,
      lifecycle: 'EMPTY',
      plantedQuantity: 0,
      plantedAt: null,
      maturesAt: null,
    },
  };
}
