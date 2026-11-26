import { describe, expect, it } from 'vitest';
import { FARM_V2_LANDS } from './canonicalLandData';
import {
  createInitialLandEntities,
  harvestMatureLand,
  plantFullBatch,
  settleLandMaturity,
} from './landRuntime';

describe('Farm V2 canonical land runtime', () => {
  it('locks the approved six-land capacities and growth durations', () => {
    expect(FARM_V2_LANDS.map((x) => [x.id, x.capacity, x.growthHours])).toEqual([
      [1, 20, 4],
      [2, 10, 6],
      [3, 6, 8],
      [4, 4, 10],
      [5, 3, 12],
      [6, 1, 60],
    ]);
  });

  it('starts with only land 1 accessible by default', () => {
    const lands = createInitialLandEntities();
    expect(lands.map((x) => x.lifecycle)).toEqual([
      'EMPTY', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED', 'LOCKED',
    ]);
  });

  it('rejects partial sowing and consumes exactly one full batch', () => {
    const land = createInitialLandEntities()[0];
    expect(() => plantFullBatch({ land, availableSeeds: 19, now: 1000 }))
      .toThrow('INSUFFICIENT_SEEDS_FOR_FULL_BATCH');

    const planted = plantFullBatch({ land, availableSeeds: 20, now: 1000 });
    expect(planted.consumedSeeds).toBe(20);
    expect(planted.land.plantedQuantity).toBe(20);
    expect(planted.land.lifecycle).toBe('GROWING');
    expect(planted.land.maturesAt).toBe(1000 + 4 * 60 * 60 * 1000);
  });

  it('matures by authoritative timestamp and harvest returns land to EMPTY', () => {
    const land = createInitialLandEntities()[0];
    const planted = plantFullBatch({ land, availableSeeds: 20, now: 1000 }).land;
    const mature = settleLandMaturity(planted, planted.maturesAt!);
    expect(mature.lifecycle).toBe('MATURE');

    const harvested = harvestMatureLand(mature);
    expect(harvested.harvestedQuantity).toBe(20);
    expect(harvested.land.lifecycle).toBe('EMPTY');
    expect(harvested.land.maturesAt).toBeNull();
  });
});
