import { sql } from "drizzle-orm";
import { farmV2LandTable, farmV2PlayerStateTable } from "@workspace/db";
import { executeSowTransaction } from "../../../qiankun-farm/src/game/v2/farmActionTransactions";
import type { FarmWarehouse } from "../../../qiankun-farm/src/game/v2/warehouseRuntime";
import type { MissionState } from "../../../qiankun-farm/src/game/v2/missionRuntime";
import { farmV2LandEntityToPersistence, farmV2LandRowToEntity } from "./farm-v2-mappers";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";

export async function sowFarmV2Land(input: {
  requestId: string;
  userId: string;
  landId: number;
  now?: Date;
}) {
  if (!Number.isInteger(input.landId) || input.landId < 1 || input.landId > 6) {
    throw new Error("INVALID_FARM_LAND_ID");
  }
  const now = input.now ?? new Date();

  return runFarmV2IdempotentMutation({
    requestId: input.requestId,
    userId: input.userId,
    action: `SOW:${input.landId}`,
    execute: async (tx) => {
      const playerRows = await tx.execute(sql`select * from farm_v2_player_state where user_id = ${input.userId} for update`);
      const player = playerRows.rows[0] as typeof farmV2PlayerStateTable.$inferSelect | undefined;
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");

      const landRows = await tx.execute(sql`select * from farm_v2_land where user_id = ${input.userId} and land_id = ${input.landId} for update`);
      const landRow = landRows.rows[0] as typeof farmV2LandTable.$inferSelect | undefined;
      if (!landRow) throw new Error("FARM_LAND_NOT_FOUND");

      const result = executeSowTransaction({
        state: {
          land: farmV2LandRowToEntity(landRow),
          warehouse: player.warehouseState as FarmWarehouse,
          missions: player.missionState as MissionState,
        },
        now: now.getTime(),
      });

      const persistedLand = farmV2LandEntityToPersistence(result.land);
      const updated = await tx.update(farmV2LandTable).set({
        ...persistedLand,
        version: landRow.version + 1,
      }).where(sql`user_id = ${input.userId} and land_id = ${input.landId} and version = ${landRow.version}`)
        .returning({ version: farmV2LandTable.version });
      if (updated.length !== 1) throw new Error("FARM_LAND_CONCURRENT_MODIFICATION");

      await tx.update(farmV2PlayerStateTable).set({
        warehouseState: result.warehouse,
        missionState: result.missions,
        updatedAt: now,
      }).where(sql`user_id = ${input.userId}`);

      return { land: result.land, warehouse: result.warehouse, missions: result.missions };
    },
  });
}
