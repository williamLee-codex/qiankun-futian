import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { farmV2MutationTable, farmV2PlayerStateTable } from "@workspace/db";
import { getExchangeRate } from "../../../qiankun-farm/src/game/v2/canonicalEconomyData";
import {
  applyCoinReward,
  formationBonuses,
} from "../../../qiankun-farm/src/game/v2/formationEffects";
import type { FarmLandId } from "../../../qiankun-farm/src/game/v2/canonicalLandData";
import type { FarmWarehouse } from "../../../qiankun-farm/src/game/v2/warehouseRuntime";
import type { MissionState } from "../../../qiankun-farm/src/game/v2/missionRuntime";
import { recordMissionEvent } from "../../../qiankun-farm/src/game/v2/missionRuntime";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";
import { precheckCropExchange } from "./farm-v2-precheck";
import {
  applyFarmV2WalletStep,
  readFarmV2WalletIntent,
  isPermanentFarmV2RecoveryError,
  runFarmV2RecoveryWithPostRollbackCompensation,
} from "./farm-v2-wallet-saga";

export async function exchangeFarmV2Crops(input: {
  userId: string;
  launchToken: string;
  requestId: string;
  landId: number;
  cropQuantity: number;
  now?: number;
}) {
  if (!Number.isInteger(input.landId) || input.landId < 1 || input.landId > 6)
    throw new Error("INVALID_FARM_LAND_ID");
  if (
    !Number.isSafeInteger(input.cropQuantity) ||
    input.cropQuantity <= 0 ||
    input.cropQuantity > 2147483647
  )
    throw new Error("INVALID_EXCHANGE_QUANTITY");
  const landId = input.landId as FarmLandId;
  const rate = getExchangeRate(landId);

  // A request that already owns a journal is a retry: the journal decides what
  // happens, so the fresh-request prechecks must not short-circuit it.
  const [journal] = await db
    .select({ requestId: farmV2MutationTable.requestId })
    .from(farmV2MutationTable)
    .where(
      and(
        eq(farmV2MutationTable.userId, input.userId),
        eq(farmV2MutationTable.requestId, input.requestId),
      ),
    )
    .limit(1);
  // Exchanging more than the player holds is a normal refusal; it must not
  // reach the wallet saga, which is where a PENDING residue could be created.
  const [prePlayer] = journal
    ? [{ warehouseState: null }]
    : await db
    .select({ warehouseState: farmV2PlayerStateTable.warehouseState })
    .from(farmV2PlayerStateTable)
    .where(eq(farmV2PlayerStateTable.userId, input.userId))
    .limit(1);
  if (!journal) {
    if (!prePlayer) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
    const preWarehouse = prePlayer.warehouseState as FarmWarehouse;
    // The exchange settles the largest whole units the stock allows, so only an
    // empty stock is refused here; the executed plan reports the real quantity.
    const stock = preWarehouse.crops[landId] ?? 0;
    const precheck = precheckCropExchange({
      cropStock: stock,
      quantity: Math.min(input.cropQuantity, stock),
      rate: rate.cropQuantity,
    });
    if (!precheck.ok) throw new Error(precheck.code);
  }

  return runFarmV2RecoveryWithPostRollbackCompensation({
    userId: input.userId,
    requestId: input.requestId,
    launchToken: input.launchToken,
    recover: () =>
      runFarmV2IdempotentMutation({
        requestId: input.requestId,
        userId: input.userId,
        action: `crop-exchange:${landId}:${input.cropQuantity}`,
        isPermanentRecoveryError: isPermanentFarmV2RecoveryError,
        durableWallet: true,
        recover: async (tx) => {
          const command = await readFarmV2WalletIntent(
            input.userId,
            input.requestId,
          );
          await applyFarmV2WalletStep({
            ...command,
            launchToken: input.launchToken,
          });
          const [player] = await tx
            .select()
            .from(farmV2PlayerStateTable)
            .where(eq(farmV2PlayerStateTable.userId, input.userId))
            .for("update")
            .limit(1);
          if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
          const warehouse = player.warehouseState as FarmWarehouse;
          const available = warehouse.crops[landId];
          const cropsConsumed = Number(command.referenceId.split(":")[1]);
          const rewardQuantity = command.amount;
          if (available < cropsConsumed)
            throw new Error("INSUFFICIENT_CROPS_FOR_EXCHANGE");
          const nextWarehouse: FarmWarehouse = {
            ...warehouse,
            crops: { ...warehouse.crops, [landId]: available - cropsConsumed },
          };
          const nextMissions = recordMissionEvent(
            player.missionState as MissionState,
            "EXCHANGE",
            input.now ?? Date.now(),
          );
          await tx
            .update(farmV2PlayerStateTable)
            .set({
              warehouseState: nextWarehouse,
              missionState: nextMissions,
              updatedAt: new Date(),
            })
            .where(eq(farmV2PlayerStateTable.userId, input.userId));
          return {
            landId,
            cropsConsumed,
            rewardQuantity,
            currency:
              rate.currency === "coins"
                ? ("coin" as const)
                : ("crystal" as const),
            warehouse: nextWarehouse,
            missions: nextMissions,
          };
        },
        execute: async (tx) => {
          const [player] = await tx
            .select()
            .from(farmV2PlayerStateTable)
            .where(eq(farmV2PlayerStateTable.userId, input.userId))
            .for("update")
            .limit(1);
          if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");

          const warehouse = player.warehouseState as FarmWarehouse;
          const available = warehouse.crops[landId];
          const requested = Math.min(input.cropQuantity, available);
          const units = Math.floor(requested / rate.cropQuantity);
          if (units <= 0) throw new Error("INSUFFICIENT_CROPS_FOR_EXCHANGE");
          const cropsConsumed = units * rate.cropQuantity;
          const rewardQuantity =
            rate.currency === "coins"
              ? applyCoinReward(
                  units * rate.rewardQuantity,
                  formationBonuses(warehouse, input.now ?? Date.now()),
                )
              : units * rate.rewardQuantity;

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
            ...warehouse,
            crops: { ...warehouse.crops, [landId]: available - cropsConsumed },
          };
          const nextMissions = recordMissionEvent(
            player.missionState as MissionState,
            "EXCHANGE",
            input.now ?? Date.now(),
          );
          await tx
            .update(farmV2PlayerStateTable)
            .set({
              warehouseState: nextWarehouse,
              missionState: nextMissions,
              updatedAt: new Date(),
            })
            .where(eq(farmV2PlayerStateTable.userId, input.userId));

          return {
            landId,
            cropsConsumed,
            rewardQuantity,
            currency:
              rate.currency === "coins"
                ? ("coin" as const)
                : ("crystal" as const),
            warehouse: nextWarehouse,
            missions: nextMissions,
          };
        },
      }),
  });
}
