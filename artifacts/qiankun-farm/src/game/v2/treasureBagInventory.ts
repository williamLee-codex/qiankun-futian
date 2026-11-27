import { RELEASED_DECOR } from "./decorCatalog";
import { FORMATION_NAMES } from "./formationSourcesRuntime";
import type { InventorySlot } from "./warehousePanelInventory";
import type { WorkshopWarehouse } from "./workshopRuntime";

export function treasureBagSlots(warehouse: WorkshopWarehouse, base: string) {
  const state = warehouse.workshop;
  const items: InventorySlot[] = [];
  if (!state) return { items, unavailable: true };

  for (const name of ["蘊靈砂", "九霄玉髓"] as const) {
    const quantity = state.materials[name];
    if (Number.isSafeInteger(quantity) && quantity > 0) {
      items.push({id:name, name, quantity, category:"靈物", icon:base + "images/farm/items/" + name + ".png", description:"用於盆栽合成。"});
    }
  }
  for (const decor of state.decor) {
    const name = RELEASED_DECOR.find(entry => entry.id === decor.catalogId)?.name ?? decor.catalogId;
    items.push({id:"decor-" + decor.id, name, quantity:1, category:"道具", symbol:"🏮", description:"可於洞府陳設管理擺放或收回。"});
  }
  for (const formation of state.formations ?? []) {
    items.push({id:"formation-" + formation.id, name:FORMATION_NAMES[formation.id] ?? formation.id, quantity:1, category:"靈物", symbol:"✦", description:"可在護陣管理查看狀態及裝備。"});
  }
  const food = state.petFood;
  if (typeof food === "number" && Number.isSafeInteger(food) && food > 0) {
    items.push({id:"pet-food", name:"靈獸百味糧", quantity:food, category:"道具", symbol:"🥣", description:"用於餵食靈獸。"});
  }
  return {items, unavailable: state.petFood === undefined || state.formations === undefined};
}
