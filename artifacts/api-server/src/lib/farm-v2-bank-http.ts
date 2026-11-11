import { pool } from "@workspace/db";
import { bankError, localCoinsEnabled } from "./farm-v2-local-coins";
export async function readFarmCoinBalances(userId: string) {
  if (!localCoinsEnabled()) throw new Error("FARM_LOCAL_COINS_NOT_ENABLED");
  const r = await pool.query(
    "select farm_v2_bank.read_balances($1::uuid) as result",
    [userId],
  );
  return r.rows[0].result as {
    coins: number;
    centralCoins: number;
    localCoinsEnabled: true;
  };
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
