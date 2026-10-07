import { eq } from "drizzle-orm";
import { farmV2PlayerStateTable } from "@workspace/db";
import { getSeedPack } from "../../../qiankun-farm/src/game/v2/canonicalEconomyData";
import type { FarmLandId } from "../../../qiankun-farm/src/game/v2/canonicalLandData";
import type { FarmWarehouse } from "../../../qiankun-farm/src/game/v2/warehouseRuntime";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";
import { applyFarmV2WalletStep } from "./farm-v2-wallet-saga";

export async function purchaseFarmV2SeedPacks(input: {
  userId: string;
  launchToken: string;
  requestId: string;
  landId: number;
  packs: number;
}) {
  if (!Number.isInteger(input.landId) || input.landId < 1 || input.landId > 6) throw new Error("INVALID_FARM_LAND_ID");
  if (!Number.isInteger(input.packs) || input.packs <= 0) throw new Error("INVALID_PACK_COUNT");
  const landId = input.landId as FarmLandId;
  const pack = getSeedPack(landId);
  if (!pack.purchasable) throw new Error("SEED_NOT_PURCHASABLE");

  return runFarmV2IdempotentMutation({
    requestId: input.requestId,
    userId: input.userId,
    action: `seed-purchase:${landId}:${input.packs}`,
    recover: async (tx) => {
      const [player] = await tx.select().from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.userId)).for("update").limit(1);
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
      const warehouse = player.warehouseState as FarmWarehouse;
      const seedsAdded = pack.quantity * input.packs;
      const nextWarehouse: FarmWarehouse = {
        ...warehouse,
        seeds: { ...warehouse.seeds, [landId]: warehouse.seeds[landId] + seedsAdded },
      };
      await tx.update(farmV2PlayerStateTable)
        .set({ warehouseState: nextWarehouse, updatedAt: new Date() })
        .where(eq(farmV2PlayerStateTable.userId, input.userId));
      return { landId, packs: input.packs, seedsAdded, cost: pack.price * input.packs, currency: "coin" as const, warehouse: nextWarehouse };
    },
    execute: async (tx) => {
      const [player] = await tx.select().from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.userId)).for("update").limit(1);
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");

      const cost = pack.price * input.packs;
      await applyFarmV2WalletStep({
        userId: input.userId,
        amount: cost,
        currency: "coin",
        direction: "debit",
        launchToken: input.launchToken,
        reason: "farm_seed_purchase",
        referenceId: `${landId}:${input.packs}`,
        referenceType: "farm_seed_pack",
        requestId: input.requestId,
      });

      const warehouse = player.warehouseState as FarmWarehouse;
      const seedsAdded = pack.quantity * input.packs;
      const nextWarehouse: FarmWarehouse = {
        ...warehouse,
        seeds: { ...warehouse.seeds, [landId]: warehouse.seeds[landId] + seedsAdded },
      };
      await tx.update(farmV2PlayerStateTable)
        .set({ warehouseState: nextWarehouse, updatedAt: new Date() })
        .where(eq(farmV2PlayerStateTable.userId, input.userId));

      return { landId, packs: input.packs, seedsAdded, cost, currency: "coin" as const, warehouse: nextWarehouse };
    },
  });
}
