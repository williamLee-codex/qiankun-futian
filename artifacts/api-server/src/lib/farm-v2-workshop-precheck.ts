import { eq } from "drizzle-orm";
import { db, farmV2PlayerStateTable } from "@workspace/db";
import {
  planWorkshopMutation,
  type WorkshopWarehouse,
} from "../../../qiankun-farm/src/game/v2/workshopRuntime";
import { readCrystalBalance, readPurchaseWalletBalance } from "./farm-v2-coin-balance";
import { localCoinsEnabled } from "./farm-v2-local-coins";

/**
 * Refuses a synthesis the player cannot pay for before the durable journal row
 * exists. The planner is pure, so running it here cannot consume materials or
 * produce a second asset plan; the authoritative re-check stays inside the
 * mutation transaction.
 *
 * The debit currency is decided deeper in the saga, so a refusal only happens
 * when no wallet can cover the net cost.
 */
export async function guardWorkshopSynthesisDebit(input: {
  userId: string;
  command: { kind: string; [key: string]: unknown };
}): Promise<void> {
  if (input.command?.kind !== "synthesize") return;

  const [player] = await db
    .select({ warehouseState: farmV2PlayerStateTable.warehouseState })
    .from(farmV2PlayerStateTable)
    .where(eq(farmV2PlayerStateTable.userId, input.userId))
    .limit(1);
  if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");

  const plan = planWorkshopMutation(
    player.warehouseState as WorkshopWarehouse,
    input.command as never,
    crypto.randomUUID(),
    Date.now(),
  );
  const due = plan.cost - plan.reward;
  if (due <= 0) return;

  const [crystals, coins] = await Promise.all([
    readCrystalBalance(input.userId),
    readPurchaseWalletBalance(input.userId, localCoinsEnabled() ? "farm" : "core"),
  ]);
  if (crystals === null && coins === null)
    throw new Error("WALLET_BALANCE_UNAVAILABLE");
  if ((crystals ?? 0) >= due || (coins ?? 0) >= due) return;
  throw new Error("CRYSTAL_INSUFFICIENT");
}
