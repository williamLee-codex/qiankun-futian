import { FARM_V2_LANDS, type FarmLandId } from './canonicalLandData';
import type { FarmLandEntity } from './landRuntime';

export const FARMER_UNLOCK_EFFECTIVE_PAID_CRYSTALS = 999;

export interface FarmerState {
  entitled: boolean;
  enabledByLand: Record<FarmLandId, boolean>;
}

export interface FarmerLandSettlement {
  land: FarmLandEntity;
  seedsRemaining: number;
  harvestedQuantity: number;
  completedCycles: number;
}

export function createFarmerState(): FarmerState {
  return {
    entitled: false,
    enabledByLand: { 1: false, 2: false, 3: false, 4: false, 5: false, 6: false },
  };
}

export function reconcileFarmerEntitlement(
  state: FarmerState,
  effectivePaidCrystals: number,
): FarmerState {
  return {
    ...state,
    entitled: effectivePaidCrystals >= FARMER_UNLOCK_EFFECTIVE_PAID_CRYSTALS,
  };
}

export function setFarmerLandEnabled(
  state: FarmerState,
  landId: FarmLandId,
  enabled: boolean,
): FarmerState {
  return {
    ...state,
    enabledByLand: { ...state.enabledByLand, [landId]: enabled },
  };
}

/**
 * Login-time lazy settlement for one land.
 *
 * It performs only complete grow/harvest/replant cycles that fit between the
 * existing plantedAt/maturesAt timeline and now. It never creates seed debt.
 * It does not buy seeds, exchange crops, upgrade pots, feed pets, touch cave
 * systems or claim missions.
 *
 * Field 6 consumes warehouse Chaos seeds exactly like any other stored seed;
 * this runtime never generates or claims pending Chaos seeds.
 */
export function settleFarmerLand(input: {
  farmer: FarmerState;
  land: FarmLandEntity;
  seedsAvailable: number;
  now: number;
}): FarmerLandSettlement {
  const { farmer, land, now } = input;
  let seedsRemaining = input.seedsAvailable;

  if (!farmer.entitled || !farmer.enabledByLand[land.landId] || !land.accessActive) {
    return { land, seedsRemaining, harvestedQuantity: 0, completedCycles: 0 };
  }

  const def = FARM_V2_LANDS.find((x) => x.id === land.landId);
  if (!def) throw new Error('UNKNOWN_LAND');

  const capacity = def.capacity;
  const growthMs = def.growthHours * 60 * 60 * 1000;
  let plantedAt = land.plantedAt;
  let maturesAt = land.maturesAt;
  let lifecycle = land.lifecycle;
  let plantedQuantity = land.plantedQuantity;
  let harvestedQuantity = 0;
  let completedCycles = 0;

  // Empty land may start one batch at login if a complete seed batch exists.
  if ((lifecycle === 'EMPTY' || lifecycle === 'LOCKED') && seedsRemaining >= capacity) {
    seedsRemaining -= capacity;
    plantedAt = now;
    maturesAt = now + growthMs;
    lifecycle = 'GROWING';
    plantedQuantity = capacity;
    return {
      land: { ...land, lifecycle, plantedQuantity, plantedAt, maturesAt },
      seedsRemaining,
      harvestedQuantity,
      completedCycles,
    };
  }

  if (
    (lifecycle !== 'GROWING' && lifecycle !== 'MATURE') ||
    plantedAt === null ||
    maturesAt === null ||
    now < maturesAt
  ) {
    return { land, seedsRemaining, harvestedQuantity, completedCycles };
  }

  // Harvest the already-planted batch first.
  harvestedQuantity += plantedQuantity;
  completedCycles += 1;

  // Replant only complete batches. Each fully elapsed subsequent cycle can be
  // harvested; the first not-yet-mature batch remains growing.
  let nextPlantAt = maturesAt;
  while (seedsRemaining >= capacity) {
    seedsRemaining -= capacity;
    const nextMaturesAt = nextPlantAt + growthMs;

    if (now >= nextMaturesAt) {
      harvestedQuantity += capacity;
      completedCycles += 1;
      nextPlantAt = nextMaturesAt;
      continue;
    }

    return {
      land: {
        ...land,
        lifecycle: 'GROWING',
        plantedQuantity: capacity,
        plantedAt: nextPlantAt,
        maturesAt: nextMaturesAt,
      },
      seedsRemaining,
      harvestedQuantity,
      completedCycles,
    };
  }

  // No complete seed batch remains: stop on EMPTY after the last harvest.
  return {
    land: {
      ...land,
      lifecycle: 'EMPTY',
      plantedQuantity: 0,
      plantedAt: null,
      maturesAt: null,
    },
    seedsRemaining,
    harvestedQuantity,
    completedCycles,
  };
}
