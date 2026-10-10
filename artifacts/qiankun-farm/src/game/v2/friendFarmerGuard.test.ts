import { expect, test } from "vitest";
import {
  createFarmerState,
  reconcileFarmerEntitlement,
  setFarmerLandEnabled,
} from "./farmerRuntime";
import { targetFarmerBlocksRequestedLands } from "./friendFarmerGuard";
test("FARMER-FRIEND-001: any effective farmer blocks before checking requested lands", () => {
  let farmer = reconcileFarmerEntitlement(createFarmerState(), 999);
  farmer = setFarmerLandEnabled(farmer, 2, false);
  farmer = setFarmerLandEnabled(farmer, 3, false);
  expect(targetFarmerBlocksRequestedLands(farmer, [2, 3])).toBe(true);
  for (const id of [1, 2, 3, 4, 5, 6] as const)
    farmer = setFarmerLandEnabled(farmer, id, false);
  expect(targetFarmerBlocksRequestedLands(farmer, [2, 3])).toBe(false);
  expect(
    targetFarmerBlocksRequestedLands(
      reconcileFarmerEntitlement(createFarmerState(), 998),
      [2],
    ),
  ).toBe(false);
});
