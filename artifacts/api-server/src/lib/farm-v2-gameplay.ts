import { recordFarmAttendance } from "../../../qiankun-farm/src/game/v2/formationSourcesRuntime";
import { and, eq } from "drizzle-orm";
import { farmV2PlayerStateTable, farmV2LandTable } from "@workspace/db";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";
import { decodeFarmAccessState } from "./farm-v2-json-codecs";
import { farmAuthorityContext } from "./farm-v2-authority-context";
import { settleAndClaimChaosSeeds } from "../../../qiankun-farm/src/game/v2/chaosClaimTransaction";
import { executeFarmerLandTransaction } from "../../../qiankun-farm/src/game/v2/farmerLandTransaction";
import {
  setFarmerLandEnabled,
  type FarmerState,
} from "../../../qiankun-farm/src/game/v2/farmerRuntime";
import type { FarmWarehouse } from "../../../qiankun-farm/src/game/v2/warehouseRuntime";
import type { ChaosSeedState } from "../../../qiankun-farm/src/game/v2/chaosSeedRuntime";
import type { FarmLandId } from "../../../qiankun-farm/src/game/v2/canonicalLandData";
import {
  farmV2LandRowToEntity,
  farmV2LandEntityToPersistence,
} from "./farm-v2-mappers";

type Input = { userId: string; requestId: string; now?: number };
export function claimFarmV2ChaosSeeds(input: Input) {
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
        .for("update");
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
      const access = decodeFarmAccessState(player.accessState);
      const qualification =
        farmAuthorityContext.getStore()?.qualification ??
        player.effectivePaidCrystals;
      if (
        qualification < 600 ||
        !access.accessActive.has(6) ||
        !player.chaosSeedState
      )
        throw new Error("LAND_NOT_ACCESSIBLE");
      const result = settleAndClaimChaosSeeds({
        state: player.chaosSeedState as ChaosSeedState,
        access,
        warehouse: player.warehouseState as FarmWarehouse,
        now,
      });
      await tx
        .update(farmV2PlayerStateTable)
        .set({
          warehouseState: result.warehouse,
          chaosSeedState: result.state,
          updatedAt: new Date(now),
        })
        .where(eq(farmV2PlayerStateTable.userId, input.userId));
      return result;
    },
  });
}
export function configureFarmV2Farmer(
  input: Input & { landId: number; enabled: boolean },
) {
  if (!Number.isInteger(input.landId) || input.landId < 1 || input.landId > 6)
    throw new Error("INVALID_FARM_LAND_ID");
  if (typeof input.enabled !== "boolean")
    throw new Error("INVALID_FARMER_PREFERENCE");
  return runFarmV2IdempotentMutation({
    userId: input.userId,
    requestId: input.requestId,
    action: `FARMER_PREF:${input.landId}:${input.enabled}`,
    execute: async (tx) => {
      const [player] = await tx
        .select()
        .from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.userId))
        .for("update");
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
      if (
        (farmAuthorityContext.getStore()?.qualification ??
          player.effectivePaidCrystals) < 999
      )
        throw new Error("FARMER_NOT_ENTITLED");
      const farmer = setFarmerLandEnabled(
        player.farmerState as FarmerState,
        input.landId as FarmLandId,
        input.enabled,
      );
      await tx
        .update(farmV2PlayerStateTable)
        .set({
          farmerState: farmer,
          updatedAt: new Date(input.now ?? Date.now()),
        })
        .where(eq(farmV2PlayerStateTable.userId, input.userId));
      return { farmer };
    },
  });
}
export function settleFarmV2Farmer(input: Input) {
  const now = input.now ?? Date.now();
  return runFarmV2IdempotentMutation({
    userId: input.userId,
    requestId: input.requestId,
    action: "FARMER_SETTLE",
    execute: async (tx) => {
      const [player] = await tx
        .select()
        .from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.userId))
        .for("update");
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
      const farmer = {
        ...(player.farmerState as FarmerState),
        entitled:
          (farmAuthorityContext.getStore()?.qualification ??
            player.effectivePaidCrystals) >= 999,
      };
      const rows = await tx
        .select()
        .from(farmV2LandTable)
        .where(eq(farmV2LandTable.userId, input.userId))
        .orderBy(farmV2LandTable.landId)
        .for("update");
      if (rows.length !== 6) throw new Error("FARM_INITIALIZATION_INCOMPLETE");
      if (!player.firstFarmEnteredAt)
        throw new Error("FIRST_FARM_ENTERED_AT_REQUIRED");
      let warehouse = recordFarmAttendance(
        player.warehouseState as FarmWarehouse,
        now,
      );
      let creditedQuantity = 0;
      for (const row of rows) {
        const result = executeFarmerLandTransaction({
          farmer,
          land: farmV2LandRowToEntity(row),
          warehouse,
          firstFarmEnteredAt: player.firstFarmEnteredAt.getTime(),
          now,
        });
        warehouse = result.warehouse;
        creditedQuantity += result.creditedHarvestQuantity;
        await tx
          .update(farmV2LandTable)
          .set({
            ...farmV2LandEntityToPersistence(result.land),
            version: row.version + 1,
          })
          .where(
            and(
              eq(farmV2LandTable.userId, input.userId),
              eq(farmV2LandTable.landId, row.landId),
            ),
          );
      }
      await tx
        .update(farmV2PlayerStateTable)
        .set({ warehouseState: warehouse, updatedAt: new Date(now) })
        .where(eq(farmV2PlayerStateTable.userId, input.userId));
      return { warehouse, creditedQuantity };
    },
  });
}
