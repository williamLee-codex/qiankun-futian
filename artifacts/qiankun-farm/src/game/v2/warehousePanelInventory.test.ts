import { expect, it } from "vitest";
import { warehouseSlots } from "./warehousePanelInventory";

it("retains reported quantities and distinguishes missing fields from zero", () => {
  const result = warehouseSlots({
    seeds: {1:9,2:0,3:0,4:0,5:0,6:0},
    crops: {1:3,2:0,3:0,4:0,5:0,6:0},
  });
  expect(result.unavailable).toBe(true);
  expect(result.items.map(({id,quantity}) => [id,quantity])).toEqual([["seed-1",9],["crop-1",3]]);
});
