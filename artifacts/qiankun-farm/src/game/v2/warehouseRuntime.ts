import type { FarmLandId } from './canonicalLandData';
import { getExchangeRate, getSeedPack } from './canonicalEconomyData';

export type FarmQuantityByLand = Record<FarmLandId, number>;

export interface FarmWarehouse {
  seeds: FarmQuantityByLand;
  crops: FarmQuantityByLand;
}

export function emptyFarmQuantities(): FarmQuantityByLand {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
}

export function createEmptyFarmWarehouse(): FarmWarehouse {
  return { seeds: emptyFarmQuantities(), crops: emptyFarmQuantities() };
}

export interface Wallet {
  coins: number;
  crystals: number;
}

export function buySeedPacks(input: {
  warehouse: FarmWarehouse;
  wallet: Wallet;
  landId: FarmLandId;
  packs: number;
}): { warehouse: FarmWarehouse; wallet: Wallet; seedsAdded: number } {
  if (!Number.isInteger(input.packs) || input.packs <= 0) throw new Error('INVALID_PACK_COUNT');
  const pack = getSeedPack(input.landId);
  if (!pack.purchasable) throw new Error('SEED_NOT_PURCHASABLE');

  const cost = pack.price * input.packs;
  if (input.wallet[pack.currency] < cost) throw new Error('INSUFFICIENT_CURRENCY');

  const seedsAdded = pack.quantity * input.packs;
  return {
    wallet: { ...input.wallet, [pack.currency]: input.wallet[pack.currency] - cost },
    warehouse: {
      ...input.warehouse,
      seeds: {
        ...input.warehouse.seeds,
        [input.landId]: input.warehouse.seeds[input.landId] + seedsAdded,
      },
    },
    seedsAdded,
  };
}

export function exchangeCrops(input: {
  warehouse: FarmWarehouse;
  wallet: Wallet;
  landId: FarmLandId;
  cropQuantity: number;
}): {
  warehouse: FarmWarehouse;
  wallet: Wallet;
  cropsConsumed: number;
  rewardQuantity: number;
} {
  if (!Number.isInteger(input.cropQuantity) || input.cropQuantity <= 0) {
    throw new Error('INVALID_EXCHANGE_QUANTITY');
  }
  const rate = getExchangeRate(input.landId);
  const available = input.warehouse.crops[input.landId];
  const requested = Math.min(input.cropQuantity, available);
  const units = Math.floor(requested / rate.cropQuantity);
  if (units <= 0) throw new Error('INSUFFICIENT_CROPS_FOR_EXCHANGE');

  const cropsConsumed = units * rate.cropQuantity;
  const rewardQuantity = units * rate.rewardQuantity;

  return {
    warehouse: {
      ...input.warehouse,
      crops: {
        ...input.warehouse.crops,
        [input.landId]: available - cropsConsumed,
      },
    },
    wallet: {
      ...input.wallet,
      [rate.currency]: input.wallet[rate.currency] + rewardQuantity,
    },
    cropsConsumed,
    rewardQuantity,
  };
}

export function depositHarvest(
  warehouse: FarmWarehouse,
  landId: FarmLandId,
  quantity: number,
): FarmWarehouse {
  if (!Number.isInteger(quantity) || quantity < 0) throw new Error('INVALID_HARVEST_QUANTITY');
  return {
    ...warehouse,
    crops: {
      ...warehouse.crops,
      [landId]: warehouse.crops[landId] + quantity,
    },
  };
}
