import { assertFarmAuthorityFence } from "./farm-v2-authority-context";
import { and, eq, sql } from "drizzle-orm";
import { db, farmV2MutationTable, farmV2PlayerStateTable } from "@workspace/db";
import { journalDb } from "./farm-v2-wallet-saga";

export async function runFarmV2IdempotentMutation<T>(input: {
  requestId: string;
  userId: string;
  action: string;
  participantUserIds?: string[];
  execute: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<T>;
  /** For Core-derived state reconciliation only: refresh a completed request. */
  refreshCompleted?: boolean;
  recover?: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<T>;
  isPermanentRecoveryError?: (error: unknown) => boolean;
  /** Persist the wallet reservation before crossing the Core network boundary. */
  durableWallet?: boolean;
}): Promise<T> {
  if (!/^[A-Za-z0-9._:-]{1,120}$/.test(input.requestId))
    throw new Error("REQUEST_ID_REQUIRED");
  if (!input.userId.trim()) throw new Error("ACTOR_UID_REQUIRED");

  if (input.durableWallet) {
    await db
      .insert(farmV2MutationTable)
      .values({
        requestId: input.requestId,
        userId: input.userId,
        action: input.action,
        response: null,
      })
      .onConflictDoNothing();
  }

  const ownerIds = [
    ...new Set([input.userId, ...(input.participantUserIds ?? [])]),
  ].sort();
  return db.transaction(async (tx) => {
    await assertFarmAuthorityFence(tx);
    // Serialize retries for the same user/request pair before probing the
    // mutation table. This closes the concurrent first-request race without
    // serializing unrelated Farm V2 mutations.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.userId + ":" + input.requestId}, 0))`,
    );

    // Reserve workshop inputs across a lost Core response. Every mutation locks
    // the owner first, so another operation cannot consume reserved assets.
    for (const ownerId of ownerIds) {
      await tx
        .select({ userId: farmV2PlayerStateTable.userId })
        .from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, ownerId))
        .for("update");
      const reservations = await tx.execute(
        sql`SELECT 1 FROM farm_v2_mutation WHERE user_id=${ownerId} AND NOT(user_id=${input.userId} AND request_id=${input.requestId}) AND transaction_state IN ('PENDING','WALLET_PENDING','WALLET_APPLIED','COMPENSATING') AND wallet_transaction->'assetPlan' IS NOT NULL LIMIT 1`,
      );
      if (reservations.rows.length)
        throw new Error("WORKSHOP_RECOVERY_REQUIRED");
    }

    const [existing] = await tx
      .select()
      .from(farmV2MutationTable)
      .where(
        and(
          eq(farmV2MutationTable.requestId, input.requestId),
          eq(farmV2MutationTable.userId, input.userId),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.action !== input.action)
        throw new Error("REQUEST_ID_ACTION_MISMATCH");
      if (existing.transactionState === "COMPENSATED")
        throw new Error("FARM_MUTATION_COMPENSATED");
      if (existing.transactionState === "COMPENSATING")
        throw new Error("PERMANENT_MUTATION_RECOVERY_FAILURE");
      if (existing.response === null) {
        if (
          existing.transactionState === "WALLET_APPLIED" ||
          existing.transactionState === "WALLET_PENDING"
        ) {
          if (!input.recover) throw new Error("MUTATION_RECOVERY_REQUIRED");
          let recovered: T;
          try {
            recovered = await input.recover(tx);
          } catch (error) {
            if (input.isPermanentRecoveryError?.(error)) {
              // Durable marker prevents another retry from finalizing assets
              // while the post-rollback compensation is in flight.
              await journalDb
                .update(farmV2MutationTable)
                .set({
                  transactionState: "COMPENSATING",
                  updatedAt: new Date(),
                })
                .where(
                  and(
                    eq(farmV2MutationTable.userId, input.userId),
                    eq(farmV2MutationTable.requestId, input.requestId),
                  ),
                );
              throw new Error("PERMANENT_MUTATION_RECOVERY_FAILURE");
            }
            throw error;
          }
          await tx
            .update(farmV2MutationTable)
            .set({
              response: recovered as object,
              transactionState: "COMPLETED",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(farmV2MutationTable.requestId, input.requestId),
                eq(farmV2MutationTable.userId, input.userId),
              ),
            );
          return recovered;
        }
        if (!input.durableWallet || existing.transactionState !== "PENDING")
          throw new Error("MUTATION_IN_PROGRESS");
      } else {
        if (input.refreshCompleted) {
          const refreshed = await input.execute(tx);
          await tx
            .update(farmV2MutationTable)
            .set({ response: refreshed as object, updatedAt: new Date() })
            .where(
              and(
                eq(farmV2MutationTable.requestId, input.requestId),
                eq(farmV2MutationTable.userId, input.userId),
              ),
            );
          return refreshed;
        }
        return existing.response as T;
      }
    }

    if (!existing)
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
      .set({
        response: response as object,
        transactionState: "COMPLETED",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(farmV2MutationTable.requestId, input.requestId),
          eq(farmV2MutationTable.userId, input.userId),
        ),
      );

    return response;
  });
}
