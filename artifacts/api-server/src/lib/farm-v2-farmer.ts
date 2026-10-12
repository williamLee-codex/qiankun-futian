import { eq } from "drizzle-orm";
import { farmV2PlayerStateTable } from "@workspace/db";
import { runFarmV2IdempotentMutation } from "./farm-v2-idempotency";
import { executeFarmerLandTransaction } from "../../../qiankun-farm/src/game/v2/farmerLandTransaction";
import {
  setFarmerLandEnabled,
  type FarmerState,
} from "../../../qiankun-farm/src/game/v2/farmerRuntime";
import type { FarmLandId } from "../../../qiankun-farm/src/game/v2/canonicalLandData";
import type { reconcileEffectivePaidBenefits } from "../../../qiankun-farm/src/game/v2/effectivePaidBenefitsTransaction";

type Benefits = ReturnType<typeof reconcileEffectivePaidBenefits>;
/** Runs only inside the existing locked reconciliation transaction. */
export function settleFarmV2Farmer(
  result: Benefits,
  firstFarmEnteredAt: Date | null,
  now: number,
): Benefits {
  if (!firstFarmEnteredAt) throw new Error("FIRST_FARM_ENTERED_AT_REQUIRED");
  let warehouse = result.warehouse;
  const lands = result.lands.map((land) => {
    const settlement = executeFarmerLandTransaction({
      farmer: result.farmer,
      land,
      warehouse,
      firstFarmEnteredAt: firstFarmEnteredAt.getTime(),
      now,
    });
    warehouse = settlement.warehouse;
    if (
      ![warehouse.seeds[land.landId], warehouse.crops[land.landId]].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      )
    )
      throw new Error("INVALID_FARM_INVENTORY");
    return settlement.land;
  });
  return { ...result, lands, warehouse };
}
export function setFarmV2FarmerPreference(input: {
  userId: string;
  requestId: string;
  landId: number;
  enabled: boolean;
}) {
  if (!Number.isInteger(input.landId) || input.landId < 1 || input.landId > 6)
    throw new Error("INVALID_FARM_LAND_ID");
  if (typeof input.enabled !== "boolean")
    throw new Error("INVALID_FARMER_PREFERENCE");
  return runFarmV2IdempotentMutation({
    userId: input.userId,
    requestId: input.requestId,
    action: `farmer-preference:${input.landId}:${input.enabled}`,
    execute: async (tx) => {
      const [player] = await tx
        .select()
        .from(farmV2PlayerStateTable)
        .where(eq(farmV2PlayerStateTable.userId, input.userId))
        .for("update")
        .limit(1);
      if (!player) throw new Error("FARM_PLAYER_STATE_NOT_FOUND");
      const farmer = player.farmerState as FarmerState;
      if (!farmer.entitled || player.effectivePaidCrystals < 999)
        throw new Error("FARMER_NOT_ENTITLED");
      const next = setFarmerLandEnabled(
        farmer,
        input.landId as FarmLandId,
        input.enabled,
      );
      await tx
        .update(farmV2PlayerStateTable)
        .set({ farmerState: next, updatedAt: new Date() })
        .where(eq(farmV2PlayerStateTable.userId, input.userId));
      return { farmer: next };
    },
  });
}
