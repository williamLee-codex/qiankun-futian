import type { FarmAccessState } from "../../../qiankun-farm/src/game/v2/accessRuntime";
import type { FarmLandId } from "../../../qiankun-farm/src/game/v2/canonicalLandData";
import type { FarmPetId, FarmPetState } from "../../../qiankun-farm/src/game/v2/petRuntime";

type PersistedAccessState = Omit<FarmAccessState, "historicallyUnlocked" | "accessActive"> & {
  historicallyUnlocked: FarmLandId[];
  accessActive: FarmLandId[];
};

type PersistedPetState = Omit<FarmPetState, "owned"> & { owned: FarmPetId[] };

export function encodeFarmAccessState(state: FarmAccessState): PersistedAccessState {
  return {
    ...state,
    historicallyUnlocked: [...state.historicallyUnlocked],
    accessActive: [...state.accessActive],
  };
}

export function decodeFarmAccessState(value: unknown): FarmAccessState {
  const state = value as PersistedAccessState;
  if (!state || !Array.isArray(state.historicallyUnlocked) || !Array.isArray(state.accessActive)) {
    throw new Error("INVALID_PERSISTED_FARM_ACCESS_STATE");
  }
  return {
    ...state,
    historicallyUnlocked: new Set(state.historicallyUnlocked),
    accessActive: new Set(state.accessActive),
  };
}

export function encodeFarmPetState(state: FarmPetState): PersistedPetState {
  return { ...state, owned: [...state.owned] };
}

export function decodeFarmPetState(value: unknown): FarmPetState {
  const state = value as PersistedPetState;
  if (!state || !Array.isArray(state.owned)) throw new Error("INVALID_PERSISTED_FARM_PET_STATE");
  return { ...state, owned: new Set(state.owned) };
}
