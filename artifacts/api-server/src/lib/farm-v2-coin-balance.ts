import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * Authoritative coin balance for Farm V2 purchases.
 *
 * Farm coin debits run through `farm_v2_apply_authorized_wallet_transaction`,
 * which reads and writes `core_wallets.coin_balance` inside its own
 * transaction. Reading the same row here makes the pre-check agree with the
 * authoritative balance, so a short balance is refused before a mutation row
 * exists. Returns null when the wallet row is missing.
 */
export async function readFarmV2CoinBalance(
  userId: string,
): Promise<number | null> {
  const result = await db.execute(
    sql`select coin_balance from public.core_wallets where owner_id = ${userId} limit 1`,
  );
  const rows = ((result as unknown as { rows?: unknown[] }).rows ?? result) as {
    coin_balance?: number | string;
  }[];
  const value = rows[0]?.coin_balance;
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? Number(value) : value;
}
