import { pool } from "@workspace/db";
import { bankError, localCoinsEnabled } from "./farm-v2-local-coins";

/**
 * Reads both wallets for one identity. The Central (core) balance is the
 * authoritative ledger and is always readable; the Farm (local) balance is a
 * separate ledger that only exists once local coins are enabled. Returning the
 * Central balance even when the Farm ledger is disabled keeps the wallet view
 * from being stuck on a placeholder.
 */
export async function readFarmCoinBalances(userId: string) {
  if (!localCoinsEnabled()) {
    const central = await pool.query(
      "select coalesce((select coin_balance from public.core_wallets where owner_id=$1::uuid),0) as central",
      [userId],
    );
    const centralCoins = Number(central.rows[0]?.central ?? 0);
    if (!Number.isSafeInteger(centralCoins) || centralCoins < 0)
      throw new Error("FARM_CENTRAL_BALANCE_UNAVAILABLE");
    return { coins: 0, centralCoins, localCoinsEnabled: false };
  }
  try {
    const r = await pool.query(
      "select farm_v2_bank.read_balances($1::uuid) as result",
      [userId],
    );
    const balances: unknown = r.rows[0]?.result;
    if (
      !balances ||
      typeof balances !== "object" ||
      !("coins" in balances) ||
      !Number.isSafeInteger(balances.coins) ||
      (balances.coins as number) < 0 ||
      !("centralCoins" in balances) ||
      !Number.isSafeInteger(balances.centralCoins) ||
      (balances.centralCoins as number) < 0 ||
      !("localCoinsEnabled" in balances) ||
      balances.localCoinsEnabled !== true
    ) {
      throw new Error("FARM_WALLET_INVALID_BALANCES");
    }
    return balances as {
      coins: number;
      centralCoins: number;
      localCoinsEnabled: boolean;
    };
  } catch (error) {
    return bankError(error);
  }
}
export async function transferFarmCoins(
  userId: string,
  requestId: string,
  direction: unknown,
  amount: unknown,
) {
  if (!localCoinsEnabled()) throw new Error("FARM_LOCAL_COINS_NOT_ENABLED");
  if (
    !/^[A-Za-z0-9._:-]{1,120}$/.test(requestId) ||
    !["in", "out"].includes(String(direction)) ||
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    amount > 2147483647
  )
    throw new Error("INVALID_FARM_TRANSFER");
  try {
    const r = await pool.query(
      "select farm_v2_bank.transfer($1::uuid,$2,$3,$4::integer) as result",
      [userId, requestId, direction, amount],
    );
    return r.rows[0].result;
  } catch (error) {
    return bankError(error);
  }
}
