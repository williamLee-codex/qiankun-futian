import { test, expect } from "vitest";
import { executeFarmerLandTransaction } from "./farmerLandTransaction";
import { createFarmerState } from "./farmerRuntime";
import { createEmptyFarmWarehouse } from "./warehouseRuntime";
const H = 3600000;
test("FARMER-NEWBIE-001: offline harvests use original maturity, not login time", () => {
  const warehouse = createEmptyFarmWarehouse();
  warehouse.seeds[1] = 40;
  const result = executeFarmerLandTransaction({
    farmer: {
      ...createFarmerState(),
      entitled: true,
      enabledByLand: {
        1: true,
        2: false,
        3: false,
        4: false,
        5: false,
        6: false,
      },
    },
    land: {
      landId: 1,
      lifecycle: "GROWING",
      accessActive: true,
      plantedQuantity: 20,
      plantedAt: 160 * H,
      maturesAt: 164 * H,
    },
    warehouse,
    firstFarmEnteredAt: 0,
    now: 174 * H,
  });
  // 164h blessed; 168h and 172h outside the exact seven-day window.
  expect(result.creditedHarvestQuantity).toBe(160);
  expect(result.warehouse.seeds[1]).toBe(0);
  expect(result.land.lifecycle).toBe("EMPTY");
});
