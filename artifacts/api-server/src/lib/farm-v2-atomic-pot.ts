import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { farmV2PlayerStateTable, farmV2MutationTable } from "@workspace/db";
import { farmAuthorityContext } from "./farm-v2-authority-context";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";
import {
  planWorkshopMutation,
  workshopPublicState,
  type WorkshopWarehouse,
  type WorkshopCommand,
} from "../../../qiankun-farm/src/game/v2/workshopRuntime";
type PotCommand = Extract<WorkshopCommand, { kind: "synthesize" }>;
export async function mutateFarmV2AtomicPot(input: {
  userId: string;
  requestId: string;
  command: PotCommand;
}) {
  if (process.env.FARM_V2_ATOMIC_POT_ENABLED !== "1")
    throw new Error("FARM_ATOMIC_POT_NOT_CONFIGURED");
  const authority = farmAuthorityContext.getStore();
  if (!authority || authority.userId !== input.userId)
    throw new Error("FARM_ATOMIC_AUTHORITY_REQUIRED");
  return runFarmV2IdempotentMutation({
    userId: input.userId,
    requestId: input.requestId,
    action: "WORKSHOP:" + JSON.stringify(input.command),
    execute: async (tx) => {
      const [player] = await tx
        .select()
        .from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.userId))
        .for("update");
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
      const plan = planWorkshopMutation(
        player.warehouseState as WorkshopWarehouse,
        input.command,
        randomUUID(),
        Date.now(),
      );
      let result;
      try {
        // This statement uses the domain transaction's connection, never HTTP or
        // journalDb. Core owns pricing, lifecycle, wallet locks and ledger writes.
        result = await tx.execute(
          sql`SELECT public.farm_v2_apply_atomic_pot_wallet(${authority.operationId}::uuid,${input.userId}::uuid,${input.requestId},${JSON.stringify(input.command)}::jsonb,${plan.referenceId}) AS result`,
        );
      } catch (error) {
        let cause: unknown = error;
        for (
          let depth = 0;
          depth < 5 && cause && typeof cause === "object";
          depth++
        ) {
          const e = cause as {
            code?: string;
            message?: string;
            cause?: unknown;
          };
          if (["42883", "42P01", "42501"].includes(e.code ?? ""))
            throw new Error("FARM_ATOMIC_POT_TOPOLOGY_REQUIRED");
          if (e.code === "P0001" && e.message) throw new Error(e.message);
          cause = e.cause;
        }
        throw error;
      }
      const core = result.rows[0]?.result as {
        result_status?: string;
        transaction?: { id: string };
      };
      if (core?.result_status !== "created" || !core.transaction?.id)
        throw new Error("INVALID_ATOMIC_CORE_RESULT");
      await tx
        .update(farmV2PlayerStateTable)
        .set({ warehouseState: plan.warehouse, updatedAt: new Date() })
        .where(eq(farmV2PlayerStateTable.userId, input.userId));
      await tx
        .update(farmV2MutationTable)
        .set({
          walletTransaction: {
            settlement: "ATOMIC_CORE_FARM",
            coreTransactionId: core.transaction.id,
          },
          walletCurrency: "coin",
          walletAmount: Math.abs(plan.reward - plan.cost),
          walletDirection: plan.reward < plan.cost ? "debit" : "credit",
        })
        .where(sql`user_id=${input.userId} AND request_id=${input.requestId}`);
      return {
        warehouse: plan.warehouse,
        cost: plan.cost,
        reward: plan.reward,
        ...workshopPublicState(plan.warehouse),
      };
    },
  });
}
