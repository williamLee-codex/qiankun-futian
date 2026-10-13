import { and, eq } from "drizzle-orm";
import {
  db,
  farmV2MutationTable,
  farmV2PlayerStateTable,
  walletJournalDb,
} from "@workspace/db";
import {
  FARM_V2_MISSIONS,
  rollMissionPeriods,
  type MissionState,
} from "../../../qiankun-farm/src/game/v2/missionRuntime";
import {
  creditFarmMaterial,
  type FarmMaterialId,
  type FarmWarehouse,
} from "../../../qiankun-farm/src/game/v2/warehouseRuntime";
import {
  claimCoreFarmMissionReward,
  CoreMissionRewardError,
  type CoreMissionRewardReceipt,
  type FarmMissionId,
} from "./farm-v2-core-mission-reward";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";

const MISSION_ID_SET = new Set(FARM_V2_MISSIONS.map((mission) => mission.id));

function canonicalMission(missionId: string) {
  const mission = FARM_V2_MISSIONS.find((item) => item.id === missionId);
  if (!mission) throw new Error("UNKNOWN_MISSION");
  return mission;
}

async function applyCoreReward(input: {
  userId: string;
  launchToken: string;
  requestId: string;
  missionId: FarmMissionId;
  periodStart: Date;
  materialId: FarmMaterialId;
  materialQuantity: number;
  amount: number;
}): Promise<CoreMissionRewardReceipt> {
  const [existing] = await walletJournalDb
    .select()
    .from(farmV2MutationTable)
    .where(
      and(
        eq(farmV2MutationTable.userId, input.userId),
        eq(farmV2MutationTable.requestId, input.requestId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("FARM_MUTATION_NOT_FOUND");
  if (
    existing.missionId !== null &&
    (existing.missionId !== input.missionId ||
      existing.missionPeriodStart?.getTime() !== input.periodStart.getTime() ||
      existing.missionMaterialId !== input.materialId ||
      existing.missionMaterialQuantity !== input.materialQuantity ||
      existing.walletAmount !== input.amount ||
      existing.walletDirection !== "credit" ||
      existing.walletCurrency !== "coin")
  )
    throw new Error("FARM_MISSION_INTENT_MISMATCH");

  if (
    ["WALLET_APPLIED", "COMPLETED"].includes(existing.transactionState) &&
    existing.walletTransaction
  ) {
    const saved =
      existing.walletTransaction as Partial<CoreMissionRewardReceipt>;
    if (
      !saved.transactionId ||
      saved.missionId !== input.missionId ||
      saved.amount !== input.amount
    )
      throw new Error("INVALID_SAVED_CORE_MISSION_RECEIPT");
    return saved as CoreMissionRewardReceipt;
  }
  if (!["PENDING"].includes(existing.transactionState))
    throw new Error("MUTATION_IN_PROGRESS");

  // Commit the frozen intent on the journal connection before contacting Core.
  await walletJournalDb
    .update(farmV2MutationTable)
    .set({
      missionId: input.missionId,
      missionPeriodStart: input.periodStart,
      missionMaterialId: input.materialId,
      missionMaterialQuantity: input.materialQuantity,
      walletDirection: "credit",
      walletCurrency: "coin",
      walletAmount: input.amount,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(farmV2MutationTable.userId, input.userId),
        eq(farmV2MutationTable.requestId, input.requestId),
      ),
    );

  let receipt: CoreMissionRewardReceipt;
  try {
    receipt = await claimCoreFarmMissionReward(
      input.launchToken,
      input.missionId,
      input.requestId,
    );
  } catch (error) {
    if (error instanceof CoreMissionRewardError && error.definitive) {
      await walletJournalDb
        .update(farmV2MutationTable)
        .set({
          transactionState: "REJECTED",
          failureCode: error.message,
          missionId: null,
          missionPeriodStart: null,
          missionMaterialId: null,
          missionMaterialQuantity: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(farmV2MutationTable.userId, input.userId),
            eq(farmV2MutationTable.requestId, input.requestId),
          ),
        );
    }
    throw error;
  }
  await walletJournalDb
    .update(farmV2MutationTable)
    .set({
      transactionState: "WALLET_APPLIED",
      walletTransaction: receipt as object,
      failureCode: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(farmV2MutationTable.userId, input.userId),
        eq(farmV2MutationTable.requestId, input.requestId),
      ),
    );
  return receipt;
}

async function finishFarmClaim(input: {
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
  userId: string;
  requestId: string;
  missionId: FarmMissionId;
  now: number;
}) {
  const mission = canonicalMission(input.missionId);
  const [player] = await input.tx
    .select()
    .from(farmV2PlayerStateTable)
    .where(eq(farmV2PlayerStateTable.userId, input.userId))
    .for("update")
    .limit(1);
  if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
  const [intent] = await input.tx
    .select()
    .from(farmV2MutationTable)
    .where(
      and(
        eq(farmV2MutationTable.userId, input.userId),
        eq(farmV2MutationTable.requestId, input.requestId),
      ),
    )
    .limit(1);
  if (
    !intent ||
    intent.missionId !== input.missionId ||
    !intent.missionPeriodStart ||
    !intent.walletTransaction
  )
    throw new Error("FARM_MISSION_INTENT_NOT_RECOVERABLE");

  const warehouse = creditFarmMaterial(
    player.warehouseState as FarmWarehouse,
    intent.missionMaterialId as FarmMaterialId,
    intent.missionMaterialQuantity!,
  );
  const missions = rollMissionPeriods(
    player.missionState as MissionState,
    input.now,
  );
  const currentPeriodStart =
    mission.period === "DAILY"
      ? missions.dailyPeriodStart
      : missions.weeklyPeriodStart;
  if (currentPeriodStart === intent.missionPeriodStart.getTime()) {
    const current = missions.progress[mission.id];
    missions.progress[mission.id] = { ...current, claimed: true };
  }
  await input.tx
    .update(farmV2PlayerStateTable)
    .set({
      warehouseState: warehouse,
      missionState: missions,
      updatedAt: new Date(input.now),
    })
    .where(eq(farmV2PlayerStateTable.userId, input.userId));
  return {
    missionId: input.missionId,
    coins: intent.walletAmount,
    material: {
      id: intent.missionMaterialId,
      quantity: intent.missionMaterialQuantity,
    },
    missionState: missions,
    warehouse,
    coreTransaction: intent.walletTransaction,
  };
}

export async function claimFarmV2Mission(input: {
  userId: string;
  launchToken: string;
  requestId: string;
  missionId: FarmMissionId;
  now?: number;
}) {
  if (!MISSION_ID_SET.has(input.missionId)) throw new Error("UNKNOWN_MISSION");
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(input.requestId))
    throw new Error("REQUEST_ID_REQUIRED");
  const mission = canonicalMission(input.missionId);
  const now = input.now ?? Date.now();

  return runFarmV2IdempotentMutation({
    requestId: input.requestId,
    userId: input.userId,
    action: `mission-claim:${mission.id}`,
    walletReservation: true,
    recover: (tx) =>
      finishFarmClaim({
        tx,
        userId: input.userId,
        requestId: input.requestId,
        missionId: mission.id as FarmMissionId,
        now,
      }),
    execute: async (tx) => {
      const [player] = await tx
        .select()
        .from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.userId))
        .for("update")
        .limit(1);
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
      const [intent] = await tx
        .select()
        .from(farmV2MutationTable)
        .where(
          and(
            eq(farmV2MutationTable.userId, input.userId),
            eq(farmV2MutationTable.requestId, input.requestId),
          ),
        )
        .limit(1);
      if (!intent) throw new Error("FARM_MUTATION_NOT_FOUND");
      if (intent.missionId && intent.missionId !== mission.id)
        throw new Error("FARM_MISSION_INTENT_MISMATCH");

      let periodStart: Date;
      if (intent.missionId) {
        if (
          !intent.missionPeriodStart ||
          intent.missionMaterialId !== mission.reward.materialId ||
          intent.missionMaterialQuantity !== mission.reward.materialQuantity ||
          intent.walletAmount !== mission.reward.coins
        )
          throw new Error("FARM_MISSION_INTENT_MISMATCH");
        periodStart = intent.missionPeriodStart;
      } else {
        const missions = rollMissionPeriods(
          player.missionState as MissionState,
          now,
        );
        const progress = missions.progress[mission.id];
        if (!progress.completed)
          throw new Error(
            mission.prerequisiteIds
              ? "MISSION_PREREQUISITE_INCOMPLETE"
              : "MISSION_NOT_COMPLETE",
          );
        if (progress.claimed) throw new Error("MISSION_ALREADY_CLAIMED");
        periodStart = new Date(
          mission.period === "DAILY"
            ? missions.dailyPeriodStart
            : missions.weeklyPeriodStart,
        );
      }

      await applyCoreReward({
        userId: input.userId,
        launchToken: input.launchToken,
        requestId: input.requestId,
        missionId: mission.id as FarmMissionId,
        periodStart,
        materialId: mission.reward.materialId,
        materialQuantity: mission.reward.materialQuantity,
        amount: mission.reward.coins,
      });
      return finishFarmClaim({
        tx,
        userId: input.userId,
        requestId: input.requestId,
        missionId: mission.id as FarmMissionId,
        now,
      });
    },
  });
}
