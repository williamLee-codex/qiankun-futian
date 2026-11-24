import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * The two coin wallets are separate assets and must never be collapsed:
 * - central coin: `public.core_wallets.coin_balance` (Core authority)
 * - farm coin:    `farm_v2_bank.wallets.balance` (Farm bank, immutable ledger)
 * - crystals:     `public.core_wallets.crystal_balance`
 *
 * Every read is keyed by the owning player; there is no fallback row.
 */
export type CoinWallet = "core" | "farm";

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  const result = await db.execute(query);
  return ((result as unknown as { rows?: unknown[] }).rows ?? result) as T[];
}

export async function readCoreCoinBalance(userId: string): Promise<number | null> {
  const found = await rows<{ coin_balance: number | string | null }>(
    sql`select coin_balance from public.core_wallets where owner_id = ${userId} limit 1`,
  );
  const value = found[0]?.coin_balance;
  return value == null ? null : Number(value);
}

export async function readCrystalBalance(userId: string): Promise<number | null> {
  const found = await rows<{ crystal_balance: number | string | null }>(
    sql`select crystal_balance from public.core_wallets where owner_id = ${userId} limit 1`,
  );
  const value = found[0]?.crystal_balance;
  return value == null ? null : Number(value);
}

export async function readFarmCoinBalance(userId: string): Promise<number | null> {
  const found = await rows<{ balance: number | string | null }>(
    sql`select balance from farm_v2_bank.wallets where user_id = ${userId}::uuid limit 1`,
  );
  const value = found[0]?.balance;
  return value == null ? null : Number(value);
}

/** Balance of the wallet that will actually be debited for a farm purchase. */
export async function readPurchaseWalletBalance(
  userId: string,
  wallet: CoinWallet,
): Promise<number | null> {
  return wallet === "farm"
    ? readFarmCoinBalance(userId)
    : readCoreCoinBalance(userId);
}
