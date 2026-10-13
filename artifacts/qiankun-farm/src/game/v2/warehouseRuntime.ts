import type { FarmLandId } from './canonicalLandData';
import { getExchangeRate, getSeedPack } from './canonicalEconomyData';

export type FarmQuantityByLand = Record<FarmLandId, number>;

export type FarmMaterialId = '蘊靈砂' | '九霄玉髓';
export type FarmWarehouseMaterials = Partial<Record<FarmMaterialId, number>>;

export interface FarmWarehouse {
  seeds: FarmQuantityByLand;
  crops: FarmQuantityByLand;
  materials?: FarmWarehouseMaterials;
}

export function emptyFarmQuantities(): FarmQuantityByLand {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
}

export function createEmptyFarmWarehouse(): FarmWarehouse {
  return {
    seeds: emptyFarmQuantities(),
    crops: emptyFarmQuantities(),
    materials: { '蘊靈砂': 0, '九霄玉髓': 0 },
  };
}

export function creditFarmMaterial(
  warehouse: FarmWarehouse,
  materialId: FarmMaterialId,
  quantity: number,
): FarmWarehouse {
  if (materialId !== '蘊靈砂' && materialId !== '九霄玉髓') {
    throw new Error('UNKNOWN_FARM_MATERIAL');
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error('INVALID_MATERIAL_QUANTITY');
  }

  const materials = warehouse.materials ?? {};
  for (const [id, amount] of Object.entries(materials)) {
    if (id !== '蘊靈砂' && id !== '九霄玉髓') {
      throw new Error('UNKNOWN_FARM_MATERIAL');
    }
    if (!Number.isSafeInteger(amount) || amount < 0) {
      throw new Error('INVALID_MATERIAL_INVENTORY');
    }
  }

  const current = materials[materialId] ?? 0;
  const next = current + quantity;
  if (!Number.isSafeInteger(next)) throw new Error('INVALID_MATERIAL_INVENTORY');
  return { ...warehouse, materials: { '蘊靈砂': 0, '九霄玉髓': 0, ...materials, [materialId]: next } };
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
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error('INVALID_HARVEST_QUANTITY');
  const currentQuantity = warehouse.crops[landId];
  if (!Number.isSafeInteger(currentQuantity) || currentQuantity < 0) {
    throw new Error('INVALID_FARM_INVENTORY');
  }
  const nextQuantity = currentQuantity + quantity;
  if (!Number.isSafeInteger(nextQuantity)) throw new Error('INVALID_FARM_INVENTORY');
  return {
    ...warehouse,
    crops: {
      ...warehouse.crops,
      [landId]: nextQuantity,
    },
  };
}
