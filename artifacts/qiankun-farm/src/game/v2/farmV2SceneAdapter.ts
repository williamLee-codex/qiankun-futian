import type { Plot, CropId, CropInventory } from '../types';
import { initialState } from '../initialState';

export interface ServerLand {
  landId: number;
  lifecycle: string;
  accessActive: boolean;
  plantedQuantity: number;
  maturesAt: string | number | null;
}

export interface ServerWarehouse {
  seeds: Record<string, number>;
  crops: Record<string, number>;
}

const cropIds: CropId[] = ['yaojin', 'youying', 'zhusha', 'yaozi', 'feicui', 'heijin'];

export function mapServerLands(lands: ServerLand[]): Plot[] {
  if (lands.length !== 6 || new Set(lands.map(l => l.landId)).size !== 6) {
    throw new Error('INVALID_FARM_LANDS');
  }
  return initialState.plots.map((plot, index) => {
    const land = lands.find(l => l.landId === index + 1);
    if (!land) throw new Error('MISSING_FARM_LAND');
    const maturity = land.maturesAt === null ? null :
      typeof land.maturesAt === 'number' ? land.maturesAt : Date.parse(land.maturesAt);
    if (maturity !== null && !Number.isFinite(maturity)) throw new Error('INVALID_MATURITY');
    if (!Number.isSafeInteger(land.plantedQuantity) || land.plantedQuantity < 0 || land.plantedQuantity > plot.maxSeeds) throw new Error('INVALID_PLANTED_QUANTITY');
    if (!['LOCKED', 'EMPTY', 'GROWING', 'MATURE'].includes(land.lifecycle)) throw new Error('INVALID_LAND_LIFECYCLE');
    if ((land.lifecycle === 'GROWING' || land.lifecycle === 'MATURE') && maturity === null) throw new Error('MISSING_MATURITY');
    const ready = land.lifecycle === 'MATURE' ||
      (land.lifecycle === 'GROWING' && maturity !== null && maturity <= Date.now());
    return {
      ...plot,
      unlocked: land.accessActive && land.lifecycle !== 'LOCKED',
      state: ready ? 'ready' : land.lifecycle === 'GROWING' ? 'growing' : 'empty',
      plantCount: land.plantedQuantity,
      growthEndTime: maturity,
      readyAt: ready ? maturity : null,
    };
  });
}

export function mapServerWarehouse(warehouse: ServerWarehouse): {
  seedInventory: CropInventory;
  cropInventory: CropInventory;
} {
  const seedInventory = {} as CropInventory;
  const cropInventory = {} as CropInventory;
  cropIds.forEach((id, index) => {
    const key = String(index + 1);
    const seeds = warehouse.seeds[key];
    const crops = warehouse.crops[key];
    if (!Number.isSafeInteger(seeds) || seeds < 0 ||
        !Number.isSafeInteger(crops) || crops < 0) throw new Error('INVALID_FARM_INVENTORY');
    seedInventory[id] = seeds;
    cropInventory[id] = crops;
  });
  return { seedInventory, cropInventory };
}
