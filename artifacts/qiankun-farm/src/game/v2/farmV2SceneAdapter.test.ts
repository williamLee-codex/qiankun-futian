import { describe, expect, it } from 'vitest';
import { mapServerLands, mapServerWarehouse } from './farmV2SceneAdapter';

const lands = Array.from({ length: 6 }, (_, index) => ({
  landId: index + 1,
  lifecycle: index === 5 ? 'MATURE' : index === 0 ? 'GROWING' : 'LOCKED',
  accessActive: index === 0 || index === 5,
  plantedQuantity: index === 5 ? 1 : index === 0 ? 20 : 0,
  maturesAt: index === 5 ? '2026-10-01T00:00:00Z' : index === 0 ? '2099-01-01T00:00:00Z' : null,
}));

describe('Farm V2 scene adapter', () => {
  it('maps six server IDs to the six scene indices without changing land 6', () => {
    const plots = mapServerLands(lands);
    expect(plots.map(p => p.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(plots[0].state).toBe('growing');
    expect(plots[0].plantCount).toBe(20);
    expect(plots[1].unlocked).toBe(false);
    expect(plots[5].unlocked).toBe(true);
    expect(plots[5].state).toBe('ready');
    expect(plots[5].plantCount).toBe(1);
    expect(plots[5].growthHours).toBe(60);
  });

  it('rejects duplicate or missing server lands', () => {
    expect(() => mapServerLands([...lands.slice(0, 5), lands[0]])).toThrow('INVALID_FARM_LANDS');
    expect(() => mapServerLands(lands.slice(0, 5))).toThrow('INVALID_FARM_LANDS');
    expect(() => mapServerLands([...lands.slice(0, 5), { ...lands[5], landId: 7 }])).toThrow('MISSING_FARM_LAND');
  });

  it('rejects impossible land quantities, lifecycles and missing maturity', () => {
    expect(() => mapServerLands(lands.map((land, index) =>
      index === 0 ? { ...land, plantedQuantity: 21 } : land,
    ))).toThrow('INVALID_PLANTED_QUANTITY');
    expect(() => mapServerLands(lands.map((land, index) =>
      index === 0 ? { ...land, lifecycle: 'UNKNOWN' } : land,
    ))).toThrow('INVALID_LAND_LIFECYCLE');
    expect(() => mapServerLands(lands.map((land, index) =>
      index === 0 ? { ...land, maturesAt: null } : land,
    ))).toThrow('MISSING_MATURITY');
  });

  it('maps warehouse quantities by authoritative land ID', () => {
    const seeds = { '1': 20, '2': 10, '3': 6, '4': 4, '5': 3, '6': 1 };
    const crops = { '1': 100, '2': 10, '3': 6, '4': 4, '5': 3, '6': 6 };
    const result = mapServerWarehouse({ seeds, crops });
    expect(result.seedInventory.yaojin).toBe(20);
    expect(result.seedInventory.heijin).toBe(1);
    expect(result.cropInventory.heijin).toBe(6);
  });

  it('rejects missing and negative inventory instead of displaying fabricated stock', () => {
    expect(() => mapServerWarehouse({ seeds: { '1': 1 }, crops: {} })).toThrow('INVALID_FARM_INVENTORY');
    const quantities = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [String(i + 1), 0]));
    expect(() => mapServerWarehouse({ seeds: { ...quantities, '6': -1 }, crops: quantities })).toThrow('INVALID_FARM_INVENTORY');
  });
});
