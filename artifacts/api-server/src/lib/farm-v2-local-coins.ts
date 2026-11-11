import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import type { db } from "@workspace/db";
import type {
  FarmWalletMutationInput,
  FarmWalletMutationResult,
} from "./farm-v2-wallet-client";
export type FarmTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const localCoinTransaction = new AsyncLocalStorage<FarmTx>();
export const localCoinsEnabled = () =>
  process.env.FARM_V2_LOCAL_COINS_ENABLED === "1";
export function bankError(error: unknown): never {
  let cause: unknown = error;
  for (let i = 0; i < 5 && cause && typeof cause === "object"; i++) {
    const e = cause as { code?: string; message?: string; cause?: unknown };
    if (e.code === "P0001" && e.message) throw new Error(e.message);
    cause = e.cause;
  }
  throw error;
}
export async function postLocalCoin(
  tx: FarmTx,
  input: FarmWalletMutationInput,
): Promise<FarmWalletMutationResult> {
  if (input.currency !== "coin" || input.idempotencySuffix || input.originalTransactionId) throw new Error("INVALID_FARM_WALLET_OPERATION");
  try {
    const r = await tx.execute(
      sql`select farm_v2_bank.post_coin(${input.userId}::uuid,${input.requestId},${input.amount}::integer,${input.direction},${input.reason},${input.referenceId}) as result`,
    );
    const value = r.rows[0]?.result as { id: string; duplicate: boolean };
    return {
      duplicate: value.duplicate,
      transaction: {
        id: value.id,
        ownerId: input.userId,
        amount: input.amount,
        currency: "coin",
        direction: input.direction,
        reason: input.reason,
        referenceId: input.referenceId,
        referenceType: input.referenceType,
        idempotencyKey: `farm-v2:${input.requestId}:primary`,
        reversalOf: null,
        walletId: `farm:${input.userId}`,
      },
      wallet: { id: `farm:${input.userId}`, ownerId: input.userId },
    };
  } catch (error) {
    return bankError(error);
  }
}
