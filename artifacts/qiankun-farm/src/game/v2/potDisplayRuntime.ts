import type { FarmLandId } from './canonicalLandData';
import type { PotGrade, PotItem } from './potRuntime';

export const BASE_FRIEND_CAPACITY = 30;

const DISPLAY_BONUS: Readonly<Record<'LOW' | 'HIGH' | 'CHAOS', readonly number[]>> = {
  LOW: [1, 2, 3, 5, 8, 12],
  HIGH: [2, 4, 6, 10, 16, 24],
  CHAOS: [3, 6, 9, 15, 24, 36],
};

export interface PotDisplayState {
  slots: Partial<Record<FarmLandId, PotItem>>;
}

function bonusBand(landId: FarmLandId): keyof typeof DISPLAY_BONUS {
  if (landId <= 3) return 'LOW';
  if (landId <= 5) return 'HIGH';
  return 'CHAOS';
}

export function potDisplayBonus(landId: FarmLandId, grade: PotGrade): number {
  const gradeIndex = ['黃', '玄', '地', '天', '仙', '神'].indexOf(grade);
  if (gradeIndex < 0) throw new Error('UNKNOWN_POT_GRADE');
  return DISPLAY_BONUS[bonusBand(landId)][gradeIndex];
}

export function displayPot(
  state: PotDisplayState,
  slotLandId: FarmLandId,
  pot: PotItem,
): PotDisplayState {
  if (slotLandId !== pot.speciesLandId) throw new Error('POT_SPECIES_SLOT_MISMATCH');
  return { slots: { ...state.slots, [slotLandId]: pot } };
}

export function removeDisplayedPot(
  state: PotDisplayState,
  slotLandId: FarmLandId,
): PotDisplayState {
  const slots = { ...state.slots };
  delete slots[slotLandId];
  return { slots };
}

export function totalDisplayedPotBonus(state: PotDisplayState): number {
  return Object.entries(state.slots).reduce((sum, [landId, pot]) => {
    if (!pot) return sum;
    return sum + potDisplayBonus(Number(landId) as FarmLandId, pot.grade);
  }, 0);
}

export function friendCapacityFromDisplay(state: PotDisplayState): number {
  return BASE_FRIEND_CAPACITY + totalDisplayedPotBonus(state);
}

export function lingyunFromDisplay(state: PotDisplayState): number {
  return Math.min(120, totalDisplayedPotBonus(state));
}
