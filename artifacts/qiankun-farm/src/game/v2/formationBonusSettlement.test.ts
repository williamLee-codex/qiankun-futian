import { describe, expect, it } from 'vitest';
import { createInitialLandEntities } from './landRuntime';
import { createEmptyFarmWarehouse, exchangeCrops } from './warehouseRuntime';
import { createMissionState } from './missionRuntime';
import {
  executeOwnerHarvestTransaction,
  executeSowTransaction,
} from './farmActionTransactions';
import { executeLockedAssistLandTransaction } from './assistLandTransaction';
import { createFriendInteractionState } from './friendInteractionRuntime';
import { executeFarmerLandTransaction } from './farmerLandTransaction';
import { createFarmerState } from './farmerRuntime';
import { PREMIUM_FORMATION_ID } from './formationEffects';
import { emptyFarmQuantities } from './warehouseRuntime';
import type { WorkshopWarehouse } from './workshopRuntime';

const NOW = Date.UTC(2026, 10, 22, 4, 0, 0);
const OLD_ENTRY = NOW - 30 * 86400000;

function warehouse(equipped: boolean, seeds = 0, crops = 0): WorkshopWarehouse {
  return {
    seeds: { ...emptyFarmQuantities(), 1: seeds },
    crops: { ...emptyFarmQuantities(), 1: crops },
    workshop: {
      pots: [],
      decor: [],
      potGallery: {},
      decorGallery: {},
      materials: { 蘊靈砂: 0, 九霄玉髓: 0 },
      formations: equipped
        ? [{ id: PREMIUM_FORMATION_ID, expiresAt: null }]
        : [],
      activeFormation: equipped ? PREMIUM_FORMATION_ID : null,
    },
  };
}

function land(overrides: Partial<ReturnType<typeof createInitialLandEntities>[number]> = {}) {
  return { ...createInitialLandEntities(new Set([1]))[0], ...overrides };
}

describe('FORMATION-EFFECT-001 server settlement', () => {
  it('sows 20% faster while the formation is equipped', () => {
    const planted = executeSowTransaction({
      state: {
        land: land(),
        warehouse: warehouse(true, 20),
        missions: createMissionState(NOW),
      },
      now: NOW,
    });
    expect(planted.land.maturesAt).toBe(NOW + 12_000_000);

    const plain = executeSowTransaction({
      state: {
        land: land(),
        warehouse: warehouse(false, 20),
        missions: createMissionState(NOW),
      },
      now: NOW,
    });
    expect(plain.land.maturesAt).toBe(NOW + 14_400_000);
  });

  it('credits 15% more crops once, without double counting the newbie window', () => {
    const mature = land({
      lifecycle: 'MATURE',
      plantedQuantity: 20,
      plantedAt: NOW - 4 * 3600_000,
      maturesAt: NOW - 1000,
    });
    const result = executeOwnerHarvestTransaction({
      state: {
        land: mature,
        warehouse: warehouse(true),
        missions: createMissionState(NOW),
      },
      firstFarmEnteredAt: OLD_ENTRY,
      now: NOW,
    });
    expect(result.creditedQuantity).toBe(23);
    expect(result.warehouse.crops[1]).toBe(23);

    const newbie = executeOwnerHarvestTransaction({
      state: {
        land: land({
          lifecycle: 'MATURE',
          plantedQuantity: 10,
          plantedAt: NOW - 4 * 3600_000,
          maturesAt: NOW - 1000,
        }),
        warehouse: warehouse(true),
        missions: createMissionState(NOW),
      },
      firstFarmEnteredAt: NOW - 1000,
      now: NOW,
    });
    // ceil(10 * 1.15) = 12, then the x6 newbie window: 72 (not 10 * 6 * 1.15 = 69).
    expect(newbie.creditedQuantity).toBe(72);
  });

  it('adds 15% coins on crop exchange and leaves crystal exchange untouched', () => {
    const coinSale = exchangeCrops({
      warehouse: { ...createEmptyFarmWarehouse(), crops: { ...emptyFarmQuantities(), 3: 10 } },
      wallet: { coins: 0, crystals: 0 },
      landId: 3,
      cropQuantity: 10,
    });
    expect(coinSale.rewardQuantity).toBe(10);

    const bonused = exchangeCrops({
      warehouse: { ...createEmptyFarmWarehouse(), crops: { ...emptyFarmQuantities(), 3: 10 } },
      wallet: { coins: 0, crystals: 0 },
      landId: 3,
      cropQuantity: 10,
      bonuses: {
        growthSpeed: { numerator: 120, denominator: 100 },
        harvestYield: { numerator: 115, denominator: 100 },
        coinReward: { numerator: 115, denominator: 100 },
        petAssist: { numerator: 120, denominator: 100 },
      },
    });
    expect(bonused.rewardQuantity).toBe(12);
    expect(bonused.wallet.coins).toBe(12);

    const crystals = exchangeCrops({
      warehouse: { ...createEmptyFarmWarehouse(), crops: { ...emptyFarmQuantities(), 6: 10 } },
      wallet: { coins: 0, crystals: 0 },
      landId: 6,
      cropQuantity: 10,
      bonuses: {
        growthSpeed: { numerator: 120, denominator: 100 },
        harvestYield: { numerator: 115, denominator: 100 },
        coinReward: { numerator: 115, denominator: 100 },
        petAssist: { numerator: 120, denominator: 100 },
      },
    });
    expect(crystals.rewardQuantity).toBe(10);
  });

  it('applies the yield bonus once on the farmer offline settlement', () => {
    const H = 3600000;
    const run = (equipped: boolean) => {
      const seeded = { ...warehouse(equipped), seeds: { ...emptyFarmQuantities(), 1: 20 } };
      return executeFarmerLandTransaction({
        farmer: {
          ...createFarmerState(),
          entitled: true,
          enabledByLand: { 1: true, 2: false, 3: false, 4: false, 5: false, 6: false },
        },
        land: {
          landId: 1,
          lifecycle: 'GROWING',
          accessActive: true,
          plantedQuantity: 20,
          plantedAt: NOW - 4 * H,
          maturesAt: NOW - H,
        },
        warehouse: seeded,
        firstFarmEnteredAt: OLD_ENTRY,
        now: NOW,
      });
    };
    expect(run(false).creditedHarvestQuantity).toBe(20);
    expect(run(true).creditedHarvestQuantity).toBe(23);
  });

  it('gives the assisting helper 12% while the helper owns the formation', () => {
    const target = land({
      landId: 2,
      lifecycle: 'MATURE',
      plantedQuantity: 10,
      plantedAt: NOW - 6 * 3600_000,
      maturesAt: NOW - 1000,
    });
    const base = executeLockedAssistLandTransaction({
      interactionState: createFriendInteractionState(NOW),
      friendUid: 'friend',
      now: NOW,
      mutualFriends: true,
      targetFarmerActive: false,
      land: target,
      ownerWarehouse: warehouse(false),
      helperWarehouse: warehouse(false),
      ownerFirstFarmEnteredAt: OLD_ENTRY,
    });
    expect(base.helperBonusQuantity).toBe(1);

    const bonused = executeLockedAssistLandTransaction({
      interactionState: createFriendInteractionState(NOW),
      friendUid: 'friend',
      now: NOW,
      mutualFriends: true,
      targetFarmerActive: false,
      land: target,
      ownerWarehouse: warehouse(false),
      helperWarehouse: warehouse(true),
      ownerFirstFarmEnteredAt: OLD_ENTRY,
    });
    expect(bonused.ownerHarvestQuantity).toBe(10);
    expect(bonused.helperBonusQuantity).toBe(2);
  });
});
