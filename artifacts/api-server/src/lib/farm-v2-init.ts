import { and, eq } from "drizzle-orm";
import { db, farmV2LandTable, farmV2PlayerStateTable } from "@workspace/db";
import { createInitialFarmAccess } from "../../../qiankun-farm/src/game/v2/accessRuntime";
import { createInitialLandEntities } from "../../../qiankun-farm/src/game/v2/landRuntime";
import { createMissionState } from "../../../qiankun-farm/src/game/v2/missionRuntime";
import { createFarmPetState } from "../../../qiankun-farm/src/game/v2/petRuntime";
import { createFarmerState } from "../../../qiankun-farm/src/game/v2/farmerRuntime";
import { createEmptyFarmWarehouse } from "../../../qiankun-farm/src/game/v2/warehouseRuntime";
import { encodeFarmAccessState, encodeFarmPetState } from "./farm-v2-json-codecs";

export async function ensureFarmV2PlayerInitialized(input: { userId: string; now?: number }) {
  const userId = input.userId.trim();
  if (!userId) throw new Error("ACTOR_UID_REQUIRED");
  const now = input.now ?? Date.now();
  const enteredAt = new Date(now);

  return db.transaction(async (tx) => {
    await tx.execute(
      `SELECT pg_advisory_xact_lock(hashtextextended('${userId}:farm-v2-init', 0))`,
    );

    let player = await tx.query.farmV2PlayerStateTable.findFirst({
      where: eq(farmV2PlayerStateTable.userId, userId),
    });

    if (!player) {
      const access = createInitialFarmAccess();
      const [created] = await tx.insert(farmV2PlayerStateTable).values({
        userId,
        firstFarmEnteredAt: enteredAt,
        effectivePaidCrystals: 0,
        accessState: encodeFarmAccessState(access),
        warehouseState: createEmptyFarmWarehouse(),
        missionState: createMissionState(now),
        petState: encodeFarmPetState(createFarmPetState()),
        farmerState: createFarmerState(),
        chaosSeedState: null,
      }).returning();
      player = created;

      const lands = createInitialLandEntities(access.accessActive);
      await tx.insert(farmV2LandTable).values(lands.map((land) => ({
        userId,
        landId: land.landId,
        lifecycle: land.lifecycle,
        accessActive: land.accessActive,
        plantedQuantity: land.plantedQuantity,
        plantedAt: null,
        maturesAt: null,
        version: 0,
      })));
    }

    const lands = await tx.select().from(farmV2LandTable)
      .where(eq(farmV2LandTable.userId, userId))
      .orderBy(farmV2LandTable.landId);

    if (lands.length !== 6) throw new Error("FARM_INITIALIZATION_INCOMPLETE");
    return { player, lands };
  });
}
