import type { FarmPetId, FarmPetState } from './petRuntime';
import { settlePetActivity } from './petRuntime';

export interface ActiveFarmPetEffects {
  suanniProtection: boolean;
  tingSecondField: boolean;
  qilinBlock: boolean;
}

export function getActiveFarmPetId(state: FarmPetState, now: number): FarmPetId | null {
  return settlePetActivity(state, now).activePetId;
}

export function getActiveFarmPetEffects(
  state: FarmPetState,
  now: number,
): ActiveFarmPetEffects {
  const active = getActiveFarmPetId(state, now);
  return {
    suanniProtection: active === '辟邪狻猊',
    tingSecondField: active === '噬時諦聽',
    qilinBlock: active === '乾坤麒麟',
  };
}

/**
 * Only the currently active pet contributes effects. Ownership by itself
 * never grants a passive effect.
 */
export function isFarmPetEffectActive(
  state: FarmPetState,
  petId: FarmPetId,
  now: number,
): boolean {
  return getActiveFarmPetId(state, now) === petId;
}
