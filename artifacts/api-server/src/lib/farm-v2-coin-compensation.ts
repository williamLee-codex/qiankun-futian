/**
 * Coin grace compensation, the 50% policy of the transaction safety core.
 *
 * A coin charge is refunded in full when the server cannot prove the goods were
 * delivered: a confirmed charge with no delivery, or a charge whose outcome is
 * unknown because the response never arrived. Crystals and real money are never
 * eligible, and nothing here invents an amount: it always comes from the
 * journal the server wrote before it called the wallet.
 */
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  farmV2CoinCompensationTable,
  farmV2MutationTable,
} from "@workspace/db";
import {
  decideFarmV2CoinCompensation,
  type CoinWalletScope,
} from "./farm-v2-coin-compensation.policy";

export {
  decideFarmV2CoinCompensation,
  type CoinCompensationDecision,
  type CoinWalletScope,
} from "./farm-v2-coin-compensation.policy";

export type CoinCompensationOutcome =
  | { status: "not_due"; reason: string }
  | { status: "posted"; ledgerId: string; grace: boolean; amount: number }
  | { status: "duplicate"; ledgerId: string | null; amount: number }
  | { status: "in_progress" }
  | { status: "failed"; code: string };

/**
 * Post the compensation once. The claim row is the mutual exclusion: a second
 * caller reads the first caller's row instead of crediting again, and the
 * database function closes the request so a late charge cannot be applied.
 */
export async function compensateFarmV2CoinTransaction(input: {
  userId: string;
  requestId: string;
  evidence?: string;
}): Promise<CoinCompensationOutcome> {
  const [mutation] = await db
    .select()
    .from(farmV2MutationTable)
    .where(
      and(
        eq(farmV2MutationTable.userId, input.userId),
        eq(farmV2MutationTable.requestId, input.requestId),
      ),
    )
    .limit(1);
  if (!mutation) return { status: "not_due", reason: "FARM_MUTATION_NOT_FOUND" };
  const decision = decideFarmV2CoinCompensation({
    transactionState: mutation.transactionState,
    walletCurrency: mutation.walletCurrency,
    walletAmount: mutation.walletAmount,
    walletTransaction: mutation.walletTransaction,
  });
  if (!decision.due) return { status: "not_due", reason: decision.reason };

  const evidence = input.evidence ?? decision.evidence;
  const claimed = (
    await db.execute(sql`
      INSERT INTO public.farm_v2_coin_compensation
        (user_id, request_id, wallet_scope, amount, status, evidence, attempts)
      VALUES (${input.userId}::uuid, ${input.requestId}, ${decision.scope},
              ${decision.amount}, 'claimed', ${evidence}, 1)
      ON CONFLICT (user_id, request_id, wallet_scope) DO NOTHING
      RETURNING status
    `)
  ).rows;
  if (claimed.length === 0) {
    const [existing] = await db
      .select()
      .from(farmV2CoinCompensationTable)
      .where(
        and(
          eq(farmV2CoinCompensationTable.userId, input.userId),
          eq(farmV2CoinCompensationTable.requestId, input.requestId),
          eq(farmV2CoinCompensationTable.walletScope, decision.scope),
        ),
      )
      .limit(1);
    if (!existing) return { status: "in_progress" };
    if (existing.status === "posted")
      return {
        status: "duplicate",
        ledgerId: existing.ledgerId,
        amount: existing.amount,
      };
    if (existing.status === "claimed") return { status: "in_progress" };
    // A failed attempt is retried, still once per request and wallet.
    const retried = (
      await db.execute(sql`
        UPDATE public.farm_v2_coin_compensation
           SET status='claimed', attempts=attempts+1, failure_code=NULL, updated_at=now()
         WHERE user_id=${input.userId}::uuid AND request_id=${input.requestId}
           AND wallet_scope=${decision.scope} AND status='failed'
        RETURNING status
      `)
    ).rows;
    if (retried.length === 0) return { status: "in_progress" };
  }

  let result: { result_status?: string; ledger_id?: string; grace?: boolean };
  try {
    const posted = await db.execute(sql`
      SELECT public.farm_v2_post_coin_compensation(
        ${input.userId}::uuid, ${input.requestId}, ${decision.scope},
        ${decision.amount}, ${evidence}) AS result
    `);
    result = posted.rows[0].result as typeof result;
  } catch (error) {
    const code =
      (error as { message?: string }).message?.split("\n")[0] ??
      "COIN_COMPENSATION_FAILED";
    await db.execute(sql`
      UPDATE public.farm_v2_coin_compensation
         SET status='failed', failure_code=${code}, updated_at=now()
       WHERE user_id=${input.userId}::uuid AND request_id=${input.requestId}
         AND wallet_scope=${decision.scope}
    `);
    return { status: "failed", code };
  }

  if (result.result_status === "duplicate")
    return { status: "duplicate", ledgerId: result.ledger_id ?? null, amount: decision.amount };
  if (result.result_status !== "created" || !result.ledger_id) {
    const code = result.result_status ?? "COIN_COMPENSATION_FAILED";
    await db.execute(sql`
      UPDATE public.farm_v2_coin_compensation
         SET status='failed', failure_code=${code}, updated_at=now()
       WHERE user_id=${input.userId}::uuid AND request_id=${input.requestId}
         AND wallet_scope=${decision.scope}
    `);
    return { status: "failed", code };
  }
  await db.execute(sql`
    UPDATE public.farm_v2_coin_compensation
       SET status='posted', ledger_id=${result.ledger_id}::uuid,
           posted_at=now(), updated_at=now(), failure_code=NULL
     WHERE user_id=${input.userId}::uuid AND request_id=${input.requestId}
       AND wallet_scope=${decision.scope}
  `);
  return {
    status: "posted",
    ledgerId: result.ledger_id,
    grace: result.grace === true,
    amount: decision.amount,
  };
}

/**
 * Accounts with repeated compensation, for an operator to review. Reading this
 * never blocks a player and never changes a balance.
 */
export async function listFarmV2CoinCompensationWatch(input: {
  minimum?: number;
  limit?: number;
} = {}) {
  const minimum = input.minimum ?? 3;
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const { rows } = await db.execute(sql`
    SELECT user_id, compensation_count, compensated_coins, first_at, last_at
      FROM public.farm_v2_coin_compensation_watch
     WHERE compensation_count >= ${minimum}
     ORDER BY compensation_count DESC, last_at DESC
     LIMIT ${limit}
  `);
  return rows as {
    user_id: string;
    compensation_count: number;
    compensated_coins: string;
    first_at: string;
    last_at: string | null;
  }[];
}
