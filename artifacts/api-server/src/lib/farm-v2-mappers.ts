import type { FarmLandEntity } from "../../../qiankun-farm/src/game/v2/landRuntime";
import type { farmV2LandTable } from "@workspace/db";

type FarmV2LandRow = typeof farmV2LandTable.$inferSelect;

export function farmV2LandRowToEntity(row: FarmV2LandRow): FarmLandEntity {
  if (row.landId < 1 || row.landId > 6) throw new Error("INVALID_FARM_LAND_ID");

  return {
    landId: row.landId as FarmLandEntity["landId"],
    lifecycle: row.lifecycle as FarmLandEntity["lifecycle"],
    accessActive: row.accessActive,
    plantedQuantity: row.plantedQuantity,
    plantedAt: row.plantedAt?.getTime() ?? null,
    maturesAt: row.maturesAt?.getTime() ?? null,
  };
}

export function farmV2LandEntityToPersistence(entity: FarmLandEntity) {
  return {
    lifecycle: entity.lifecycle,
    accessActive: entity.accessActive,
    plantedQuantity: entity.plantedQuantity,
    plantedAt: entity.plantedAt === null ? null : new Date(entity.plantedAt),
    maturesAt: entity.maturesAt === null ? null : new Date(entity.maturesAt),
  };
}
