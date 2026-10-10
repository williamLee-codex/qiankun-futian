import { and, eq, sql } from "drizzle-orm";
import {
  db,
  createDatabaseConnection,
  farmV2MutationTable,
} from "@workspace/db";
import {
  mutateFarmV2Wallet,
  type FarmWalletMutationInput,
  type FarmWalletMutationResult,
} from "./farm-v2-wallet-client";

type WalletCommand = Omit<FarmWalletMutationInput, "launchToken">;
type WalletJournal = {
  assetPlan?: unknown;
  command: WalletCommand;
  result?: FarmWalletMutationResult;
  compensation?: FarmWalletMutationResult;
};
// A transaction holding the request/player lock must always be able to write
// its durable journal, even when all gameplay pool connections wait for locks.
export const { pool: farmV2WalletJournalPool, db: journalDb } =
  createDatabaseConnection({
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
    allowExitOnIdle: true,
  });
const mutationWhere = (userId: string, requestId: string) =>
  and(
    eq(farmV2MutationTable.userId, userId),
    eq(farmV2MutationTable.requestId, requestId),
  );

export async function readFarmV2WalletIntent(
  userId: string,
  requestId: string,
): Promise<WalletCommand> {
  const existing = await journalDb.query.farmV2MutationTable.findFirst({
    where: mutationWhere(userId, requestId),
  });
  const journal = existing?.walletTransaction as WalletJournal | null;
  if (!journal?.command) throw new Error("FARM_WALLET_INTENT_MISSING");
  return journal.command;
}

export async function applyFarmV2WalletStep(
  input: FarmWalletMutationInput,
): Promise<FarmWalletMutationResult> {
  const existing = await journalDb.query.farmV2MutationTable.findFirst({
    where: mutationWhere(input.userId, input.requestId),
  });
  if (!existing) throw new Error("FARM_MUTATION_NOT_FOUND");
  if (["COMPENSATING", "COMPENSATED"].includes(existing.transactionState))
    throw new Error("FARM_MUTATION_COMPENSATED");
  const { launchToken, ...command } = input;
  const journal = existing.walletTransaction as WalletJournal | null;
  if (
    journal?.command &&
    JSON.stringify(journal.command) !== JSON.stringify(command)
  ) {
    // Compare fields rather than relying on JSON property order after jsonb.
    if (
      Object.keys(command).some(
        (key) =>
          command[key as keyof WalletCommand] !==
          journal.command[key as keyof WalletCommand],
      )
    ) {
      throw new Error("FARM_WALLET_INTENT_MISMATCH");
    }
  }
  if (
    journal?.result &&
    ["WALLET_APPLIED", "COMPLETED"].includes(existing.transactionState)
  )
    return journal.result;
  // Persist intent before the request. If Core commits but its response is lost,
  // retries repeat this exact operation/key, never recalculate the reward.
  await journalDb
    .update(farmV2MutationTable)
    .set({
      transactionState: "WALLET_PENDING",
      walletDirection: input.direction,
      walletCurrency: input.currency,
      walletAmount: input.amount,
      walletTransaction: { ...journal, command },
      updatedAt: new Date(),
    })
    .where(mutationWhere(input.userId, input.requestId));
  const result = await mutateFarmV2Wallet(input);
  await journalDb
    .update(farmV2MutationTable)
    .set({
      transactionState: "WALLET_APPLIED",
      walletTransaction: { ...journal, command, result },
      failureCode: null,
      updatedAt: new Date(),
    })
    .where(mutationWhere(input.userId, input.requestId));
  return result;
}

export async function compensateFarmV2WalletStep(input: {
  userId: string;
  requestId: string;
  launchToken: string;
}): Promise<FarmWalletMutationResult> {
  return db.transaction(async (tx) => {
    // Same lock as normal retries: compensation must never race finalization.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.userId + ":" + input.requestId}, 0))`,
    );
    const [existing] = await tx
      .select()
      .from(farmV2MutationTable)
      .where(mutationWhere(input.userId, input.requestId))
      .limit(1);
    if (!existing) throw new Error("FARM_MUTATION_NOT_FOUND");
    const journal = existing.walletTransaction as WalletJournal | null;
    if (existing.transactionState === "COMPENSATED" && journal?.compensation)
      return journal.compensation;
    if (existing.transactionState === "COMPLETED")
      throw new Error("COMPLETED_MUTATION_CANNOT_BE_COMPENSATED");
    if (
      existing.transactionState !== "COMPENSATING" ||
      !journal?.result ||
      !journal.command
    )
      throw new Error("WALLET_EFFECT_NOT_APPLIED");
    const original = journal.result.transaction;
    const result = await mutateFarmV2Wallet({
      userId: input.userId,
      requestId: input.requestId,
      idempotencySuffix: "compensation",
      amount: original.amount,
      currency: journal.command.currency,
      direction: original.direction === "debit" ? "credit" : "debit",
      launchToken: input.launchToken,
      reason: "farm_wallet_compensation",
      referenceId: input.requestId,
      referenceType: "farm_wallet_compensation",
      originalTransactionId: original.id,
    });
    await tx
      .update(farmV2MutationTable)
      .set({
        transactionState: "COMPENSATED",
        walletTransaction: { ...journal, compensation: result },
        failureCode: "FARM_EFFECT_NOT_APPLIED",
        updatedAt: new Date(),
      })
      .where(mutationWhere(input.userId, input.requestId));
    return result;
  });
}

const PERMANENT_FARM_RECOVERY_CODES = new Set([
  "WORKSHOP_RESERVATION_CHANGED",
  "FARM_PLAYER_STATE_NOT_FOUND",
  "INVALID_FARM_LAND_ID",
  "INVALID_EXCHANGE_QUANTITY",
  "INSUFFICIENT_CROPS_FOR_EXCHANGE",
  "SEED_NOT_PURCHASABLE",
]);

export function isPermanentFarmV2RecoveryError(error: unknown): boolean {
  return (
    error instanceof Error && PERMANENT_FARM_RECOVERY_CODES.has(error.message)
  );
}

export async function runFarmV2RecoveryWithPostRollbackCompensation<T>(input: {
  userId: string;
  requestId: string;
  launchToken: string;
  recover: () => Promise<T>;
}): Promise<T> {
  try {
    return await input.recover();
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "PERMANENT_MUTATION_RECOVERY_FAILURE"
    ) {
      throw error;
    }
    // Recovery transaction has already rolled back before compensation starts.
    await compensateFarmV2WalletStep({
      userId: input.userId,
      requestId: input.requestId,
      launchToken: input.launchToken,
    });
    throw new Error("FARM_MUTATION_COMPENSATED");
  }
}
