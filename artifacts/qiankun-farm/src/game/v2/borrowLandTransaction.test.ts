import { describe, expect, it } from 'vitest';
import { createFriendInteractionState } from './friendInteractionRuntime';
import { createEmptyFarmWarehouse } from './warehouseRuntime';
import { executeLockedBorrowLandTransaction } from './borrowLandTransaction';

describe('Farm V2 locked borrow land transaction', () => {
  it('persists borrowed quantity and credits borrower warehouse', () => {
    const now = 10 * 60 * 60 * 1000;
    const result = executeLockedBorrowLandTransaction({
      interactionState: createFriendInteractionState(now),
      friendUid: 'owner',
      now,
      mutualFriends: true,
      targetFarmerActive: false,
      lands: [{
        landId: 2,
        lifecycle: 'MATURE',
        accessActive: true,
        plantedQuantity: 10,
        plantedAt: 0,
        maturesAt: 6 * 60 * 60 * 1000,
      }],
      pets: { suanniActive: false, tingActive: false, qilinActive: false },
      rng: { next: () => 0.99 },
      borrowerWarehouse: createEmptyFarmWarehouse(),
    });

    expect(result.successful).toBe(true);
    expect(result.lands[0].plantedQuantity).toBe(7);
    expect(result.lands[0].lifecycle).toBe('MATURE');
    expect(result.borrowerWarehouse.crops[2]).toBe(3);
  });

  it('never reduces the target batch below one crop', () => {
    const now = 10 * 60 * 60 * 1000;
    const result = executeLockedBorrowLandTransaction({
      interactionState: createFriendInteractionState(now),
      friendUid: 'owner',
      now,
      mutualFriends: true,
      targetFarmerActive: false,
      lands: [{
        landId: 2,
        lifecycle: 'MATURE',
        accessActive: true,
        plantedQuantity: 2,
        plantedAt: 0,
        maturesAt: 6 * 60 * 60 * 1000,
      }],
      pets: { suanniActive: false, tingActive: false, qilinActive: false },
      rng: { next: () => 0.99 },
      borrowerWarehouse: createEmptyFarmWarehouse(),
    });
    expect(result.lands[0].plantedQuantity).toBe(1);
    expect(result.borrowerWarehouse.crops[2]).toBe(1);
  });
});
