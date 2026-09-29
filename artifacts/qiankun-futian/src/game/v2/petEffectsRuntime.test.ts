import { describe, expect, it } from 'vitest';
import { acquireDirectPet, createFarmPetState, feedAndActivatePet } from './petRuntime';
import { getActiveFarmPetEffects, isFarmPetEffectActive } from './petEffectsRuntime';

describe('Farm V2 active pet effects', () => {
  it('does not grant effects from ownership alone', () => {
    const owned = acquireDirectPet(createFarmPetState(), '辟邪狻猊');
    expect(getActiveFarmPetEffects(owned, 0)).toEqual({
      suanniProtection: false,
      tingSecondField: false,
      qilinBlock: false,
    });
  });

  it('grants only the currently active pet effect', () => {
    const owned = acquireDirectPet(createFarmPetState(), '辟邪狻猊');
    const fed = feedAndActivatePet({
      state: owned,
      petId: '辟邪狻猊',
      foodAvailable: 2,
      now: 1000,
    }).state;
    expect(getActiveFarmPetEffects(fed, 1001)).toEqual({
      suanniProtection: true,
      tingSecondField: false,
      qilinBlock: false,
    });
  });

  it('expires exactly at activeUntil', () => {
    const owned = acquireDirectPet(createFarmPetState(), '尋星犬');
    const fed = feedAndActivatePet({
      state: owned,
      petId: '尋星犬',
      foodAvailable: 1,
      now: 0,
    }).state;
    expect(isFarmPetEffectActive(fed, '尋星犬', 24 * 60 * 60 * 1000 - 1)).toBe(true);
    expect(isFarmPetEffectActive(fed, '尋星犬', 24 * 60 * 60 * 1000)).toBe(false);
  });
});
