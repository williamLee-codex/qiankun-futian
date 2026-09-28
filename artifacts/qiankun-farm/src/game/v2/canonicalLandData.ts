/**
 * 乾坤福田 V2 — Canonical land master data.
 *
 * IMPORTANT:
 * - Product values here mirror the approved Canonical Master.
 * - Do not infer or restore values from the legacy V1/prototype runtime.
 * - Time values are authoritative durations for the V2 server runtime.
 */

export type FarmLandId = 1 | 2 | 3 | 4 | 5 | 6;

export interface FarmLandDefinition {
  id: FarmLandId;
  landName: string;
  cropName: string;
  seedName: string;
  capacity: number;
  growthHours: number;
  unlock:
    | { kind: 'initial' }
    | { kind: 'coins'; amount: number; requiresLand?: FarmLandId }
    | { kind: 'effectivePaidCrystals'; amount: number };
  borrowable: boolean;
}

export const FARM_V2_LANDS: readonly FarmLandDefinition[] = [
  {
    id: 1,
    landName: '微芒凡土',
    cropName: '曜金粟',
    seedName: '曜金種子',
    capacity: 20,
    growthHours: 4,
    unlock: { kind: 'initial' },
    borrowable: false,
  },
  {
    id: 2,
    landName: '幽熒沃土',
    cropName: '月海曇',
    seedName: '幽熒種子',
    capacity: 10,
    growthHours: 6,
    unlock: { kind: 'coins', amount: 88 },
    borrowable: true,
  },
  {
    id: 3,
    landName: '朱砂烈土',
    cropName: '赤血參',
    seedName: '朱砂種子',
    capacity: 6,
    growthHours: 8,
    unlock: { kind: 'coins', amount: 888, requiresLand: 2 },
    borrowable: true,
  },
  {
    id: 4,
    landName: '曜紫靈土',
    cropName: '天樞蔓',
    seedName: '曜紫種子',
    capacity: 4,
    growthHours: 10,
    unlock: { kind: 'effectivePaidCrystals', amount: 100 },
    borrowable: true,
  },
  {
    id: 5,
    landName: '翡翠聖土',
    cropName: '太微蓮',
    seedName: '翡翠種子',
    capacity: 3,
    growthHours: 12,
    unlock: { kind: 'effectivePaidCrystals', amount: 300 },
    borrowable: true,
  },
  {
    id: 6,
    landName: '黑金晶土',
    cropName: '混沌晶華',
    seedName: '混沌種子',
    capacity: 1,
    growthHours: 60,
    unlock: { kind: 'effectivePaidCrystals', amount: 600 },
    borrowable: false,
  },
] as const;

export type FarmLandLifecycle = 'LOCKED' | 'EMPTY' | 'GROWING' | 'MATURE';

export function getFarmV2Land(id: FarmLandId): FarmLandDefinition {
  const land = FARM_V2_LANDS.find((item) => item.id === id);
  if (!land) throw new Error(`Unknown Farm V2 land: ${id}`);
  return land;
}

export function growthDurationMs(id: FarmLandId): number {
  return getFarmV2Land(id).growthHours * 60 * 60 * 1000;
}
