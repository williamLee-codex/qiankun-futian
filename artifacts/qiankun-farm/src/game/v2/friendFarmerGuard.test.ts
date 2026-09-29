import { describe, expect, it } from 'vitest';
import { createFarmerState, reconcileFarmerEntitlement, setFarmerLandEnabled } from './farmerRuntime';
import { targetFarmerBlocksRequestedLands } from './friendFarmerGuard';

describe('Farm V2 friend farmer guard', () => {
  it('blocks a multi-land request when one requested land is automated', () => {
    let farmer = reconcileFarmerEntitlement(createFarmerState(), 999);
    farmer = setFarmerLandEnabled(farmer, 4, true);
    expect(targetFarmerBlocksRequestedLands(farmer, [2, 4])).toBe(true);
  });

  it('allows requested lands whose farmer switches are off', () => {
    let farmer = reconcileFarmerEntitlement(createFarmerState(), 999);
    farmer = setFarmerLandEnabled(farmer, 4, true);
    expect(targetFarmerBlocksRequestedLands(farmer, [2, 3])).toBe(false);
  });
});
