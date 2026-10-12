import { and, eq, ne, isNotNull, notInArray, sql } from "drizzle-orm";
import { db, farmV2MutationTable } from "@workspace/db";
import { FarmWalletRejectedError } from "./farm-v2-wallet-client";

export async function runFarmV2IdempotentMutation<T>(input: {
  requestId: string;
  userId: string;
  action: string;
  execute: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<T>;
  /** For Core-derived state reconciliation only: refresh a completed request. */
  refreshCompleted?: boolean;
  /** Wallet intent must be committed before a second connection can read it. */
  walletReservation?: boolean;
  recover?: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  ) => Promise<T>;
  isPermanentRecoveryError?: (error: unknown) => boolean;
}): Promise<T> {
  if (!input.requestId.trim()) throw new Error("REQUEST_ID_REQUIRED");
  if (!input.userId.trim()) throw new Error("ACTOR_UID_REQUIRED");

  if (input.walletReservation) {
    await db
      .insert(farmV2MutationTable)
      .values({
        userId: input.userId,
        requestId: input.requestId,
        action: input.action,
        response: null,
      })
      .onConflictDoNothing();
  }

  return db
    .transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.userId + ":farm-v2-write"}, 0))`,
      );
      // Serialize retries for the same user/request pair before probing the
      // mutation table. This closes the concurrent first-request race without
      // serializing unrelated Farm V2 mutations.
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${input.userId + ":" + input.requestId}, 0))`,
      );

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

      if (!input.refreshCompleted) {
        const [outstanding] = await tx
          .select()
          .from(farmV2MutationTable)
          .where(
            and(
              eq(farmV2MutationTable.userId, input.userId),
              ne(farmV2MutationTable.requestId, input.requestId),
              isNotNull(farmV2MutationTable.walletDirection),
              notInArray(farmV2MutationTable.transactionState, [
                "COMPLETED",
                "REJECTED",
                "COMPENSATED",
              ]),
            ),
          )
          .limit(1);
        if (outstanding)
          throw new Error("FARM_V2_PREVIOUS_MUTATION_UNCONFIRMED");
      }
      if (existing) {
        if (existing.action !== input.action)
          throw new Error("REQUEST_ID_ACTION_MISMATCH");
        if (existing.transactionState === "COMPENSATED")
          throw new Error("FARM_MUTATION_COMPENSATED");
        if (existing.transactionState === "COMPENSATING")
          throw new Error("PERMANENT_MUTATION_RECOVERY_FAILURE");
        if (existing.transactionState === "REJECTED")
          throw new FarmWalletRejectedError(
            existing.failureCode ?? "FARM_WALLET_REJECTED",
          );
        if (existing.response === null) {
          if (existing.transactionState === "WALLET_APPLIED") {
            if (!input.recover) throw new Error("MUTATION_RECOVERY_REQUIRED");
            let recovered: T;
            try {
              recovered = await input.recover(tx);
            } catch (error) {
              if (input.isPermanentRecoveryError?.(error))
                throw new Error("PERMANENT_MUTATION_RECOVERY_FAILURE");
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
          if (
            !input.walletReservation ||
            existing.transactionState !== "PENDING"
          )
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
      } else {
        await tx.insert(farmV2MutationTable).values({
          requestId: input.requestId,
          userId: input.userId,
          action: input.action,
          response: null,
        });
      }

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
    })
    .catch(async (error) => {
      // A domain preflight failure before any durable wallet intent proves
      // this reservation never contacted Core. It must not trap future play.
      if (
        input.walletReservation &&
        error instanceof Error &&
        [
          "FARM_PLAYER_STATE_NOT_FOUND",
          "INSUFFICIENT_CROPS_FOR_EXCHANGE",
          "FARM_V2_PREVIOUS_MUTATION_UNCONFIRMED",
        ].includes(error.message)
      ) {
        const rejected = await db.transaction(async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${input.userId + ":farm-v2-write"}, 0))`,
          );
          const changed = await tx
            .update(farmV2MutationTable)
            .set({ transactionState: "REJECTED", failureCode: error.message })
            .where(
              and(
                eq(farmV2MutationTable.userId, input.userId),
                eq(farmV2MutationTable.requestId, input.requestId),
                eq(farmV2MutationTable.action, input.action),
                eq(farmV2MutationTable.transactionState, "PENDING"),
                sql`${farmV2MutationTable.walletDirection} is null`,
              ),
            )
            .returning({ requestId: farmV2MutationTable.requestId });
          return changed.length === 1;
        });
        if (rejected) throw new FarmWalletRejectedError(error.message);
      }
      throw error;
    });
}
