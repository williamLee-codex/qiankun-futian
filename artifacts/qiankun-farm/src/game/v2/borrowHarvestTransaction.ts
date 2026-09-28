import type { FarmLandId } from './canonicalLandData';
import type { FarmWarehouse } from './warehouseRuntime';
import type { FriendInteractionState } from './friendInteractionRuntime';
import { executeBorrowAction } from './borrowAction';
import type { BorrowPetEffects, BorrowRandomSource, BorrowTarget } from './borrowRuntime';

function addBorrowedCrops(
  warehouse: FarmWarehouse,
  quantities: Partial<Record<FarmLandId, number>>,
): FarmWarehouse {
  const crops = { ...warehouse.crops };
  for (const [rawId, quantity] of Object.entries(quantities)) {
    const landId = Number(rawId) as FarmLandId;
    crops[landId] = (crops[landId] ?? 0) + (quantity ?? 0);
  }
  return { ...warehouse, crops };
}

/**
 * Server transaction primitive after all target land rows are locked/re-read.
 * Returns target quantities to persist plus the borrower's warehouse result.
 */
export function executeBorrowHarvestTransaction(input: {
  interactionState: FriendInteractionState;
  friendUid: string;
  now: number;
  mutualFriends: boolean;
  targetFarmerActive: boolean;
  targets: readonly BorrowTarget[];
  pets: BorrowPetEffects;
  rng: BorrowRandomSource;
  borrowerWarehouse: FarmWarehouse;
}): {
  interactionState: FriendInteractionState;
  borrowerWarehouse: FarmWarehouse;
  remainingByLand: Partial<Record<FarmLandId, number>>;
  successful: boolean;
} {
  const action = executeBorrowAction({
    interactionState: input.interactionState,
    friendUid: input.friendUid,
    now: input.now,
    mutualFriends: input.mutualFriends,
    targetFarmerActive: input.targetFarmerActive,
    targets: input.targets,
    pets: input.pets,
    rng: input.rng,
  });

  if (!action.settlement.successful) {
    return {
      interactionState: action.interactionState,
      borrowerWarehouse: input.borrowerWarehouse,
      remainingByLand: {},
      successful: false,
    };
  }

  const borrowed: Partial<Record<FarmLandId, number>> = {};
  const remainingByLand: Partial<Record<FarmLandId, number>> = {};
  for (const field of action.settlement.fields) {
    remainingByLand[field.landId] = field.remainingQuantity;
    if (field.borrowedQuantity > 0) borrowed[field.landId] = field.borrowedQuantity;
  }

  return {
    interactionState: action.interactionState,
    borrowerWarehouse: addBorrowedCrops(input.borrowerWarehouse, borrowed),
    remainingByLand,
    successful: true,
  };
}
