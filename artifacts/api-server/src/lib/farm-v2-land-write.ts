import { and, eq } from "drizzle-orm";
import { db, farmV2LandTable } from "@workspace/db";

export async function updateLockedFarmV2Land(input: {
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0];
  userId: string;
  landId: number;
  expectedVersion: number;
  lifecycle: string;
  accessActive: boolean;
  plantedQuantity: number;
  plantedAt: Date | null;
  maturesAt: Date | null;
}): Promise<number> {
  const updated = await input.tx
    .update(farmV2LandTable)
    .set({
      lifecycle: input.lifecycle,
      accessActive: input.accessActive,
      plantedQuantity: input.plantedQuantity,
      plantedAt: input.plantedAt,
      maturesAt: input.maturesAt,
      version: input.expectedVersion + 1,
    })
    .where(and(
      eq(farmV2LandTable.userId, input.userId),
      eq(farmV2LandTable.landId, input.landId),
      eq(farmV2LandTable.version, input.expectedVersion),
    ))
    .returning({ version: farmV2LandTable.version });

  if (updated.length !== 1) throw new Error("FARM_LAND_CONCURRENT_MODIFICATION");
  return updated[0].version;
}
