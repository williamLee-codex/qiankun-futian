import {
  FARM_V2_LANDS,
  type FarmLandDefinition,
  type FarmLandId,
  type FarmLandLifecycle,
  getFarmV2Land,
  growthDurationMs,
} from './canonicalLandData';

export interface FarmLandEntity {
  landId: FarmLandId;
  lifecycle: FarmLandLifecycle;
  accessActive: boolean;
  plantedQuantity: number;
  plantedAt: number | null;
  maturesAt: number | null;
}

export interface PlantLandInput {
  land: FarmLandEntity;
  availableSeeds: number;
  now: number;
}

export interface PlantLandResult {
  land: FarmLandEntity;
  consumedSeeds: number;
}

/**
 * Canonical V2 sowing is full-batch only.
 * An empty, accessible land consumes exactly its configured capacity.
 */
export function plantFullBatch(input: PlantLandInput): PlantLandResult {
  const definition = getFarmV2Land(input.land.landId);
  if (!input.land.accessActive || input.land.lifecycle === 'LOCKED') {
    throw new Error('LAND_NOT_ACCESSIBLE');
  }
  if (input.land.lifecycle !== 'EMPTY') {
    throw new Error('LAND_NOT_EMPTY');
  }
  if (input.availableSeeds < definition.capacity) {
    throw new Error('INSUFFICIENT_SEEDS_FOR_FULL_BATCH');
  }

  return {
    consumedSeeds: definition.capacity,
    land: {
      ...input.land,
      lifecycle: 'GROWING',
      plantedQuantity: definition.capacity,
      plantedAt: input.now,
      maturesAt: input.now + growthDurationMs(input.land.landId),
    },
  };
}

export function settleLandMaturity(land: FarmLandEntity, now: number): FarmLandEntity {
  if (
    land.lifecycle === 'GROWING' &&
    land.maturesAt !== null &&
    now >= land.maturesAt
  ) {
    return { ...land, lifecycle: 'MATURE' };
  }
  return land;
}

export interface HarvestLandResult {
  land: FarmLandEntity;
  harvestedQuantity: number;
}

/**
 * Harvest returns the planted batch quantity to inventory.
 * Newbie multiplier and friend interactions are intentionally separate
 * settlement layers; this primitive does not infer them.
 */
export function harvestMatureLand(land: FarmLandEntity): HarvestLandResult {
  if (!land.accessActive || land.lifecycle !== 'MATURE') {
    throw new Error('LAND_NOT_HARVESTABLE');
  }

  return {
    harvestedQuantity: land.plantedQuantity,
    land: {
      ...land,
      lifecycle: 'EMPTY',
      plantedQuantity: 0,
      plantedAt: null,
      maturesAt: null,
    },
  };
}

export function createInitialLandEntities(
  accessActive: ReadonlySet<FarmLandId> = new Set([1]),
): FarmLandEntity[] {
  return FARM_V2_LANDS.map((definition: FarmLandDefinition) => {
    const active = accessActive.has(definition.id);
    return {
      landId: definition.id,
      lifecycle: active ? 'EMPTY' : 'LOCKED',
      accessActive: active,
      plantedQuantity: 0,
      plantedAt: null,
      maturesAt: null,
    };
  });
}
