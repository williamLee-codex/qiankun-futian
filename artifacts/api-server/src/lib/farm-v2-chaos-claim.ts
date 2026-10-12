import { eq } from "drizzle-orm";
import { farmV2PlayerStateTable } from "@workspace/db";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";
import { decodeFarmAccessState } from "./farm-v2-json-codecs";
import { settleAndClaimChaosSeeds } from "../../../qiankun-farm/src/game/v2/chaosClaimTransaction";
import type { ChaosSeedState } from "../../../qiankun-farm/src/game/v2/chaosSeedRuntime";
import type { FarmWarehouse } from "../../../qiankun-farm/src/game/v2/warehouseRuntime";

export function claimFarmV2ChaosSeeds(input: {
  userId: string;
  requestId: string;
  now?: number;
}) {
  const now = input.now ?? Date.now();
  return runFarmV2IdempotentMutation({
    userId: input.userId,
    requestId: input.requestId,
    action: "CHAOS_CLAIM",
    execute: async (tx) => {
      const [player] = await tx
        .select()
        .from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.userId))
        .for("update")
        .limit(1);
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
      if (!player.chaosSeedState) throw new Error("CHAOS_SEED_NOT_UNLOCKED");
      const result = settleAndClaimChaosSeeds({
        state: player.chaosSeedState as ChaosSeedState,
        access: decodeFarmAccessState(player.accessState),
        warehouse: player.warehouseState as FarmWarehouse,
        now,
      });
      if (!Number.isSafeInteger(result.warehouse.seeds[6]))
        throw new Error("INVALID_FARM_INVENTORY");
      await tx
        .update(farmV2PlayerStateTable)
        .set({
          chaosSeedState: result.state,
          warehouseState: result.warehouse,
          updatedAt: new Date(now),
        })
        .where(eq(farmV2PlayerStateTable.userId, input.userId));
      return {
        claimed: result.claimed,
        chaosSeedState: result.state,
        warehouse: result.warehouse,
      };
    },
  });
}
