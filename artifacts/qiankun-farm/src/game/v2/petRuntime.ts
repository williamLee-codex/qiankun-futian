export type FarmPetId = '尋星犬' | '辟邪狻猊' | '噬時諦聽' | '乾坤麒麟';

export interface FarmPetDefinition {
  id: FarmPetId;
  foodPerActivation: number;
  acquisition:
    | { kind: 'coins'; amount: number }
    | { kind: 'crystals'; amount: number }
    | { kind: 'effectivePaidCrystals'; amount: 450 | 799 };
}

export const FARM_PET_FOOD = {
  id: '靈獸百味糧',
  priceCoins: 2,
} as const;

export const FARM_V2_PETS: readonly FarmPetDefinition[] = [
  { id: '尋星犬', foodPerActivation: 1, acquisition: { kind: 'coins', amount: 300 } },
  { id: '辟邪狻猊', foodPerActivation: 2, acquisition: { kind: 'crystals', amount: 100 } },
  { id: '噬時諦聽', foodPerActivation: 3, acquisition: { kind: 'effectivePaidCrystals', amount: 450 } },
  { id: '乾坤麒麟', foodPerActivation: 4, acquisition: { kind: 'effectivePaidCrystals', amount: 799 } },
] as const;

export const PET_ACTIVE_MS = 24 * 60 * 60 * 1000;

export interface FarmPetState {
  owned: ReadonlySet<FarmPetId>;
  activePetId: FarmPetId | null;
  activeUntil: number | null;
}

export function getPetDefinition(id: FarmPetId): FarmPetDefinition {
  const pet = FARM_V2_PETS.find((x) => x.id === id);
  if (!pet) throw new Error('UNKNOWN_PET');
  return pet;
}

export function createFarmPetState(): FarmPetState {
  return { owned: new Set(), activePetId: null, activeUntil: null };
}

export function settlePetActivity(state: FarmPetState, now: number): FarmPetState {
  if (
    state.activePetId !== null &&
    state.activeUntil !== null &&
    now >= state.activeUntil
  ) {
    return { ...state, activePetId: null, activeUntil: null };
  }
  return state;
}

export function feedAndActivatePet(input: {
  state: FarmPetState;
  petId: FarmPetId;
  foodAvailable: number;
  now: number;
}): { state: FarmPetState; foodConsumed: number } {
  const state = settlePetActivity(input.state, input.now);
  if (!state.owned.has(input.petId)) throw new Error('PET_NOT_OWNED');

  const pet = getPetDefinition(input.petId);
  if (input.foodAvailable < pet.foodPerActivation) throw new Error('INSUFFICIENT_PET_FOOD');

  // Feeding any owned pet — including the currently active pet — starts a
  // fresh full 24h window. Switching therefore requires full feeding anew.
  return {
    foodConsumed: pet.foodPerActivation,
    state: {
      ...state,
      activePetId: input.petId,
      activeUntil: input.now + PET_ACTIVE_MS,
    },
  };
}

export function reconcileMilestonePets(input: {
  state: FarmPetState;
  effectivePaidCrystals: number;
  now: number;
}): FarmPetState {
  const settled = settlePetActivity(input.state, input.now);
  const owned = new Set(settled.owned);

  if (input.effectivePaidCrystals >= 450) owned.add('噬時諦聽');
  else owned.delete('噬時諦聽');

  if (input.effectivePaidCrystals >= 799) owned.add('乾坤麒麟');
  else owned.delete('乾坤麒麟');

  let activePetId = settled.activePetId;
  let activeUntil = settled.activeUntil;
  if (activePetId !== null && !owned.has(activePetId)) {
    activePetId = null;
    activeUntil = null;
  }

  return { ...settled, owned, activePetId, activeUntil };
}

export function acquireDirectPet(
  state: FarmPetState,
  petId: '尋星犬' | '辟邪狻猊',
): FarmPetState {
  const owned = new Set(state.owned);
  owned.add(petId);
  return { ...state, owned };
}
