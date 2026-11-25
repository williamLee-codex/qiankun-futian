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

export function getSeedPack(landId: FarmLandId): SeedPackDefinition {
  const item = FARM_V2_SEED_PACKS.find((x) => x.landId === landId);
  if (!item) throw new Error(`Unknown seed pack land: ${landId}`);
  return item;
}

export function getExchangeRate(landId: FarmLandId): CropExchangeDefinition {
  const item = FARM_V2_EXCHANGE.find((x) => x.landId === landId);
  if (!item) throw new Error(`Unknown exchange land: ${landId}`);
  return item;
}
