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
    const rows = await tx.execute(sql`select * from farm_v2_player_state where user_id = ${input.userId} for update`);
    const state = rows.rows[0] as typeof farmV2PlayerStateTable.$inferSelect | undefined;
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
