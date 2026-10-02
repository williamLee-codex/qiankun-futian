import { and, eq } from "drizzle-orm";
import { db, farmV2MutationTable } from "@workspace/db";

export async function runFarmV2IdempotentMutation<T>(input: {
  requestId: string;
  userId: string;
  action: string;
  execute: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>;
}): Promise<T> {
  if (!input.requestId.trim()) throw new Error("REQUEST_ID_REQUIRED");
  if (!input.userId.trim()) throw new Error("ACTOR_UID_REQUIRED");

  return db.transaction(async (tx) => {
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
      if (existing.response === null) throw new Error("MUTATION_IN_PROGRESS");
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
      .set({ response: response as object })
      .where(and(
        eq(farmV2MutationTable.requestId, input.requestId),
        eq(farmV2MutationTable.userId, input.userId),
      ));

    return response;
  });
}
