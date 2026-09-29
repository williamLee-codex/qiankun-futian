import { describe, expect, it } from 'vitest';
import { createEmptyFarmWarehouse } from './warehouseRuntime';
import { createMissionState } from './missionRuntime';
import { executeExchangeFromEconomyState } from './economyTransactions';

describe('Farm V2 economy transactions', () => {
  it('exchanges complete units, keeps remainder, and records one mission event', () => {
    const now = Date.UTC(2026, 8, 30, 0);
    const warehouse = createEmptyFarmWarehouse();
    warehouse.crops[1] = 12;

    const result = executeExchangeFromEconomyState({
      state: {
        warehouse,
        wallet: { coins: 0, crystals: 0 },
        missions: createMissionState(now),
      },
      landId: 1,
      cropQuantity: 12,
      now,
    });

    expect(result.cropsConsumed).toBe(10);
    expect(result.rewardQuantity).toBe(2);
    expect(result.warehouse.crops[1]).toBe(2);
    expect(result.wallet.coins).toBe(2);
    expect(result.missions.progress.MISSION_D03.progress).toBe(1);
    expect(result.missions.progress.MISSION_W03.progress).toBe(1);
  });

  it('exchanges chaos crop into crystals', () => {
    const now = Date.UTC(2026, 8, 30, 0);
    const warehouse = createEmptyFarmWarehouse();
    warehouse.crops[6] = 2;

    const result = executeExchangeFromEconomyState({
      state: {
        warehouse,
        wallet: { coins: 5, crystals: 0 },
        missions: createMissionState(now),
      },
      landId: 6,
      cropQuantity: 2,
      now,
    });

    expect(result.wallet.coins).toBe(5);
    expect(result.wallet.crystals).toBe(2);
    expect(result.warehouse.crops[6]).toBe(0);
  });
});
