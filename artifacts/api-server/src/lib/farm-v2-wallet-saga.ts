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
