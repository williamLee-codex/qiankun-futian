import { describe, expect, it } from 'vitest';
import { createFarmerState, reconcileFarmerEntitlement, setFarmerLandEnabled } from './farmerRuntime';
import { createInitialLandEntities } from './landRuntime';
import { executeFarmerLandTransaction } from './farmerLandTransaction';
import { createEmptyFarmWarehouse } from './warehouseRuntime';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('Farm V2 farmer harvest transaction', () => {
  it('applies the newbie multiplier by each offline harvest maturity time', () => {
    let farmer = reconcileFarmerEntitlement(createFarmerState(), 999);
    farmer = setFarmerLandEnabled(farmer, 2, true);
    const land = {
      ...createInitialLandEntities()[1],
      lifecycle: 'MATURE' as const,
      accessActive: true,
      plantedQuantity: 10,
      plantedAt: 150 * HOUR,
      maturesAt: 156 * HOUR,
    };
    const warehouse = {
      ...createEmptyFarmWarehouse(),
      seeds: { ...createEmptyFarmWarehouse().seeds, 2: 30 },
    };

    const result = executeFarmerLandTransaction({
      farmer,
      land,
      warehouse,
      firstFarmEnteredAt: 0,
      now: 174 * HOUR,
    });

    // Maturity at 156h and 162h is inside the 7-day window; 168h and 174h
    // are outside. Two of four 10-crop harvests receive the x6 multiplier.
    expect(result.rawHarvestedQuantity).toBe(40);
    expect(result.creditedHarvestQuantity).toBe(140);
    expect(result.warehouse.crops[2]).toBe(140);
  });
});
