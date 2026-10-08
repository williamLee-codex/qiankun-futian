import { and, eq, sql } from "drizzle-orm";
import { db, farmV2MutationTable } from "@workspace/db";

export async function runFarmV2IdempotentMutation<T>(input: {
  requestId: string;
  userId: string;
  action: string;
  execute: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>;
  /** For Core-derived state reconciliation only: refresh a completed request. */
  refreshCompleted?: boolean;
  recover?: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>;
  isPermanentRecoveryError?: (error: unknown) => boolean;
}): Promise<T> {
  if (!input.requestId.trim()) throw new Error("REQUEST_ID_REQUIRED");
  if (!input.userId.trim()) throw new Error("ACTOR_UID_REQUIRED");

  return db.transaction(async (tx) => {
    // Serialize retries for the same user/request pair before probing the
    // mutation table. This closes the concurrent first-request race without
    // serializing unrelated Farm V2 mutations.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId + ":" + input.requestId}, 0))`);

    const [existing] = await tx
      .select()
      .from(farmV2MutationTable)
      .where(and(
        eq(farmV2MutationTable.requestId, input.requestId),
        eq(farmV2MutationTable.userId, input.userId),
      ))
      .limit(1);

    if (existing) {
      if (existing.action !== input.action) throw new Error("REQUEST_ID_ACTION_MISMATCH");
      if (existing.response === null) {
        if (existing.transactionState === "WALLET_APPLIED") {
          if (!input.recover) throw new Error("MUTATION_RECOVERY_REQUIRED");
          let recovered: T;
          try {
            recovered = await input.recover(tx);
          } catch (error) {
            if (input.isPermanentRecoveryError?.(error)) throw new Error("PERMANENT_MUTATION_RECOVERY_FAILURE");
            throw error;
          }
          await tx.update(farmV2MutationTable)
            .set({ response: recovered as object, transactionState: "COMPLETED", updatedAt: new Date() })
            .where(and(
              eq(farmV2MutationTable.requestId, input.requestId),
              eq(farmV2MutationTable.userId, input.userId),
            ));
          return recovered;
        }
        throw new Error("MUTATION_IN_PROGRESS");
      }
      if (input.refreshCompleted) {
        const refreshed = await input.execute(tx);
        await tx.update(farmV2MutationTable)
          .set({ response: refreshed as object, updatedAt: new Date() })
          .where(and(
            eq(farmV2MutationTable.requestId, input.requestId),
            eq(farmV2MutationTable.userId, input.userId),
          ));
        return refreshed;
      }
      return existing.response as T;
    }

    await tx.insert(farmV2MutationTable).values({
      requestId: input.requestId,
      userId: input.userId,
      action: input.action,
      response: null,
    });

    // The domain mutation must use this same transaction. If it fails, the
    // idempotency reservation rolls back with the state mutation.
    const response = await input.execute(tx);

    await tx
      .update(farmV2MutationTable)
      .set({ response: response as object, transactionState: "COMPLETED", updatedAt: new Date() })
      .where(and(
        eq(farmV2MutationTable.requestId, input.requestId),
        eq(farmV2MutationTable.userId, input.userId),
      ));

    return response;
  });
}
