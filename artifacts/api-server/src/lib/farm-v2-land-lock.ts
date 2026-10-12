import { and, eq, sql } from "drizzle-orm";
import { db, farmV2LandTable } from "@workspace/db";

export async function withLockedFarmV2Land<T>(input: {
  userId: string;
  landId: number;
  execute: (land: typeof farmV2LandTable.$inferSelect) => Promise<T>;
}): Promise<T> {
  return db.transaction(async (tx) => {
    const [land] = await tx
      .select()
      .from(farmV2LandTable)
      .where(
        and(
          eq(farmV2LandTable.userId, input.userId),
          eq(farmV2LandTable.landId, input.landId),
        ),
      )
      .for("update")
      .limit(1);
    if (!land) throw new Error("FARM_LAND_NOT_FOUND");
    return input.execute(land);
  });
}

export async function bumpFarmV2LandVersion(input: {
  userId: string;
  landId: number;
  expectedVersion: number;
}): Promise<void> {
  const updated = await db
    .update(farmV2LandTable)
    .set({ version: input.expectedVersion + 1 })
    .where(
      and(
        eq(farmV2LandTable.userId, input.userId),
        eq(farmV2LandTable.landId, input.landId),
        eq(farmV2LandTable.version, input.expectedVersion),
      ),
    )
    .returning({ version: farmV2LandTable.version });
  if (updated.length !== 1)
    throw new Error("FARM_LAND_CONCURRENT_MODIFICATION");
}
