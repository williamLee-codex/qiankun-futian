import {
  FARM_PET_FOOD,
  acquireDirectPet,
  feedAndActivatePet,
  getPetDefinition,
  type FarmPetId,
  type FarmPetState,
} from './petRuntime';
import type { Wallet } from './warehouseRuntime';

export interface FarmPetFoodInventory {
  靈獸百味糧: number;
}

export function createEmptyFarmPetFoodInventory(): FarmPetFoodInventory {
  return { 靈獸百味糧: 0 };
}

export function buyPetFood(input: {
  wallet: Wallet;
  food: FarmPetFoodInventory;
  quantity: number;
}): { wallet: Wallet; food: FarmPetFoodInventory } {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) throw new Error('INVALID_FOOD_QUANTITY');
  const cost = FARM_PET_FOOD.priceCoins * input.quantity;
  if (input.wallet.coins < cost) throw new Error('INSUFFICIENT_COINS');
  return {
    wallet: { ...input.wallet, coins: input.wallet.coins - cost },
    food: { 靈獸百味糧: input.food.靈獸百味糧 + input.quantity },
  };
}

export function purchaseDirectPet(input: {
  state: FarmPetState;
  wallet: Wallet;
  petId: '尋星犬' | '辟邪狻猊';
}): { state: FarmPetState; wallet: Wallet } {
  if (input.state.owned.has(input.petId)) throw new Error('PET_ALREADY_OWNED');
  const pet = getPetDefinition(input.petId);
  if (pet.acquisition.kind === 'effectivePaidCrystals') throw new Error('PET_NOT_DIRECT_PURCHASE');

  if (input.wallet[pet.acquisition.kind] < pet.acquisition.amount) {
    throw new Error('INSUFFICIENT_CURRENCY');
  }

  return {
    state: acquireDirectPet(input.state, input.petId),
    wallet: {
      ...input.wallet,
      [pet.acquisition.kind]: input.wallet[pet.acquisition.kind] - pet.acquisition.amount,
    },
  };
}

export function feedPetFromInventory(input: {
  state: FarmPetState;
  food: FarmPetFoodInventory;
  petId: FarmPetId;
  now: number;
}): { state: FarmPetState; food: FarmPetFoodInventory } {
  const fed = feedAndActivatePet({
    state: input.state,
    petId: input.petId,
    foodAvailable: input.food.靈獸百味糧,
    now: input.now,
  });

  return {
    state: fed.state,
    food: { 靈獸百味糧: input.food.靈獸百味糧 - fed.foodConsumed },
  };
}
