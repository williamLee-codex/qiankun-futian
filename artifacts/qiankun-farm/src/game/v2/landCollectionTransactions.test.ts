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
    const enteredAt = Date.parse("2026-11-01T00:00:00Z");
    const now = enteredAt + 5 * 60 * 60 * 1000;
    const lands = createInitialLandEntities(new Set([1, 2]));
    lands[0] = {
      ...lands[0],
      lifecycle: 'MATURE',
      plantedQuantity: 20,
      plantedAt: enteredAt,
      maturesAt: enteredAt + 4 * 60 * 60 * 1000,
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

describe('all six lands share the persisted first-entry boundary', () => {
  for (const landId of [1,2,3,4,5,6] as const) {
    for (const [offset,multiplier] of [[7*86400000-1,6],[7*86400000,1]] as const) {
      it(`settles field ${landId} with x${multiplier} at offset ${offset}`, () => {
        const first = Date.parse('2026-11-01T00:00:00Z');
        const now = first+offset;
        const lands = createInitialLandEntities(new Set([1,2,3,4,5,6]));
        lands[landId-1] = {...lands[landId-1],lifecycle:'MATURE',plantedQuantity:20,plantedAt:first,maturesAt:now};
        const result=executeOwnerHarvestOnLand({state:{lands,warehouse:createEmptyFarmWarehouse(),missions:createMissionState(now)},landId,firstFarmEnteredAt:first,now});
        expect(result.creditedQuantity).toBe(20*multiplier);
        expect(result.warehouse.crops[landId]).toBe(20*multiplier);
      });
    }
  }
});
