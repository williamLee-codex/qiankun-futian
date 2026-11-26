/**
 * 乾坤福田 V2 — Canonical seed/crop economy data.
 * Mirrors the approved Canonical Master. Legacy prototype values are invalid.
 */
import type { FarmLandId } from './canonicalLandData';

export type FarmCurrency = 'coins' | 'crystals';

export interface SeedPackDefinition {
  landId: FarmLandId;
  quantity: number;
  price: number;
  currency: FarmCurrency;
  purchasable: boolean;
}

export interface CropExchangeDefinition {
  landId: FarmLandId;
  cropQuantity: number;
  rewardQuantity: number;
  currency: FarmCurrency;
}

export const FARM_V2_SEED_PACKS: readonly SeedPackDefinition[] = [
  { landId: 1, quantity: 20, price: 1, currency: 'coins', purchasable: true },
  { landId: 2, quantity: 10, price: 1, currency: 'coins', purchasable: true },
  { landId: 3, quantity: 6, price: 1, currency: 'coins', purchasable: true },
  { landId: 4, quantity: 4, price: 1, currency: 'coins', purchasable: true },
  { landId: 5, quantity: 3, price: 1, currency: 'coins', purchasable: true },
  // 混沌種子不得購買；此列明確鎖死，避免舊版商店資料回流。
  { landId: 6, quantity: 0, price: 0, currency: 'crystals', purchasable: false },
] as const;

export const FARM_V2_EXCHANGE: readonly CropExchangeDefinition[] = [
  { landId: 1, cropQuantity: 5, rewardQuantity: 1, currency: 'coins' },
  { landId: 2, cropQuantity: 2, rewardQuantity: 1, currency: 'coins' },
  { landId: 3, cropQuantity: 1, rewardQuantity: 1, currency: 'coins' },
  { landId: 4, cropQuantity: 1, rewardQuantity: 2, currency: 'coins' },
  { landId: 5, cropQuantity: 1, rewardQuantity: 4, currency: 'coins' },
  { landId: 6, cropQuantity: 1, rewardQuantity: 1, currency: 'crystals' },
] as const;

export type SynthesisMaterialId = '蘊靈砂' | '九霄玉髓';

export interface SynthesisMaterialRequirement {
  material: SynthesisMaterialId;
  quantity: number;
}

/**
 * Pot synthesis materials, indexed by POT_GRADES position (0 = 黃).
 * The material name is already the display name the player sees.
 */
export const FARM_V2_POT_SYNTHESIS_MATERIALS: readonly SynthesisMaterialRequirement[] = [
  { material: '蘊靈砂', quantity: 1 },
  { material: '蘊靈砂', quantity: 1 },
  { material: '蘊靈砂', quantity: 4 },
  { material: '九霄玉髓', quantity: 2 },
  { material: '九霄玉髓', quantity: 4 },
  { material: '九霄玉髓', quantity: 10 },
] as const;

export function getSynthesisMaterials(gradeIndex: number): SynthesisMaterialRequirement {
  const item = FARM_V2_POT_SYNTHESIS_MATERIALS[gradeIndex];
  if (!item) throw new Error(`Unknown synthesis grade index: ${gradeIndex}`);
  return item;
}

// Canonical economy data is immutable, so the lookups that run on every
// purchase and exchange are built once instead of scanned per request.
const SEED_PACK_BY_LAND = new Map(FARM_V2_SEED_PACKS.map((x) => [x.landId, x]));
const EXCHANGE_BY_LAND = new Map(FARM_V2_EXCHANGE.map((x) => [x.landId, x]));

export function getSeedPack(landId: FarmLandId): SeedPackDefinition {
  const item = SEED_PACK_BY_LAND.get(landId);
  if (!item) throw new Error(`Unknown seed pack land: ${landId}`);
  return item;
}

export function getExchangeRate(landId: FarmLandId): CropExchangeDefinition {
  const item = EXCHANGE_BY_LAND.get(landId);
  if (!item) throw new Error(`Unknown exchange land: ${landId}`);
  return item;
}
