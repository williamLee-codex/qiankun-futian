import { describe, expect, it } from 'vitest';
import {
  FARM_PET_FOOD,
  PET_ACTIVE_MS,
  acquireDirectPet,
  createFarmPetState,
  feedAndActivatePet,
  reconcileMilestonePets,
  settlePetActivity,
} from './petRuntime';

describe('Farm V2 pet runtime', () => {
  it('locks pet food at 2 coins and activation costs at 1/2/3/4 food', async () => {
    expect(FARM_PET_FOOD.priceCoins).toBe(2);
    const { FARM_V2_PETS } = await import('./petRuntime');
    expect(FARM_V2_PETS.map((x) => [x.id, x.foodPerActivation])).toEqual([
      ['尋星犬', 1],
      ['辟邪狻猊', 2],
      ['噬時諦聽', 3],
      ['乾坤麒麟', 4],
    ]);
  });

  it('allows only one active pet and switching requires full feeding anew', () => {
    let state = createFarmPetState();
    state = acquireDirectPet(state, '尋星犬');
    state = acquireDirectPet(state, '辟邪狻猊');

    const dog = feedAndActivatePet({ state, petId: '尋星犬', foodAvailable: 1, now: 1000 });
    expect(dog.state.activePetId).toBe('尋星犬');

    const suanni = feedAndActivatePet({
      state: dog.state, petId: '辟邪狻猊', foodAvailable: 2, now: 2000,
    });
    expect(suanni.foodConsumed).toBe(2);
    expect(suanni.state.activePetId).toBe('辟邪狻猊');
    expect(suanni.state.activeUntil).toBe(2000 + PET_ACTIVE_MS);
  });

  it('refeeding the same active pet resets a fresh full 24h window', () => {
    let state = acquireDirectPet(createFarmPetState(), '尋星犬');
    state = feedAndActivatePet({ state, petId: '尋星犬', foodAvailable: 1, now: 1000 }).state;
    const refed = feedAndActivatePet({
      state, petId: '尋星犬', foodAvailable: 1, now: 1000 + 23 * 60 * 60 * 1000,
    });
    expect(refed.foodConsumed).toBe(1);
    expect(refed.state.activeUntil).toBe(1000 + 23 * 60 * 60 * 1000 + PET_ACTIVE_MS);
  });

  it('expires activity after exactly 24h without eating crops', () => {
    let state = acquireDirectPet(createFarmPetState(), '尋星犬');
    state = feedAndActivatePet({ state, petId: '尋星犬', foodAvailable: 1, now: 1000 }).state;
    expect(settlePetActivity(state, 1000 + PET_ACTIVE_MS - 1).activePetId).toBe('尋星犬');
    expect(settlePetActivity(state, 1000 + PET_ACTIVE_MS).activePetId).toBeNull();
  });

  it('grants milestone pets at 450/799 and reclaims them after refund below threshold', () => {
    let state = reconcileMilestonePets({
      state: createFarmPetState(), effectivePaidCrystals: 799, now: 1000,
    });
    expect(state.owned.has('噬時諦聽')).toBe(true);
    expect(state.owned.has('乾坤麒麟')).toBe(true);

    state = feedAndActivatePet({
      state, petId: '乾坤麒麟', foodAvailable: 4, now: 2000,
    }).state;
    state = reconcileMilestonePets({ state, effectivePaidCrystals: 449, now: 3000 });

    expect(state.owned.has('噬時諦聽')).toBe(false);
    expect(state.owned.has('乾坤麒麟')).toBe(false);
    expect(state.activePetId).toBeNull();
    expect(state.activeUntil).toBeNull();
  });
});
