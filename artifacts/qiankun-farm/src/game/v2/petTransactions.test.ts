import { describe, expect, it } from 'vitest';
import { acquireDirectPet, createFarmPetState, PET_ACTIVE_MS } from './petRuntime';
import {
  buyPetFood,
  createEmptyFarmPetFoodInventory,
  feedPetFromInventory,
  purchaseDirectPet,
} from './petTransactions';

describe('Farm V2 pet transactions', () => {
  it('buys pet food for exactly 2 coins per unit', () => {
    const result = buyPetFood({
      wallet: { coins: 10, crystals: 0 },
      food: createEmptyFarmPetFoodInventory(),
      quantity: 3,
    });
    expect(result.wallet.coins).toBe(4);
    expect(result.food.靈獸百味糧).toBe(3);
  });

  it('purchases dog with coins and Suanni with crystals', () => {
    let state = createFarmPetState();
    const dog = purchaseDirectPet({
      state,
      wallet: { coins: 300, crystals: 100 },
      petId: '尋星犬',
    });
    expect(dog.wallet.coins).toBe(0);
    expect(dog.state.owned.has('尋星犬')).toBe(true);

    const suanni = purchaseDirectPet({
      state: dog.state,
      wallet: dog.wallet,
      petId: '辟邪狻猊',
    });
    expect(suanni.wallet.crystals).toBe(0);
    expect(suanni.state.owned.has('辟邪狻猊')).toBe(true);
  });

  it('consumes stored food and starts a fresh 24h activation', () => {
    const state = acquireDirectPet(createFarmPetState(), '辟邪狻猊');
    const result = feedPetFromInventory({
      state,
      food: { 靈獸百味糧: 5 },
      petId: '辟邪狻猊',
      now: 1000,
    });
    expect(result.food.靈獸百味糧).toBe(3);
    expect(result.state.activePetId).toBe('辟邪狻猊');
    expect(result.state.activeUntil).toBe(1000 + PET_ACTIVE_MS);
  });

  it('does not mutate balances when purchase or feeding is insufficient', () => {
    const wallet = { coins: 299, crystals: 0 };
    expect(() => purchaseDirectPet({
      state: createFarmPetState(),
      wallet,
      petId: '尋星犬',
    })).toThrow('INSUFFICIENT_CURRENCY');
    expect(wallet.coins).toBe(299);

    const state = acquireDirectPet(createFarmPetState(), '辟邪狻猊');
    const food = { 靈獸百味糧: 1 };
    expect(() => feedPetFromInventory({
      state,
      food,
      petId: '辟邪狻猊',
      now: 0,
    })).toThrow('INSUFFICIENT_PET_FOOD');
    expect(food.靈獸百味糧).toBe(1);
  });
});
