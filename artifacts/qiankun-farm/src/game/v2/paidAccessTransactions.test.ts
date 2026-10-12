import { describe, expect, it } from "vitest";
import { claimChaosSeedsToWarehouse } from "./chaosSeedTransactions";
import { CHAOS_CYCLE_MS } from "./chaosSeedRuntime";
import { createInitialFarmAccess } from "./accessRuntime";
import { createInitialLandEntities } from "./landRuntime";
import { createEmptyFarmWarehouse } from "./warehouseRuntime";
import { reconcilePaidFarmState } from "./paidAccessTransactions";

describe("Farm V2 paid access transactions", () => {
  it("CHAOS-CURSOR-001 settles pending seeds on state reconciliation and never backfills suspended ticks", () => {
    const initial = reconcilePaidFarmState({
      access: createInitialFarmAccess(),
      lands: createInitialLandEntities(),
      warehouse: createEmptyFarmWarehouse(),
      chaosState: null,
      effectivePaidCrystals: 600,
      now: 0,
    });
    const active = reconcilePaidFarmState({
      ...initial,
      effectivePaidCrystals: 600,
      now: CHAOS_CYCLE_MS * 5,
    });
    expect(active.chaosState).toMatchObject({
      pending: 3,
      processedCycle: 5,
      anchorAt: 0,
    });
    const claimed = claimChaosSeedsToWarehouse({
      state: active.chaosState!,
      warehouse: active.warehouse,
    });
    const paused = reconcilePaidFarmState({
      ...active,
      chaosState: claimed.state,
      warehouse: claimed.warehouse,
      effectivePaidCrystals: 0,
      now: CHAOS_CYCLE_MS * 6,
    });
    const restored = reconcilePaidFarmState({
      ...paused,
      effectivePaidCrystals: 600,
      now: CHAOS_CYCLE_MS * 10,
    });
    expect(restored.chaosState).toMatchObject({
      pending: 0,
      processedCycle: 10,
      anchorAt: 0,
    });
    expect(restored.warehouse.seeds[6]).toBe(4);
    const next = reconcilePaidFarmState({
      ...restored,
      effectivePaidCrystals: 600,
      now: CHAOS_CYCLE_MS * 11,
    });
    expect(next.chaosState).toMatchObject({
      pending: 1,
      processedCycle: 11,
      anchorAt: 0,
    });
  });
  it("unlocks paid lands and grants the first chaos seed at 600", () => {
    const result = reconcilePaidFarmState({
      access: createInitialFarmAccess(),
      lands: createInitialLandEntities(),
      warehouse: createEmptyFarmWarehouse(),
      chaosState: null,
      effectivePaidCrystals: 600,
      now: 1000,
    });
    expect(result.lands.find((x) => x.landId === 4)?.accessActive).toBe(true);
    expect(result.lands.find((x) => x.landId === 5)?.accessActive).toBe(true);
    expect(result.lands.find((x) => x.landId === 6)?.accessActive).toBe(true);
    expect(result.warehouse.seeds[6]).toBe(1);
    expect(result.chaosState?.anchorAt).toBe(1000);
  });

  it("refund suspension preserves planted paid-land crop and timestamps", () => {
    let result = reconcilePaidFarmState({
      access: createInitialFarmAccess(),
      lands: createInitialLandEntities(),
      warehouse: createEmptyFarmWarehouse(),
      chaosState: null,
      effectivePaidCrystals: 600,
      now: 1000,
    });
    const land4 = result.lands.find((x) => x.landId === 4)!;
    result = {
      ...result,
      lands: result.lands.map((x) =>
        x.landId === 4
          ? {
              ...land4,
              lifecycle: "GROWING",
              plantedQuantity: 4,
              plantedAt: 2000,
              maturesAt: 3000,
            }
          : x,
      ),
    };

    const suspended = reconcilePaidFarmState({
      ...result,
      effectivePaidCrystals: 99,
      now: 2500,
    });
    const suspended4 = suspended.lands.find((x) => x.landId === 4)!;
    expect(suspended4.accessActive).toBe(false);
    expect(suspended4.lifecycle).toBe("GROWING");
    expect(suspended4.plantedQuantity).toBe(4);
    expect(suspended4.plantedAt).toBe(2000);
    expect(suspended4.maturesAt).toBe(3000);
  });
});
