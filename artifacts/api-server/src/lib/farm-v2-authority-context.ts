import { AsyncLocalStorage } from "node:async_hooks";
import { sql } from "drizzle-orm";
import type { db } from "@workspace/db";
export const farmAuthorityContext = new AsyncLocalStorage<{
  operationId: string;
  userId: string;
  qualification: number;
  targetQualification?: number;
  participants?: { operationId: string; userId: string }[];
}>();
export async function assertFarmAuthorityFence(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
) {
  const authority = farmAuthorityContext.getStore();
  if (!authority) return; // Trusted internal functions; HTTP routes always establish a context.
  for (const participant of authority.participants ?? [authority]) {
    const result = await tx.execute(
      sql`select state from farm_v2_authorization_attempt where id=${participant.operationId}::uuid and user_id=${participant.userId} for share`,
    );
    if (result.rows[0]?.state !== "OPEN")
      throw new Error("FARM_AUTHORIZATION_FENCED");
  }
}
