import { describe, expect, it } from 'vitest';
import { createFriendInteractionState } from './friendInteractionRuntime';
import { createEmptyFarmWarehouse } from './warehouseRuntime';
import { executeLockedAssistLandTransaction } from './assistLandTransaction';

describe('Farm V2 locked assist land transaction', () => {
  it('empties the mature target batch after successful assist', () => {
    const now = 10 * 60 * 60 * 1000;
    const result = executeLockedAssistLandTransaction({
      interactionState: createFriendInteractionState(now),
      friendUid: 'friend',
      now,
      mutualFriends: true,
      targetFarmerActive: false,
      land: {
        landId: 2,
        lifecycle: 'MATURE',
        accessActive: true,
        plantedQuantity: 10,
        plantedAt: 0,
        maturesAt: 6 * 60 * 60 * 1000,
      },
      ownerWarehouse: createEmptyFarmWarehouse(),
      helperWarehouse: createEmptyFarmWarehouse(),
      ownerFirstFarmEnteredAt: null,
    });
    expect(result.successful).toBe(true);
    expect(result.land.lifecycle).toBe('EMPTY');
    expect(result.land.plantedQuantity).toBe(0);
    expect(result.ownerWarehouse.crops[2]).toBe(10);
    expect(result.helperWarehouse.crops[2]).toBe(1);
  });

  it('leaves land untouched when assist cannot settle', () => {
    const now = 10 * 60 * 60 * 1000;
    const land = {
      landId: 2 as const,
      lifecycle: 'GROWING' as const,
      accessActive: true,
      plantedQuantity: 10,
      plantedAt: now,
      maturesAt: now + 1000,
    };
    const result = executeLockedAssistLandTransaction({
      interactionState: createFriendInteractionState(now),
      friendUid: 'friend',
      now,
      mutualFriends: true,
      targetFarmerActive: false,
      land,
      ownerWarehouse: createEmptyFarmWarehouse(),
      helperWarehouse: createEmptyFarmWarehouse(),
      ownerFirstFarmEnteredAt: null,
    });
    expect(result.successful).toBe(false);
    expect(result.land).toEqual(land);
  });
});
