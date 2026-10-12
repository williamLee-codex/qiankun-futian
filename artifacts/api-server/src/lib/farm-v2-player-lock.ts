import { eq, sql } from "drizzle-orm";
import { db, farmV2PlayerStateTable } from "@workspace/db";

export async function withLockedFarmV2PlayerState<T>(input: {
  userId: string;
  execute: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    state: typeof farmV2PlayerStateTable.$inferSelect,
  ) => Promise<T>;
}): Promise<T> {
  return db.transaction(async (tx) => {
    const [state] = await tx
      .select()
      .from(farmV2PlayerStateTable)
      .where(eq(farmV2PlayerStateTable.userId, input.userId))
      .for("update")
      .limit(1);
    if (!state) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
    return input.execute(tx, state);
  });
}

export async function touchFarmV2PlayerState(userId: string): Promise<void> {
  await db
    .update(farmV2PlayerStateTable)
    .set({ updatedAt: new Date() })
    .where(eq(farmV2PlayerStateTable.userId, userId));
}
