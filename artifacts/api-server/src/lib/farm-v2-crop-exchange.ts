import { eq } from "drizzle-orm";
import { farmV2PlayerStateTable } from "@workspace/db";
import { getExchangeRate } from "../../../qiankun-farm/src/game/v2/canonicalEconomyData";
import type { FarmLandId } from "../../../qiankun-farm/src/game/v2/canonicalLandData";
import type { FarmWarehouse } from "../../../qiankun-farm/src/game/v2/warehouseRuntime";
import type { MissionState } from "../../../qiankun-farm/src/game/v2/missionRuntime";
import { recordMissionEvent } from "../../../qiankun-farm/src/game/v2/missionRuntime";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";
import { applyFarmV2WalletStep } from "./farm-v2-wallet-saga";

export async function exchangeFarmV2Crops(input: {
  userId: string; launchToken: string; requestId: string;
  landId: number; cropQuantity: number; now?: number;
}) {
  if (!Number.isInteger(input.landId) || input.landId < 1 || input.landId > 6) throw new Error("INVALID_FARM_LAND_ID");
  if (!Number.isInteger(input.cropQuantity) || input.cropQuantity <= 0) throw new Error("INVALID_EXCHANGE_QUANTITY");
  const landId = input.landId as FarmLandId;
  const rate = getExchangeRate(landId);

  return runFarmV2IdempotentMutation({
    requestId: input.requestId, userId: input.userId,
    action: `crop-exchange:${landId}:${input.cropQuantity}`,
    recover: async (tx) => {
      const [player] = await tx.select().from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.userId)).for("update").limit(1);
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
      const warehouse = player.warehouseState as FarmWarehouse;
      const available = warehouse.crops[landId];
      const requested = Math.min(input.cropQuantity, available);
      const units = Math.floor(requested / rate.cropQuantity);
      if (units <= 0) throw new Error("INSUFFICIENT_CROPS_FOR_EXCHANGE");
      const cropsConsumed = units * rate.cropQuantity;
      const rewardQuantity = units * rate.rewardQuantity;
      const nextWarehouse: FarmWarehouse = {
        ...warehouse, crops: { ...warehouse.crops, [landId]: available - cropsConsumed },
      };
      const nextMissions = recordMissionEvent(player.missionState as MissionState, "EXCHANGE", input.now ?? Date.now());
      await tx.update(farmV2PlayerStateTable).set({
        warehouseState: nextWarehouse, missionState: nextMissions, updatedAt: new Date(),
      }).where(eq(farmV2PlayerStateTable.userId, input.userId));
      return { landId, cropsConsumed, rewardQuantity,
        currency: rate.currency === "coins" ? "coin" as const : "crystal" as const,
        warehouse: nextWarehouse, missions: nextMissions };
    },
    execute: async (tx) => {
      const [player] = await tx.select().from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.userId)).for("update").limit(1);
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");

      const warehouse = player.warehouseState as FarmWarehouse;
      const available = warehouse.crops[landId];
      const requested = Math.min(input.cropQuantity, available);
      const units = Math.floor(requested / rate.cropQuantity);
      if (units <= 0) throw new Error("INSUFFICIENT_CROPS_FOR_EXCHANGE");
      const cropsConsumed = units * rate.cropQuantity;
      const rewardQuantity = units * rate.rewardQuantity;

      await applyFarmV2WalletStep({
        userId: input.userId,
        amount: rewardQuantity,
        currency: rate.currency === "coins" ? "coin" : "crystal",
        direction: "credit",
        launchToken: input.launchToken,
        reason: "farm_crop_exchange",
        referenceId: `${landId}:${cropsConsumed}`,
        referenceType: "farm_crop_exchange",
        requestId: input.requestId,
      });

      const nextWarehouse: FarmWarehouse = {
        ...warehouse, crops: { ...warehouse.crops, [landId]: available - cropsConsumed },
      };
      const nextMissions = recordMissionEvent(player.missionState as MissionState, "EXCHANGE", input.now ?? Date.now());
      await tx.update(farmV2PlayerStateTable).set({
        warehouseState: nextWarehouse, missionState: nextMissions, updatedAt: new Date(),
      }).where(eq(farmV2PlayerStateTable.userId, input.userId));

      return { landId, cropsConsumed, rewardQuantity,
        currency: rate.currency === "coins" ? "coin" as const : "crystal" as const,
        warehouse: nextWarehouse, missions: nextMissions };
    },
  });
}
