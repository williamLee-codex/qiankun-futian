/**
 * Persistent background recovery. A task survives the request, the process and
 * a redeploy; a scheduled runner claims it with a lease, retries with backoff
 * and stops at a terminal state. Nothing here needs a resident process.
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { compensateFarmV2CoinTransaction } from "./farm-v2-coin-compensation";
import {
  readFarmV2RecoveryConfig,
  recoveryBackoffSeconds,
  type FarmV2RecoverySweepResult,
} from "./farm-v2-recovery-config";
export {
  readFarmV2RecoveryConfig,
  recoveryBackoffSeconds,
  type FarmV2RecoveryConfig,
} from "./farm-v2-recovery-config";

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export type FarmV2RecoveryTask = {
  id: string;
  user_id: string;
  request_id: string;
  action: string;
  state: string;
  attempts: number;
  max_attempts: number;
};

export async function enqueueFarmV2RecoveryTask(input: {
  userId: string;
  requestId: string;
  action: string;
}): Promise<boolean> {
  try {
    const { rows } = await db.execute(sql`
      INSERT INTO public.farm_v2_recovery_task(user_id,request_id,action)
      VALUES (${input.userId}::uuid,${input.requestId},${input.action})
      ON CONFLICT (user_id,request_id) DO NOTHING
      RETURNING id
    `);
    return rows.length > 0;
  } catch {
    // A queue write must never fail the player's request.
    return false;
  }
}

/**
 * Claim due tasks and resolve each one. Two runners can run at once: the lease
 * guarantees a task is only worked by one of them.
 */
export async function runFarmV2RecoverySweep(
  input: { owner?: string; limit?: number } = {},
): Promise<FarmV2RecoverySweepResult> {
  const config = readFarmV2RecoveryConfig();
  const owner = (input.owner ?? `sweep:${process.pid}:${Date.now()}`).slice(0, 120);
  const limit = clamp(input.limit ?? config.batch, 1, 100);
  const claimed = (
    await db.execute(sql`
      SELECT * FROM public.farm_v2_claim_recovery_tasks(${owner},${limit},${config.leaseSeconds})
    `)
  ).rows as FarmV2RecoveryTask[];
  const result: FarmV2RecoverySweepResult = {
    claimed: claimed.length,
    done: 0,
    retried: 0,
    abandoned: 0,
    failed: 0,
  };
  for (const task of claimed) {
    let outcome: string;
    let error: string | null = null;
    try {
      const compensated = await compensateFarmV2CoinTransaction({
        userId: task.user_id,
        requestId: task.request_id,
      });
      outcome = compensated.status;
      if (compensated.status === "failed") error = compensated.code;
      if (compensated.status === "posted" || compensated.status === "duplicate")
        await db.execute(sql`
          UPDATE public.farm_v2_mutation
             SET transaction_state='COMPENSATED',
                 failure_code='FARM_CHARGE_OUTCOME_UNKNOWN', updated_at=now()
           WHERE user_id=${task.user_id} AND request_id=${task.request_id}
             AND transaction_state IN ('WALLET_PENDING','WALLET_APPLIED')
        `);
    } catch (cause) {
      outcome = "error";
      error = cause instanceof Error ? cause.message : "RECOVERY_TASK_FAILED";
    }
    if (["posted", "duplicate", "not_due"].includes(outcome)) {
      await finish(task, owner, "done", outcome, null, null);
      result.done++;
    } else if (task.attempts >= Math.min(task.max_attempts, config.maxAttempts)) {
      await finish(task, owner, "abandoned", outcome, error, null);
      result.abandoned++;
    } else {
      const wait = recoveryBackoffSeconds(task.attempts, config);
      await finish(
        task,
        owner,
        "pending",
        outcome,
        error,
        new Date(Date.now() + wait * 1000),
      );
      result.retried++;
    }
  }
  return result;
}

async function finish(
  task: FarmV2RecoveryTask,
  owner: string,
  state: "pending" | "done" | "abandoned",
  outcome: string,
  error: string | null,
  nextRunAt: Date | null,
) {
  try {
    await db.execute(sql`
      SELECT public.farm_v2_finish_recovery_task(
        ${task.id}::uuid,${owner},${state},${outcome},${error},${nextRunAt})
    `);
  } catch {
    // A lost lease means another runner owns the task now; its result stands.
  }
}

/** What is stuck, what keeps failing and what was given up on. */
export async function readFarmV2RecoveryWatch() {
  const { rows } = await db.execute(sql`
    SELECT state, task_count, worst_attempts, oldest_at, newest_at
      FROM public.farm_v2_recovery_task_watch
     ORDER BY state
  `);
  return rows as {
    state: string;
    task_count: string;
    worst_attempts: number;
    oldest_at: string | null;
    newest_at: string | null;
  }[];
}
