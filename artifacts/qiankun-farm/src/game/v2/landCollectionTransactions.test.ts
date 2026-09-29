import { describe, expect, it } from 'vitest';
import { createInitialLandEntities } from './landRuntime';
import { createEmptyFarmWarehouse } from './warehouseRuntime';
import { createMissionState } from './missionRuntime';
import { executeOwnerHarvestOnLand, executeSowOnLand } from './landCollectionTransactions';

describe('Farm V2 land collection transactions', () => {
  it('sows only the selected land and records one sow mission event', () => {
    const now = Date.UTC(2026, 8, 30, 0);
    const warehouse = createEmptyFarmWarehouse();
    warehouse.seeds[1] = 20;
    const state = executeSowOnLand({
      state: {
        lands: createInitialLandEntities(new Set([1])),
        warehouse,
        missions: createMissionState(now),
      },
      landId: 1,
      now,
    });
    expect(state.lands.find((x) => x.landId === 1)?.lifecycle).toBe('GROWING');
    expect(state.warehouse.seeds[1]).toBe(0);
    expect(state.missions.progress.MISSION_D01.progress).toBe(1);
  });

  it('harvests selected mature land and preserves all other lands', () => {
    const enteredAt = 0;
    const now = 5 * 60 * 60 * 1000;
    const lands = createInitialLandEntities(new Set([1, 2]));
    lands[0] = {
      ...lands[0],
      lifecycle: 'MATURE',
      plantedQuantity: 20,
      plantedAt: 0,
      maturesAt: 4 * 60 * 60 * 1000,
    };
    const land2Before = lands[1];

    const result = executeOwnerHarvestOnLand({
      state: {
        lands,
        warehouse: createEmptyFarmWarehouse(),
        missions: createMissionState(now),
      },
      landId: 1,
      firstFarmEnteredAt: enteredAt,
      now,
    });
    expect(result.creditedQuantity).toBe(120);
    expect(result.lands[0].lifecycle).toBe('EMPTY');
    expect(result.lands[1]).toEqual(land2Before);
    expect(result.missions.progress.MISSION_D02.progress).toBe(1);
  });
});
