import { describe, expect, it } from 'vitest';
import { createInitialLandEntities } from './landRuntime';
import {
  createFarmerState,
  reconcileFarmerEntitlement,
  setFarmerLandEnabled,
  settleFarmerLand,
} from './farmerRuntime';

const HOUR = 60 * 60 * 1000;

describe('Farm V2 farmer runtime', () => {
  it('unlocks only at effective paid 999', () => {
    let farmer = createFarmerState();
    farmer = reconcileFarmerEntitlement(farmer, 998);
    expect(farmer.entitled).toBe(false);
    farmer = reconcileFarmerEntitlement(farmer, 999);
    expect(farmer.entitled).toBe(true);
  });

  it('is independently enabled per land', () => {
    let farmer = reconcileFarmerEntitlement(createFarmerState(), 999);
    farmer = setFarmerLandEnabled(farmer, 2, true);
    expect(farmer.enabledByLand[2]).toBe(true);
    expect(farmer.enabledByLand[3]).toBe(false);
  });

  it('does nothing when disabled, not entitled, or access is suspended', () => {
    const land = {
      ...createInitialLandEntities()[1],
      lifecycle: 'MATURE' as const,
      accessActive: true,
      plantedQuantity: 10,
      plantedAt: 0,
      maturesAt: 6 * HOUR,
    };
    const farmer = createFarmerState();
    expect(settleFarmerLand({ farmer, land, seedsAvailable: 100, now: 20 * HOUR }))
      .toEqual({ land, seedsRemaining: 100, harvestedQuantity: 0, completedCycles: 0 });
  });

  it('settles only complete cycles and never creates seed debt', () => {
    let farmer = reconcileFarmerEntitlement(createFarmerState(), 999);
    farmer = setFarmerLandEnabled(farmer, 2, true);
    const land = {
      ...createInitialLandEntities()[1],
      lifecycle: 'GROWING' as const,
      accessActive: true,
      plantedQuantity: 10,
      plantedAt: 0,
      maturesAt: 6 * HOUR,
    };

    const result = settleFarmerLand({
      farmer,
      land,
      seedsAvailable: 25,
      now: 20 * HOUR,
    });

    // Existing batch harvests at 6h; seed batches at 12h and 18h harvest.
    // Only 5 seeds remain, so no new full 10-seed batch can be planted.
    expect(result.harvestedQuantity).toBe(30);
    expect(result.completedCycles).toBe(3);
    expect(result.seedsRemaining).toBe(5);
    expect(result.land.lifecycle).toBe('EMPTY');
  });

  it('leaves the first not-yet-mature replanted batch growing', () => {
    let farmer = reconcileFarmerEntitlement(createFarmerState(), 999);
    farmer = setFarmerLandEnabled(farmer, 2, true);
    const land = {
      ...createInitialLandEntities()[1],
      lifecycle: 'GROWING' as const,
      accessActive: true,
      plantedQuantity: 10,
      plantedAt: 0,
      maturesAt: 6 * HOUR,
    };

    const result = settleFarmerLand({
      farmer,
      land,
      seedsAvailable: 20,
      now: 13 * HOUR,
    });

    expect(result.harvestedQuantity).toBe(20);
    expect(result.completedCycles).toBe(2);
    expect(result.seedsRemaining).toBe(0);
    expect(result.land.lifecycle).toBe('GROWING');
    expect(result.land.plantedAt).toBe(12 * HOUR);
    expect(result.land.maturesAt).toBe(18 * HOUR);
  });

  it('field 6 consumes only stored chaos seeds and never creates pending seeds', () => {
    let farmer = reconcileFarmerEntitlement(createFarmerState(), 999);
    farmer = setFarmerLandEnabled(farmer, 6, true);
    const land = {
      ...createInitialLandEntities()[5],
      lifecycle: 'EMPTY' as const,
      accessActive: true,
    };

    const noSeed = settleFarmerLand({ farmer, land, seedsAvailable: 0, now: 1000 });
    expect(noSeed.land.lifecycle).toBe('EMPTY');
    expect(noSeed.seedsRemaining).toBe(0);

    const oneSeed = settleFarmerLand({ farmer, land, seedsAvailable: 1, now: 1000 });
    expect(oneSeed.land.lifecycle).toBe('GROWING');
    expect(oneSeed.seedsRemaining).toBe(0);
    expect(oneSeed.land.maturesAt).toBe(1000 + 60 * HOUR);
  });
});
