/**
 * Operator view of transaction health. Read-only, and behind an operator key:
 * a player never sees another player's transaction internals.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import type { FarmV2HealthRow } from "./farm-v2-transaction-health.policy";
export {
  farmV2OperatorKeyMatches,
  isFarmV2Fault,
  type FarmV2HealthRow,
} from "./farm-v2-transaction-health.policy";

export async function readFarmV2TransactionHealth(input: {
  since: Date;
  limit?: number;
}) {
  const { rows } = await db.execute(sql`
    SELECT * FROM public.farm_v2_transaction_health(
      ${input.since.toISOString()}::timestamptz, ${input.limit ?? 200}::integer)
  `);
  const all = rows as FarmV2HealthRow[];
  return {
    rows: all,
    counts: {
      total: all.length,
      normal: all.filter((row) => row.severity === "NORMAL").length,
      pending: all.filter((row) => row.severity === "PENDING").length,
      minor: all.filter((row) => row.severity === "MINOR").length,
      major: all.filter((row) => row.severity === "MAJOR").length,
    },
  };
}

