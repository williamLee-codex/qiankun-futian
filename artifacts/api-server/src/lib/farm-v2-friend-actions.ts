import { randomInt } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { farmV2PlayerStateTable, farmV2LandTable } from "@workspace/db";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";
import { farmAuthorityContext } from "./farm-v2-authority-context";
import {
  farmV2LandRowToEntity,
  farmV2LandEntityToPersistence,
} from "./farm-v2-mappers";
import { decodeFarmPetState } from "./farm-v2-json-codecs";
import { reconcileMilestonePets } from "../../../qiankun-farm/src/game/v2/petRuntime";
import { getActiveFarmPetEffects } from "../../../qiankun-farm/src/game/v2/petEffectsRuntime";
import {
  assertFriendInteractionEligible,
  createFriendInteractionState,
} from "../../../qiankun-farm/src/game/v2/friendInteractionRuntime";
import { executeLockedBorrowLandTransaction } from "../../../qiankun-farm/src/game/v2/borrowLandTransaction";
import { executeLockedAssistLandTransaction } from "../../../qiankun-farm/src/game/v2/assistLandTransaction";
import { isFarmerActiveOnAnyLand } from "../../../qiankun-farm/src/game/v2/farmerInteractionBridge";
import {
  workshopState,
  type WorkshopWarehouse,
} from "../../../qiankun-farm/src/game/v2/workshopRuntime";
import type { FarmerState } from "../../../qiankun-farm/src/game/v2/farmerRuntime";
export function mutateFarmV2Friend(input: {
  userId: string;
  targetId: string;
  requestId: string;
  kind: "BORROW" | "ASSIST";
  landId: number;
}) {
  if (
    input.userId === input.targetId ||
    !["BORROW", "ASSIST"].includes(input.kind) ||
    !Number.isInteger(input.landId) ||
    input.landId < 1 ||
    input.landId > 6
  )
    throw new Error("INVALID_FRIEND_REQUEST");
  const authority = farmAuthorityContext.getStore();
  if (
    authority?.userId !== input.userId ||
    authority.targetQualification === undefined ||
    !authority.participants?.some((p) => p.userId === input.targetId)
  )
    throw new Error("FARM_FRIEND_AUTHORITY_REQUIRED");
  return runFarmV2IdempotentMutation({
    userId: input.userId,
    requestId: input.requestId,
    participantUserIds: [input.targetId],
    action: `FRIEND:${input.kind}:${input.targetId}:${input.landId}`,
    execute: async (tx) => {
      const [actor] = await tx
        .select()
        .from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.userId));
      const [target] = await tx
        .select()
        .from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.targetId));
      if (!actor || !target) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
      const now = Date.now(),
        ownerWarehouse = target.warehouseState as WorkshopWarehouse,
        actorWarehouse = actor.warehouseState as WorkshopWarehouse;
      const state = workshopState(actorWarehouse),
        interactionState =
          state.friendInteractions ?? createFriendInteractionState(now);
      const rawFarmer = target.farmerState as FarmerState;
      const farmer = {
        ...rawFarmer,
        entitled: authority.targetQualification! >= 999,
        enabledByLand: rawFarmer.enabledByLand ?? {
          1: true,
          2: true,
          3: true,
          4: true,
          5: true,
          6: true,
        },
      };
      const targetFarmerActive = isFarmerActiveOnAnyLand(farmer);
      // Relationship/identity and both paid qualifications are held by the Core permits.
      // The guard runs before quota, maturity, quantity and random pet rolls.
      if (targetFarmerActive) throw new Error("TARGET_FARMER_ACTIVE");
      assertFriendInteractionEligible({
        state: interactionState,
        kind: input.kind,
        friendUid: input.targetId,
        now,
        eligibility: { mutualFriends: true, targetFarmerActive },
      });
      if (input.landId < 2 || input.landId > 5)
        throw new Error("FRIEND_LAND_NOT_ALLOWED");
      const rows = await tx
        .select()
        .from(farmV2LandTable)
        .where(eq(farmV2LandTable.userId, input.targetId))
        .orderBy(farmV2LandTable.landId)
        .for("update");
      const targetRow = rows.find((r) => r.landId === input.landId);
      if (!targetRow) throw new Error("FARM_LAND_NOT_FOUND");
      const eligible = (id: number) =>
        id >= 2 &&
        id <= 5 &&
        (id < 4 || authority.targetQualification! >= (id === 4 ? 100 : 300));
      const lands = rows
        .filter(
          (r) =>
            eligible(r.landId) &&
            r.accessActive &&
            ["GROWING", "MATURE"].includes(r.lifecycle),
        )
        .map(farmV2LandRowToEntity);
      const main = lands.find((l) => l.landId === input.landId);
      if (!main) throw new Error("FRIEND_LAND_NOT_ALLOWED");
      let actorNext: WorkshopWarehouse,
        ownerNext = ownerWarehouse,
        nextInteractions,
        changedLands,
        successful: boolean;
      if (input.kind === "BORROW") {
        const emptyPet = {
          owned: new Set<never>(),
          activePetId: null,
          activeUntil: null,
        };
        const actorPets = reconcileMilestonePets({
          state: Array.isArray((actor.petState as { owned?: unknown }).owned)
            ? decodeFarmPetState(actor.petState)
            : emptyPet,
          effectivePaidCrystals: authority.qualification,
          now,
        });
        const targetPets = reconcileMilestonePets({
          state: Array.isArray((target.petState as { owned?: unknown }).owned)
            ? decodeFarmPetState(target.petState)
            : emptyPet,
          effectivePaidCrystals: authority.targetQualification!,
          now,
        });
        const a = getActiveFarmPetEffects(actorPets, now),
          t = getActiveFarmPetEffects(targetPets, now);
        const result = executeLockedBorrowLandTransaction({
          interactionState,
          friendUid: input.targetId,
          now,
          mutualFriends: true,
          targetFarmerActive,
          lands: [main, ...lands.filter((l) => l.landId !== main.landId)],
          pets: {
            tingActive: a.tingSecondField,
            qilinActive: t.qilinBlock,
            suanniActive: t.suanniProtection,
          },
          rng: { next: () => randomInt(0, 0x100000000) / 0x100000000 },
          borrowerWarehouse: actorWarehouse,
        });
        actorNext = result.borrowerWarehouse;
        nextInteractions = result.interactionState;
        changedLands = result.lands;
        successful = result.successful;
      } else {
        if (!target.firstFarmEnteredAt)
          throw new Error("FIRST_FARM_ENTERED_AT_REQUIRED");
        const result = executeLockedAssistLandTransaction({
          interactionState,
          friendUid: input.targetId,
          now,
          mutualFriends: true,
          targetFarmerActive,
          land: main,
          ownerWarehouse,
          helperWarehouse: actorWarehouse,
          ownerFirstFarmEnteredAt: target.firstFarmEnteredAt.getTime(),
        });
        actorNext = result.helperWarehouse;
        ownerNext = result.ownerWarehouse;
        nextInteractions = result.interactionState;
        changedLands = [result.land];
        successful = result.successful;
      }
      if (successful) {
        for (const land of changedLands) {
          const row = rows.find((r) => r.landId === land.landId)!;
          await tx
            .update(farmV2LandTable)
            .set({
              ...farmV2LandEntityToPersistence(land),
              version: row.version + 1,
            })
            .where(
              and(
                eq(farmV2LandTable.userId, input.targetId),
                eq(farmV2LandTable.landId, land.landId),
              ),
            );
        }
        actorNext = {
          ...actorNext,
          workshop: {
            ...workshopState(actorNext),
            friendInteractions: nextInteractions,
          },
        };
        await tx
          .update(farmV2PlayerStateTable)
          .set({ warehouseState: actorNext, updatedAt: new Date(now) })
          .where(eq(farmV2PlayerStateTable.userId, input.userId));
        if (input.kind === "ASSIST")
          await tx
            .update(farmV2PlayerStateTable)
            .set({ warehouseState: ownerNext, updatedAt: new Date(now) })
            .where(eq(farmV2PlayerStateTable.userId, input.targetId));
      }
      return { successful, interactionState: nextInteractions };
    },
  });
}
