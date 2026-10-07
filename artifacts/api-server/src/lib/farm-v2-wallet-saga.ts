import { and, eq } from "drizzle-orm";
import { db, farmV2MutationTable } from "@workspace/db";
import { mutateFarmV2Wallet, type FarmWalletMutationInput, type FarmWalletMutationResult } from "./farm-v2-wallet-client";

export async function applyFarmV2WalletStep(
  input: FarmWalletMutationInput & { userId: string },
): Promise<FarmWalletMutationResult> {
  const existing = await db.query.farmV2MutationTable.findFirst({
    where: and(
      eq(farmV2MutationTable.userId, input.userId),
      eq(farmV2MutationTable.requestId, input.requestId),
    ),
  });
  if (!existing) throw new Error("FARM_MUTATION_NOT_FOUND");

  if (existing.transactionState === "WALLET_APPLIED" && existing.walletTransaction) {
    return existing.walletTransaction as FarmWalletMutationResult;
  }
  if (existing.transactionState === "COMPLETED" && existing.walletTransaction) {
    return existing.walletTransaction as FarmWalletMutationResult;
  }

  const result = await mutateFarmV2Wallet(input);
  await db.update(farmV2MutationTable).set({
    transactionState: "WALLET_APPLIED",
    walletDirection: input.direction,
    walletCurrency: input.currency,
    walletAmount: input.amount,
    walletTransaction: result as object,
    failureCode: null,
    updatedAt: new Date(),
  }).where(and(
    eq(farmV2MutationTable.userId, input.userId),
    eq(farmV2MutationTable.requestId, input.requestId),
  ));
  return result;
}


export async function compensateFarmV2WalletStep(input: {
  userId: string;
  requestId: string;
  launchToken: string;
}): Promise<FarmWalletMutationResult> {
  const existing = await db.query.farmV2MutationTable.findFirst({
    where: and(
      eq(farmV2MutationTable.userId, input.userId),
      eq(farmV2MutationTable.requestId, input.requestId),
    ),
  });
  if (!existing) throw new Error("FARM_MUTATION_NOT_FOUND");
  if (existing.transactionState === "COMPLETED") throw new Error("COMPLETED_MUTATION_CANNOT_BE_COMPENSATED");
  if (!existing.walletDirection || !existing.walletCurrency || !existing.walletAmount) {
    throw new Error("WALLET_EFFECT_NOT_APPLIED");
  }

  const direction = existing.walletDirection === "debit" ? "credit" : "debit";
  const result = await mutateFarmV2Wallet({
    requestId: input.requestId,
    idempotencySuffix: "compensation",
    amount: existing.walletAmount,
    currency: existing.walletCurrency as "coin" | "crystal",
    direction,
    launchToken: input.launchToken,
    reason: "farm_wallet_compensation",
    referenceId: input.requestId,
    referenceType: "farm_wallet_compensation",
  });

  await db.update(farmV2MutationTable).set({
    transactionState: "COMPENSATED",
    failureCode: "FARM_EFFECT_NOT_APPLIED",
    updatedAt: new Date(),
  }).where(and(
    eq(farmV2MutationTable.userId, input.userId),
    eq(farmV2MutationTable.requestId, input.requestId),
  ));
  return result;
}


export async function recoverOrCompensateFarmV2WalletMutation<T>(input: {
  userId: string;
  requestId: string;
  launchToken: string;
  recover: () => Promise<T>;
  isPermanentRecoveryError?: (error: unknown) => boolean;
}): Promise<T> {
  try {
    return await input.recover();
  } catch (error) {
    if (!input.isPermanentRecoveryError?.(error)) throw error;
    await compensateFarmV2WalletStep({
      userId: input.userId,
      requestId: input.requestId,
      launchToken: input.launchToken,
    });
    throw new Error("FARM_MUTATION_COMPENSATED");
  }
}


const PERMANENT_FARM_RECOVERY_CODES = new Set([
  "FARM_PLAYER_STATE_NOT_FOUND",
  "INVALID_FARM_LAND_ID",
  "INVALID_EXCHANGE_QUANTITY",
  "INSUFFICIENT_CROPS_FOR_EXCHANGE",
  "SEED_NOT_PURCHASABLE",
]);

export function isPermanentFarmV2RecoveryError(error: unknown): boolean {
  return error instanceof Error && PERMANENT_FARM_RECOVERY_CODES.has(error.message);
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
    if (!(error instanceof Error) || error.message !== "PERMANENT_MUTATION_RECOVERY_FAILURE") {
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
