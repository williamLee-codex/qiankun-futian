import { eq } from "drizzle-orm";
import { farmV2LandTable, farmV2PlayerStateTable } from "@workspace/db";
import type { FarmWarehouse } from "../../../qiankun-farm/src/game/v2/warehouseRuntime";
import type { ChaosSeedState } from "../../../qiankun-farm/src/game/v2/chaosSeedRuntime";
import { reconcilePaidFarmState } from "../../../qiankun-farm/src/game/v2/paidAccessTransactions";
import { farmV2LandRowToEntity, farmV2LandEntityToPersistence } from "./farm-v2-mappers";
import { decodeFarmAccessState, encodeFarmAccessState } from "./farm-v2-json-codecs";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";

export async function reconcileFarmV2PaidAccess(input: {
  userId: string;
  requestId: string;
  effectivePaidCrystals: number;
  now?: number;
}) {
  if (!Number.isInteger(input.effectivePaidCrystals) || input.effectivePaidCrystals < 0) {
    throw new Error("INVALID_EFFECTIVE_PAID_CRYSTALS");
  }
  const now = input.now ?? Date.now();
  return runFarmV2IdempotentMutation({
    userId: input.userId,
    requestId: input.requestId,
    action: `paid-access:${input.effectivePaidCrystals}`,
    execute: async (tx) => {
      const [player] = await tx.select().from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.userId)).for("update").limit(1);
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
      const rows = await tx.select().from(farmV2LandTable)
        .where(eq(farmV2LandTable.userId, input.userId)).orderBy(farmV2LandTable.landId);
      if (rows.length !== 6) throw new Error("FARM_INITIALIZATION_INCOMPLETE");

      const result = reconcilePaidFarmState({
        access: decodeFarmAccessState(player.accessState),
        lands: rows.map(farmV2LandRowToEntity),
        warehouse: player.warehouseState as FarmWarehouse,
        chaosState: player.chaosSeedState as ChaosSeedState | null,
        effectivePaidCrystals: input.effectivePaidCrystals,
        now,
      });

      await tx.update(farmV2PlayerStateTable).set({
        effectivePaidCrystals: input.effectivePaidCrystals,
        accessState: encodeFarmAccessState(result.access),
        warehouseState: result.warehouse,
        chaosSeedState: result.chaosState,
        updatedAt: new Date(now),
      }).where(eq(farmV2PlayerStateTable.userId, input.userId));

      for (const land of result.lands) {
        await tx.update(farmV2LandTable).set(farmV2LandEntityToPersistence(land))
          .where(eq(farmV2LandTable.userId, input.userId));
      }
      return { effectivePaidCrystals: input.effectivePaidCrystals, access: encodeFarmAccessState(result.access), warehouse: result.warehouse, chaosSeedState: result.chaosState };
    },
  });
}
