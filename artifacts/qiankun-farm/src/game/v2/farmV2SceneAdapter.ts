import type { Plot, CropId, CropInventory } from "../types";
import { CROP_DATA } from "../types";
import { FARM_V2_LANDS } from "./canonicalLandData";
import { getSeedPack } from "./canonicalEconomyData";

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

const cropIds: CropId[] = [
  "yaojin",
  "youying",
  "zhusha",
  "yaozi",
  "feicui",
  "heijin",
];

export function mapServerLands(
  lands: ServerLand[],
  serverNow?: number,
): Plot[] {
  if (lands.length !== 6 || new Set(lands.map((l) => l.landId)).size !== 6) {
    throw new Error("INVALID_FARM_LANDS");
  }
  return FARM_V2_LANDS.map((definition, index) => {
    const cropId = cropIds[index];
    const plot: Plot = {
      id: index,
      name: definition.landName,
      maxSeeds: definition.capacity,
      unlocked: false,
      state: "empty",
      plantCount: 0,
      growthEndTime: null,
      readyAt: null,
      cropId,
      cropName: definition.cropName,
      seedName: definition.seedName,
      cropEmoji: CROP_DATA[cropId].emoji,
      harvestCount: definition.capacity,
      growthHours: definition.growthHours,
      borrowable: definition.borrowable,
      yieldCrystal: definition.id === 6,
      unlockCoins:
        definition.unlock.kind === "coins" ? definition.unlock.amount : null,
      unlockCrystals:
        definition.unlock.kind === "effectivePaidCrystals"
          ? definition.unlock.amount
          : null,
      seedBuyRate:
        definition.id === 6
          ? "每72小時產生待領種子，不可購買"
          : `1金幣=${getSeedPack(definition.id).quantity}顆`,
    };
    const land = lands.find((l) => l.landId === index + 1);
    if (!land) throw new Error("MISSING_FARM_LAND");
    const maturity =
      land.maturesAt === null
        ? null
        : typeof land.maturesAt === "number"
          ? land.maturesAt
          : Date.parse(land.maturesAt);
    if (maturity !== null && !Number.isFinite(maturity))
      throw new Error("INVALID_MATURITY");
    if (
      !Number.isSafeInteger(land.plantedQuantity) ||
      land.plantedQuantity < 0 ||
      land.plantedQuantity > plot.maxSeeds
    )
      throw new Error("INVALID_PLANTED_QUANTITY");
    if (!["LOCKED", "EMPTY", "GROWING", "MATURE"].includes(land.lifecycle))
      throw new Error("INVALID_LAND_LIFECYCLE");
    if (
      (land.lifecycle === "GROWING" || land.lifecycle === "MATURE") &&
      maturity === null
    )
      throw new Error("MISSING_MATURITY");
    const ready =
      land.lifecycle === "MATURE" ||
      (land.lifecycle === "GROWING" &&
        maturity !== null &&
        serverNow !== undefined &&
        maturity <= serverNow);
    return {
      ...plot,
      unlocked: land.accessActive && land.lifecycle !== "LOCKED",
      state: ready
        ? "ready"
        : land.lifecycle === "GROWING"
          ? "growing"
          : "empty",
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
    if (
      !Number.isSafeInteger(seeds) ||
      seeds < 0 ||
      !Number.isSafeInteger(crops) ||
      crops < 0
    )
      throw new Error("INVALID_FARM_INVENTORY");
    seedInventory[id] = seeds;
    cropInventory[id] = crops;
  });
  return { seedInventory, cropInventory };
}
