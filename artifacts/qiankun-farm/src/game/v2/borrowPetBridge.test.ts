import { describe, expect, it } from 'vitest';
import { createFarmPetState, reconcileMilestonePets, feedAndActivatePet } from './petRuntime';
import { toBorrowPetEffects } from './borrowPetBridge';

describe('Farm V2 borrow pet bridge', () => {
  it('does not expose milestone pet effects until the pet is active', () => {
    const owned = reconcileMilestonePets({
      state: createFarmPetState(),
      effectivePaidCrystals: 799,
      now: 0,
    });
    expect(toBorrowPetEffects(owned, 0)).toEqual({
      suanniActive: false,
      tingActive: false,
      qilinActive: false,
    });
  });

  it('maps active Qilin to the independent borrow block effect', () => {
    const owned = reconcileMilestonePets({
      state: createFarmPetState(),
      effectivePaidCrystals: 799,
      now: 0,
    });
    const active = feedAndActivatePet({
      state: owned,
      petId: '乾坤麒麟',
      foodAvailable: 4,
      now: 100,
    }).state;
    expect(toBorrowPetEffects(active, 101)).toEqual({
      suanniActive: false,
      tingActive: false,
      qilinActive: true,
    });
  });
});
