import { FARM_V2_LANDS } from "./canonicalLandData";
export type InventorySlot = {
  id: string;
  category: string;
  name: string;
  quantity: number;
  icon?: string;
  symbol?: string;
  description: string;
};
import type { WorkshopWarehouse } from "./workshopRuntime";

export function warehouseSlots(warehouse: WorkshopWarehouse, assetBase = "/") {
  const items: InventorySlot[] = [];
  let unavailable = false;
  function add(item: Omit<InventorySlot, "quantity">, quantity: number | undefined) {
    if (quantity === undefined || !Number.isSafeInteger(quantity) || quantity < 0) {
      unavailable = true;
    } else if (quantity > 0) {
      items.push({ ...item, quantity });
    }
  }
  const base = assetBase + "images/";
  for (const land of FARM_V2_LANDS) {
    add({id: "seed-" + land.id, category:"種子", name:land.seedName, symbol:"🌱", description:"用於對應靈田播種。"}, warehouse.seeds[land.id]);
    add({id: "crop-" + land.id, category:"作物", name:land.cropName, icon:base + `plants/${land.id}-0.webp`, description:"靈田收成所得，可用於兌換或合成。"}, warehouse.crops[land.id]);
  }
  for (const name of ["蘊靈砂", "九霄玉髓"] as const) {
    add({id:name, category:"材料", name, icon:base + `farm/items/${name}.png`, description:"用於盆栽合成。"}, warehouse.workshop?.materials[name]);
  }
  add({id:"pet-food", category:"材料", name:"靈獸百味糧", symbol:"🥣", description:"用於餵食靈獸。"}, warehouse.workshop?.petFood);
  return {items, unavailable};
}
