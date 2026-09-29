import type { FarmPetState } from './petRuntime';
import { getActiveFarmPetEffects } from './petEffectsRuntime';
import type { BorrowPetEffects } from './borrowRuntime';

export function toBorrowPetEffects(
  petState: FarmPetState,
  now: number,
): BorrowPetEffects {
  const active = getActiveFarmPetEffects(petState, now);
  return {
    suanniActive: active.suanniProtection,
    tingActive: active.tingSecondField,
    qilinActive: active.qilinBlock,
  };
}
