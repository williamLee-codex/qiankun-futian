import { mutateFarmV2AtomicPot } from "./farm-v2-atomic-pot";
import {
  findOfficialFestivalCode,
  readTrustedFormationGrants,
} from "./farm-v2-formation-sources";
import {
  redeemFestivalFormation,
  grantAchievementFormations,
} from "../../../qiankun-farm/src/game/v2/formationSourcesRuntime";
import {
  claimMissionReward,
  type MissionState,
} from "../../../qiankun-farm/src/game/v2/missionRuntime";
import { feedPetFromInventory } from "../../../qiankun-farm/src/game/v2/petTransactions";
import { acquireDirectPet } from "../../../qiankun-farm/src/game/v2/petRuntime";
import type { FarmPetId } from "../../../qiankun-farm/src/game/v2/petRuntime";
import { decodeFarmPetState, encodeFarmPetState } from "./farm-v2-json-codecs";
import { farmAuthorityContext } from "./farm-v2-authority-context";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, eq } from "drizzle-orm";
import { farmV2PlayerStateTable, farmV2MutationTable } from "@workspace/db";
import {
  planWorkshopMutation,
  workshopPublicState,
  workshopState,
  type WorkshopWarehouse,
  type WorkshopCommand,
} from "../../../qiankun-farm/src/game/v2/workshopRuntime";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";
import {
  applyFarmV2WalletStep,
  journalDb,
  runFarmV2RecoveryWithPostRollbackCompensation,
  isPermanentFarmV2RecoveryError,
} from "./farm-v2-wallet-saga";
import { readFarmV2WalletIntent } from "./farm-v2-wallet-saga";
type Input = {
  userId: string;
  requestId: string;
  launchToken: string;
  command: WorkshopCommand;
};
/** Existing Saga execution retained for recovery of pre-cutover journals. */
export function mutateLegacyFarmV2Workshop(input: Input) {
  if (
    !input.command ||
    typeof input.command !== "object" ||
    ![
      "redeemFormationCode",
      "claimAchievementFormations",
      "synthesize",
      "displayPot",
      "removePot",
      "buyDecor",
      "placeDecor",
      "claimMission",
      "buyFood",
      "feedPet",
      "buyPet",
      "buyFormation",
      "switchFormation",
    ].includes(input.command.kind)
  )
    throw new Error("INVALID_WORKSHOP_COMMAND");
  const paid = [
    "synthesize",
    "buyDecor",
    "claimMission",
    "buyFood",
    "buyPet",
    "buyFormation",
  ].includes(input.command.kind);
  const where = and(
    eq(farmV2MutationTable.userId, input.userId),
    eq(farmV2MutationTable.requestId, input.requestId),
  );
  type Plan = ReturnType<typeof planWorkshopMutation> & {
    currency?: "coin" | "crystal";
    before: WorkshopWarehouse;
    beforeMissions: unknown;
    beforePets: unknown;
    missions: unknown;
    pets: unknown;
  };
  type Tx = Parameters<
    Parameters<typeof runFarmV2IdempotentMutation>[0]["execute"]
  >[0];
  async function apply(tx: Tx, recover: boolean) {
    const [player] = await tx
      .select()
      .from(farmV2PlayerStateTable)
      .where(eq(farmV2PlayerStateTable.userId, input.userId))
      .for("update");
    if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
    const before = player.warehouseState as WorkshopWarehouse;
    let plan: Plan;
    if (recover) {
      const [entry] = await journalDb
        .select()
        .from(farmV2MutationTable)
        .where(where);
      plan = (entry.walletTransaction as { assetPlan: Plan }).assetPlan;
      await applyFarmV2WalletStep({
        ...(await readFarmV2WalletIntent(input.userId, input.requestId)),
        launchToken: input.launchToken,
      });
      if (
        !plan ||
        !isDeepStrictEqual(before, plan.before) ||
        !isDeepStrictEqual(player.missionState, plan.beforeMissions) ||
        !isDeepStrictEqual(player.petState, plan.beforePets)
      )
        throw new Error("WORKSHOP_RESERVATION_CHANGED");
    } else {
      const now = Date.now();
      const snapshots = {
        before,
        beforeMissions: player.missionState,
        beforePets: player.petState,
        missions: player.missionState,
        pets: player.petState,
      };
      if (
        input.command.kind === "redeemFormationCode" ||
        input.command.kind === "claimAchievementFormations"
      ) {
        const warehouse =
          input.command.kind === "redeemFormationCode"
            ? redeemFestivalFormation(
                before,
                findOfficialFestivalCode(input.command.codeHash),
                now,
              )
            : grantAchievementFormations(
                before,
                await readTrustedFormationGrants(input.launchToken),
                now,
              );
        plan = {
          warehouse,
          cost: 0,
          reward: 0,
          referenceId: "",
          ...workshopPublicState(warehouse),
          ...snapshots,
        };
      } else if (input.command.kind === "buyPet") {
        const pet = input.command.petId;
        if (!["尋星犬", "辟邪狻猊"].includes(pet))
          throw new Error("UNKNOWN_PET");
        const pets = decodeFarmPetState(player.petState);
        if (pets.owned.has(pet)) throw new Error("PET_ALREADY_OWNED");
        const warehouse = before;
        plan = {
          warehouse,
          cost: pet === "尋星犬" ? 300 : 100,
          reward: 0,
          currency: pet === "尋星犬" ? "coin" : "crystal",
          referenceId: pet === "尋星犬" ? "1" : "2",
          ...workshopPublicState(warehouse),
          ...snapshots,
          pets: encodeFarmPetState(acquireDirectPet(pets, pet)),
        };
      } else if (
        input.command.kind === "buyFormation" ||
        input.command.kind === "switchFormation"
      ) {
        const state = structuredClone(workshopState(before));
        state.formations = (state.formations ?? []).filter(
          (f) => f.expiresAt === null || f.expiresAt > now,
        );
        if (!state.formations.some((f) => f.id === state.activeFormation))
          state.activeFormation = null;
        const buying = input.command.kind === "buyFormation";
        if (buying) {
          if (state.formations.some((f) => f.id === "FORMATION_PREMIUM_V2"))
            throw new Error("FORMATION_ALREADY_OWNED");
          state.formations.push({
            id: "FORMATION_PREMIUM_V2",
            expiresAt: null,
          });
        } else if (input.command.kind === "switchFormation") {
          const id = input.command.formationId;
          if (id !== null && !state.formations.some((f) => f.id === id))
            throw new Error("FORMATION_NOT_OWNED");
          state.activeFormation = id;
        }
        const warehouse = { ...before, workshop: state };
        plan = {
          warehouse,
          cost: buying ? 388 : 0,
          reward: 0,
          currency: "crystal",
          referenceId: buying ? "FORMATION_PREMIUM_V2" : "",
          ...workshopPublicState(warehouse),
          ...snapshots,
        };
      } else if (input.command.kind === "claimMission") {
        const claimed = claimMissionReward(
          player.missionState as MissionState,
          input.command.missionId,
          now,
        );
        const state = structuredClone(workshopState(before));
        state.materials[claimed.reward.materialId] +=
          claimed.reward.materialQuantity;
        const warehouse = { ...before, workshop: state };
        plan = {
          warehouse,
          cost: 0,
          reward: claimed.reward.coins,
          referenceId:
            input.command.missionId +
            ":" +
            (input.command.missionId.startsWith("MISSION_D")
              ? claimed.state.dailyPeriodStart
              : claimed.state.weeklyPeriodStart),
          ...workshopPublicState(warehouse),
          ...snapshots,
          missions: claimed.state,
        };
      } else if (input.command.kind === "buyFood") {
        const quantity = input.command.quantity;
        if (
          !Number.isSafeInteger(quantity) ||
          quantity <= 0 ||
          quantity > 1073741823
        )
          throw new Error("INVALID_FOOD_QUANTITY");
        const state = structuredClone(workshopState(before));
        state.petFood = (state.petFood ?? 0) + quantity;
        const warehouse = { ...before, workshop: state };
        plan = {
          warehouse,
          cost: quantity * 2,
          reward: 0,
          referenceId: String(quantity),
          ...workshopPublicState(warehouse),
          ...snapshots,
        };
      } else if (input.command.kind === "feedPet") {
        const petId = input.command.petId as FarmPetId;
        const qualification =
          farmAuthorityContext.getStore()?.qualification ??
          player.effectivePaidCrystals;
        if (
          (petId === "噬時諦聽" && qualification < 450) ||
          (petId === "乾坤麒麟" && qualification < 799)
        )
          throw new Error("PET_NOT_OWNED");
        const state = structuredClone(workshopState(before));
        const result = feedPetFromInventory({
          state: decodeFarmPetState(player.petState),
          food: { 靈獸百味糧: state.petFood ?? 0 },
          petId,
          now,
        });
        state.petFood = result.food.靈獸百味糧;
        const warehouse = { ...before, workshop: state };
        plan = {
          warehouse,
          cost: 0,
          reward: 0,
          referenceId: "",
          ...workshopPublicState(warehouse),
          ...snapshots,
          pets: encodeFarmPetState(result.state),
        };
      } else
        plan = {
          ...planWorkshopMutation(before, input.command, randomUUID(), now),
          ...snapshots,
        };
      if (paid) {
        await journalDb
          .update(farmV2MutationTable)
          .set({ walletTransaction: { assetPlan: plan } })
          .where(where);
        const net = plan.reward - plan.cost,
          reason =
            input.command.kind === "synthesize"
              ? "farm_pot_synthesis"
              : input.command.kind === "claimMission"
                ? "farm_mission_reward"
                : input.command.kind === "buyFood"
                  ? "farm_pet_food_purchase"
                  : input.command.kind === "buyPet"
                    ? "farm_pet_purchase"
                    : input.command.kind === "buyFormation"
                      ? "farm_formation_purchase"
                      : "farm_decor_purchase";
        try {
          await applyFarmV2WalletStep({
            userId: input.userId,
            requestId: input.requestId,
            launchToken: input.launchToken,
            amount: Math.abs(net),
            currency: plan.currency ?? "coin",
            direction: net < 0 ? "debit" : "credit",
            reason,
            referenceType: reason,
            referenceId: plan.referenceId,
          });
        } catch (error) {
          // Core's definitive insufficient-funds result has no ledger effect.
          // Release inputs, retain decline evidence, and permit a fresh validation
          // on the same key after the player earns funds. Unknown outcomes stay reserved.
          if (
            error instanceof Error &&
            ["INSUFFICIENT_FUNDS", "insufficient_funds"].includes(error.message)
          ) {
            await journalDb
              .update(farmV2MutationTable)
              .set({
                transactionState: "PENDING",
                walletTransaction: { rejectedPlan: plan },
                failureCode: "INSUFFICIENT_FUNDS",
                updatedAt: new Date(),
              })
              .where(where);
          }
          throw error;
        }
      }
    }
    await tx
      .update(farmV2PlayerStateTable)
      .set({
        warehouseState: plan.warehouse,
        missionState: plan.missions,
        petState: plan.pets,
        updatedAt: new Date(),
      })
      .where(eq(farmV2PlayerStateTable.userId, input.userId));
    return {
      warehouse: plan.warehouse,
      cost: plan.cost,
      reward: plan.reward,
      ...workshopPublicState(plan.warehouse),
    };
  }
  return runFarmV2RecoveryWithPostRollbackCompensation({
    userId: input.userId,
    requestId: input.requestId,
    launchToken: input.launchToken,
    recover: () =>
      runFarmV2IdempotentMutation({
        userId: input.userId,
        requestId: input.requestId,
        action: "WORKSHOP:" + JSON.stringify(input.command),
        durableWallet: paid,
        isPermanentRecoveryError: isPermanentFarmV2RecoveryError,
        execute: (tx) => apply(tx, false),
        recover: (tx) => apply(tx, true),
      }),
  });
}

/** Public dispatcher: every NEW pot settlement requires verified co-location. */
export async function mutateFarmV2Workshop(input: Input) {
  if (input.command?.kind !== "synthesize")
    return mutateLegacyFarmV2Workshop(input);
  const [existing] = await journalDb
    .select()
    .from(farmV2MutationTable)
    .where(
      and(
        eq(farmV2MutationTable.userId, input.userId),
        eq(farmV2MutationTable.requestId, input.requestId),
      ),
    );
  // Never attach a new atomic result to a previously committed Saga wallet leg.
  // Old requests keep their exact original recovery/compensation contract.
  const legacy =
    existing &&
    (existing.walletTransaction as { settlement?: string } | null)
      ?.settlement !== "ATOMIC_CORE_FARM";
  if (legacy || existing?.transactionState === "COMPLETED")
    return mutateLegacyFarmV2Workshop(input);
  return mutateFarmV2AtomicPot({ ...input, command: input.command });
}
