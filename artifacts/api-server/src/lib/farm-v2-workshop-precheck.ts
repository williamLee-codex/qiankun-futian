import { eq } from "drizzle-orm";
import { db, farmV2PlayerStateTable } from "@workspace/db";
import {
  planWorkshopMutation,
  type WorkshopWarehouse,
} from "../../../qiankun-farm/src/game/v2/workshopRuntime";
import { readCrystalBalance, readPurchaseWalletBalance } from "./farm-v2-coin-balance";
import { precheckWorkshopDebit, workshopDebitCurrency } from "./farm-v2-precheck";
import { localCoinsEnabled } from "./farm-v2-local-coins";

/**
 * Refuses a synthesis the player cannot pay for before the durable journal row
 * exists. The planner is pure, so running it here cannot consume materials or
 * produce a second asset plan; the authoritative re-check stays inside the
 * mutation transaction.
 *
 * The currency comes from the same mapping the plan branches use, so a crystal
 * command is only ever checked against crystals.
 */
export async function guardWorkshopSynthesisDebit(input: {
  userId: string;
  command: { kind: string; [key: string]: unknown };
}): Promise<void> {
  const currency = workshopDebitCurrency(String(input.command?.kind ?? ""));
  if (!currency) return;

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

  // Only the wallet the plan debits is consulted; a fat balance in the other
  // currency never authorises the debit.
  const wallet = localCoinsEnabled() ? ("farm" as const) : ("core" as const);
  const [crystals, coins] = await Promise.all([
    currency === "crystal" ? readCrystalBalance(input.userId) : Promise.resolve(null),
    currency === "coin"
      ? readPurchaseWalletBalance(input.userId, wallet)
      : Promise.resolve(null),
  ]);
  const result = precheckWorkshopDebit({ currency, due, wallet, crystals, coins });
  if (!result.ok) throw new Error(result.code);
}
