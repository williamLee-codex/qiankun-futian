import type { FarmLandEntity } from './landRuntime';
import type { FarmLandId } from './canonicalLandData';
import type { FarmWarehouse } from './warehouseRuntime';
import type { FriendInteractionState } from './friendInteractionRuntime';
import type { BorrowPetEffects, BorrowRandomSource } from './borrowRuntime';
import { executeBorrowHarvestTransaction } from './borrowHarvestTransaction';

export function executeLockedBorrowLandTransaction(input: {
  interactionState: FriendInteractionState;
  friendUid: string;
  now: number;
  mutualFriends: boolean;
  targetFarmerActive: boolean;
  lands: readonly FarmLandEntity[];
  pets: BorrowPetEffects;
  rng: BorrowRandomSource;
  borrowerWarehouse: FarmWarehouse;
}): {
  interactionState: FriendInteractionState;
  lands: FarmLandEntity[];
  borrowerWarehouse: FarmWarehouse;
  successful: boolean;
} {
  const targets = input.lands.map((land) => ({
    landId: land.landId,
    currentQuantity: land.plantedQuantity,
    maturesAt: land.maturesAt ?? Number.POSITIVE_INFINITY,
  }));

  const result = executeBorrowHarvestTransaction({
    interactionState: input.interactionState,
    friendUid: input.friendUid,
    now: input.now,
    mutualFriends: input.mutualFriends,
    targetFarmerActive: input.targetFarmerActive,
    targets,
    pets: input.pets,
    rng: input.rng,
    borrowerWarehouse: input.borrowerWarehouse,
  });

  if (!result.successful) {
    return {
      interactionState: result.interactionState,
      lands: [...input.lands],
      borrowerWarehouse: result.borrowerWarehouse,
      successful: false,
    };
  }

  const lands = input.lands.map((land) => {
    const remaining = result.remainingByLand[land.landId as FarmLandId];
    if (remaining === undefined) return land;
    return { ...land, plantedQuantity: remaining };
  });

  return {
    interactionState: result.interactionState,
    lands,
    borrowerWarehouse: result.borrowerWarehouse,
    successful: true,
  };
}
