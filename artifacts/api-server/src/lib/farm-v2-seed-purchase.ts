import { and, eq } from "drizzle-orm";
import { db, farmV2LandTable, farmV2MutationTable, farmV2PlayerStateTable } from "@workspace/db";
import { getSeedPack } from "../../../qiankun-farm/src/game/v2/canonicalEconomyData";
import type { FarmLandId } from "../../../qiankun-farm/src/game/v2/canonicalLandData";
import type { FarmWarehouse } from "../../../qiankun-farm/src/game/v2/warehouseRuntime";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";
import { precheckSeedPurchase } from "./farm-v2-precheck";
import { readPurchaseWalletBalance } from "./farm-v2-coin-balance";
import { localCoinsEnabled } from "./farm-v2-local-coins";
import {
  applyFarmV2WalletStep,
  readFarmV2WalletIntent,
  isPermanentFarmV2RecoveryError,
  runFarmV2RecoveryWithPostRollbackCompensation,
} from "./farm-v2-wallet-saga";

export async function purchaseFarmV2SeedPacks(input: {
  userId: string;
  launchToken: string;
  requestId: string;
  landId: number;
  packs: number;
}) {
  if (!Number.isInteger(input.landId) || input.landId < 1 || input.landId > 6)
    throw new Error("INVALID_FARM_LAND_ID");
  if (
    !Number.isSafeInteger(input.packs) ||
    input.packs <= 0 ||
    input.packs > 2147483647
  )
    throw new Error("INVALID_PACK_COUNT");
  const landId = input.landId as FarmLandId;
  const pack = getSeedPack(landId);
  if (!pack.purchasable) throw new Error("SEED_NOT_PURCHASABLE");

  // Normal business refusals happen before a mutation row exists, so a short
  // balance or locked land never leaves a PENDING residue behind.
  const [prePlayer] = await db
    .select({ userId: farmV2PlayerStateTable.userId })
    .from(farmV2PlayerStateTable)
    .where(eq(farmV2PlayerStateTable.userId, input.userId))
    .limit(1);
  const [preLand] = await db
    .select({ unlocked: farmV2LandTable.accessActive })
    .from(farmV2LandTable)
    .where(and(eq(farmV2LandTable.userId, input.userId), eq(farmV2LandTable.landId, landId)))
    .limit(1);
  // Seed purchases debit the farm bank when local coins are enabled, and the
  // central wallet otherwise; the pre-check must read that same wallet.
  const wallet = localCoinsEnabled() ? ("farm" as const) : ("core" as const);
  // A request that already owns a journal is a retry: the journal decides.
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
  const precheck = journal
    ? { ok: true as const }
    : precheckSeedPurchase({
    playerExists: Boolean(prePlayer),
    landUnlocked: Boolean(preLand?.unlocked),
    unitPrice: pack.price,
    packs: input.packs,
        availableCoins: await readPurchaseWalletBalance(input.userId, wallet),
        wallet,
      });
  if (!precheck.ok) throw new Error(precheck.code);

  return runFarmV2RecoveryWithPostRollbackCompensation({
    userId: input.userId,
    requestId: input.requestId,
    launchToken: input.launchToken,
    recover: () =>
      runFarmV2IdempotentMutation({
        requestId: input.requestId,
        userId: input.userId,
        action: `seed-purchase:${landId}:${input.packs}`,
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
          const seedsAdded = pack.quantity * input.packs;
          const nextWarehouse: FarmWarehouse = {
            ...warehouse,
            seeds: {
              ...warehouse.seeds,
              [landId]: warehouse.seeds[landId] + seedsAdded,
            },
          };
          await tx
            .update(farmV2PlayerStateTable)
            .set({ warehouseState: nextWarehouse, updatedAt: new Date() })
            .where(eq(farmV2PlayerStateTable.userId, input.userId));
          return {
            landId,
            packs: input.packs,
            seedsAdded,
            cost: pack.price * input.packs,
            currency: "coin" as const,
            warehouse: nextWarehouse,
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

          const [land] = await tx.select({ unlocked: farmV2LandTable.accessActive })
            .from(farmV2LandTable)
            .where(and(eq(farmV2LandTable.userId, input.userId), eq(farmV2LandTable.landId, landId)))
            .limit(1);
          if (!land?.unlocked) throw new Error("FARM_SEED_LAND_LOCKED");

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
            seeds: {
              ...warehouse.seeds,
              [landId]: warehouse.seeds[landId] + seedsAdded,
            },
          };
          await tx
            .update(farmV2PlayerStateTable)
            .set({ warehouseState: nextWarehouse, updatedAt: new Date() })
            .where(eq(farmV2PlayerStateTable.userId, input.userId));

          return {
            landId,
            packs: input.packs,
            seedsAdded,
            cost,
            currency: "coin" as const,
            warehouse: nextWarehouse,
          };
        },
      }),
  });
}
