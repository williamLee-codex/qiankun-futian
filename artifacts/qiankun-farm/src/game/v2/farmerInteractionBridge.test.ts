import { describe, expect, it } from 'vitest';
import { createFarmerState, reconcileFarmerEntitlement, setFarmerLandEnabled } from './farmerRuntime';
import {
  isFarmerActiveOnAnyLand,
  isFarmerActiveOnLand,
  targetFarmerBlocksLandInteraction,
} from './farmerInteractionBridge';

describe('Farm V2 farmer interaction bridge', () => {
  it('does not treat entitlement alone as active automation', () => {
    const farmer = reconcileFarmerEntitlement(createFarmerState(), 999);
    expect(isFarmerActiveOnAnyLand(farmer)).toBe(false);
    expect(isFarmerActiveOnLand(farmer, 2)).toBe(false);
  });

  it('blocks only a land whose farmer switch is enabled', () => {
    let farmer = reconcileFarmerEntitlement(createFarmerState(), 999);
    farmer = setFarmerLandEnabled(farmer, 2, true);
    expect(targetFarmerBlocksLandInteraction(farmer, 2)).toBe(true);
    expect(targetFarmerBlocksLandInteraction(farmer, 3)).toBe(false);
  });

  it('disabled entitlement cannot activate a stale per-land switch', () => {
    let farmer = setFarmerLandEnabled(createFarmerState(), 2, true);
    farmer = reconcileFarmerEntitlement(farmer, 998);
    expect(isFarmerActiveOnLand(farmer, 2)).toBe(false);
  });
});
