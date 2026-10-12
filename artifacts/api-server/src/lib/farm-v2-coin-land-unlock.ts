import { and, eq } from "drizzle-orm";
import {
  db,
  walletJournalDb,
  farmV2MutationTable,
  farmV2PlayerStateTable,
  farmV2LandTable,
} from "@workspace/db";
import {
  CoreCoinLandError,
  readCoreCoinLands,
  purchaseCoreCoinLand,
} from "./farm-v2-core-coin-land";
import { projectCoreCoinLands } from "../../../qiankun-farm/src/game/v2/coinLandProjection";
import {
  decodeFarmAccessState,
  encodeFarmAccessState,
} from "./farm-v2-json-codecs";
import {
  farmV2LandRowToEntity,
  farmV2VersionedLandPersistence,
} from "./farm-v2-mappers";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";
import { FarmWalletRejectedError } from "./farm-v2-wallet-client";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function purchaseFarmV2CoinLand(input: {
  userId: string;
  launchToken: string;
  requestId: string;
  landId: number;
}) {
  if (input.landId !== 2 && input.landId !== 3)
    throw new FarmWalletRejectedError("INVALID_FARM_LAND_ID");
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(input.requestId))
    throw new FarmWalletRejectedError("REQUEST_ID_REQUIRED");
  const landId = input.landId,
    amount = landId === 2 ? 88 : 888;
  const where = and(
    eq(farmV2MutationTable.userId, input.userId),
    eq(farmV2MutationTable.requestId, input.requestId),
  );
  // Commit a full intent before starting the domain transaction/contacting Core.
  // Core owns the permanent right. Farm must never compensate this operation.
  const inserted = await walletJournalDb
    .insert(farmV2MutationTable)
    .values({
      userId: input.userId,
      requestId: input.requestId,
      action: `coin-land-unlock:${landId}`,
      walletDirection: "debit",
      walletCurrency: "coin",
      walletAmount: amount,
    })
    .onConflictDoNothing()
    .returning({ requestId: farmV2MutationTable.requestId });
  const applyProjection = async (tx: Tx) => {
    const [player] = await tx
      .select()
      .from(farmV2PlayerStateTable)
      .where(eq(farmV2PlayerStateTable.userId, input.userId))
      .for("update")
      .limit(1);
    if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
    const rights = await readCoreCoinLands(input.launchToken);
    if (!rights.find((r) => r.landId === landId)?.historicallyUnlocked)
      throw new Error("CORE_COIN_LAND_HISTORY_CONFLICT");
    const rows = await tx
      .select()
      .from(farmV2LandTable)
      .where(eq(farmV2LandTable.userId, input.userId))
      .orderBy(farmV2LandTable.landId);
    const next = projectCoreCoinLands(
      decodeFarmAccessState(player.accessState),
      rows.map(farmV2LandRowToEntity),
      rights,
    );
    await tx
      .update(farmV2PlayerStateTable)
      .set({
        accessState: encodeFarmAccessState(next.access),
        updatedAt: new Date(),
      })
      .where(eq(farmV2PlayerStateTable.userId, input.userId));
    for (const land of next.lands.filter(
      (l) => l.landId === 2 || l.landId === 3,
    ))
      await tx
        .update(farmV2LandTable)
        .set(
          farmV2VersionedLandPersistence(
            land,
            rows.find((r) => r.landId === land.landId)!,
          ),
        )
        .where(
          and(
            eq(farmV2LandTable.userId, input.userId),
            eq(farmV2LandTable.landId, land.landId),
          ),
        );
    return {
      landId,
      accessActive: next.access.accessActive.has(landId),
      historicallyUnlocked: true,
    };
  };
  try {
    return await runFarmV2IdempotentMutation({
      userId: input.userId,
      requestId: input.requestId,
      action: `coin-land-unlock:${landId}`,
      walletReservation: true,
      recover: applyProjection,
      execute: async (tx) => {
        const [player] = await tx
          .select()
          .from(farmV2PlayerStateTable)
          .where(eq(farmV2PlayerStateTable.userId, input.userId))
          .for("update")
          .limit(1);
        if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
        let receipt;
        try {
          receipt = await purchaseCoreCoinLand(
            input.launchToken,
            landId,
            input.requestId,
          );
        } catch (error) {
          if (error instanceof CoreCoinLandError && error.definitive) {
            await walletJournalDb
              .update(farmV2MutationTable)
              .set({
                transactionState: "REJECTED",
                failureCode: error.message,
                updatedAt: new Date(),
              })
              .where(where);
            throw new FarmWalletRejectedError(error.message);
          }
          throw error;
        }
        await walletJournalDb
          .update(farmV2MutationTable)
          .set({
            transactionState: "WALLET_APPLIED",
            walletTransaction: receipt,
            updatedAt: new Date(),
          })
          .where(where);
        return applyProjection(tx);
      },
    });
  } catch (error) {
    if (
      inserted.length &&
      error instanceof Error &&
      [
        "FARM_PLAYER_STATE_NOT_FOUND",
        "FARM_V2_PREVIOUS_MUTATION_UNCONFIRMED",
      ].includes(error.message)
    ) {
      await walletJournalDb
        .update(farmV2MutationTable)
        .set({
          transactionState: "REJECTED",
          failureCode: error.message,
          updatedAt: new Date(),
        })
        .where(and(where, eq(farmV2MutationTable.transactionState, "PENDING")));
      throw new FarmWalletRejectedError(error.message);
    }
    throw error;
  }
}
