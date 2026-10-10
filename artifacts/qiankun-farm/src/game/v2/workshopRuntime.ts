import {
  POT_GRADES,
  POT_GRADE_COSTS,
  POT_FIRST_UNLOCK_REWARDS,
  type PotGrade,
} from "./potRuntime";
import { potDisplayBonus } from "./potDisplayRuntime";
import { RELEASED_DECOR } from "./decorCatalog";
import type { FarmLandId } from "./canonicalLandData";
import type { FarmWarehouse } from "./warehouseRuntime";
export type PotAsset = {
  id: string;
  species: FarmLandId;
  grade: PotGrade;
  displayed: boolean;
  acquiredAt: number;
};
export type DecorAsset = {
  id: string;
  catalogId: string;
  slot: number | null;
  acquiredAt: number;
};
export type WorkshopState = {
  pots: PotAsset[];
  decor: DecorAsset[];
  potGallery: Record<string, number>;
  decorGallery: Record<string, number>;
  materials: { 蘊靈砂: number; 九霄玉髓: number };
  petFood?: number;
  formations?: { id: string; expiresAt: number | null }[];
  activeFormation?: string | null;
};
export type WorkshopWarehouse = FarmWarehouse & { workshop?: WorkshopState };
export type WorkshopCommand =
  | { kind: "buyPet"; petId: "尋星犬" | "辟邪狻猊" }
  | { kind: "buyFormation" }
  | { kind: "switchFormation"; formationId: string | null }
  | { kind: "claimMission"; missionId: string }
  | { kind: "buyFood"; quantity: number }
  | { kind: "feedPet"; petId: string }
  | {
      kind: "synthesize";
      species: number;
      grade: PotGrade;
      useDisplayed: boolean;
    }
  | { kind: "displayPot"; potId: string }
  | { kind: "removePot"; species: number }
  | { kind: "buyDecor"; catalogId: string }
  | { kind: "placeDecor"; decorId: string; slot: number | null };
export function workshopState(w: WorkshopWarehouse): WorkshopState {
  return (
    w.workshop ?? {
      pots: [],
      decor: [],
      potGallery: {},
      decorGallery: {},
      materials: { 蘊靈砂: 0, 九霄玉髓: 0 },
    }
  );
}
export function workshopLingyun(s: WorkshopState) {
  return s.pots
    .filter((p) => p.displayed)
    .reduce((sum, p) => sum + potDisplayBonus(p.species, p.grade), 0);
}
function reconcileDecorSlots(s: WorkshopState): WorkshopState {
  const lingyun = workshopLingyun(s);
  return {
    ...s,
    decor: s.decor.map((d) =>
      d.slot !== null && lingyun < (d.slot - 1) * 20 ? { ...d, slot: null } : d,
    ),
  };
}
export function workshopPublicState(w: WorkshopWarehouse) {
  const state = workshopState(w),
    lingyun = workshopLingyun(state);
  return {
    state,
    lingyun,
    friendCapacity: 30 + lingyun,
    unlockedSlots: Math.min(6, Math.floor(lingyun / 20) + 1),
  };
}
export function planWorkshopMutation(
  w: WorkshopWarehouse,
  command: WorkshopCommand,
  id: string,
  now: number,
) {
  let state = structuredClone(workshopState(w));
  let warehouse: WorkshopWarehouse = { ...w, crops: { ...w.crops } };
  let cost = 0,
    reward = 0,
    referenceId = "";
  if (command.kind === "synthesize") {
    if (
      !Number.isInteger(command.species) ||
      command.species < 1 ||
      command.species > 6
    )
      throw new Error("INVALID_FARM_LAND_ID");
    if (typeof command.useDisplayed !== "boolean")
      throw new Error("INVALID_WORKSHOP_COMMAND");
    const species = command.species as FarmLandId,
      index = POT_GRADES.indexOf(command.grade);
    if (index < 0) throw new Error("INVALID_POT_GRADE");
    const key = `${species}:${command.grade}`;
    cost = POT_GRADE_COSTS[command.grade].coins;
    const material = index < 3 ? "蘊靈砂" : "九霄玉髓",
      materialCost = [1, 1, 4, 2, 4, 10][index];
    if (
      !Number.isSafeInteger(state.materials[material]) ||
      state.materials[material] < materialCost
    )
      throw new Error("INSUFFICIENT_MATERIALS");
    let displayed = false;
    if (index === 0) {
      if (command.useDisplayed) throw new Error("DISPLAYED_SOURCE_MISMATCH");
      if (warehouse.crops[species] < 3) throw new Error("INSUFFICIENT_CROPS");
      warehouse.crops[species] -= 3;
    } else {
      const from = POT_GRADES[index - 1],
        required = species === 6 ? 2 : 3;
      const current = state.pots.find(
        (p) => p.species === species && p.displayed,
      );
      if (command.useDisplayed && current?.grade !== from)
        throw new Error("DISPLAYED_SOURCE_MISMATCH");
      displayed = command.useDisplayed;
      const sources = state.pots
        .filter(
          (p) => p.species === species && p.grade === from && !p.displayed,
        )
        .slice(0, required - (displayed ? 1 : 0));
      if (sources.length !== required - (displayed ? 1 : 0))
        throw new Error("INSUFFICIENT_SAME_GRADE_POTS");
      const consumed = new Set(sources.map((p) => p.id));
      if (displayed) consumed.add(current!.id);
      state.pots = state.pots.filter((p) => !consumed.has(p.id));
    }
    state.materials[material] -= materialCost;
    state.pots.push({
      id,
      species,
      grade: command.grade,
      displayed,
      acquiredAt: now,
    });
    const first = state.potGallery[key] === undefined;
    if (first) {
      state.potGallery[key] = now;
      reward = POT_FIRST_UNLOCK_REWARDS[command.grade];
    }
    referenceId = `${species}:${index}:${first ? 1 : 0}`;
  } else if (command.kind === "displayPot") {
    const pot = state.pots.find((p) => p.id === command.potId);
    if (!pot) throw new Error("POT_NOT_OWNED");
    state.pots = state.pots.map((p) =>
      p.species === pot.species ? { ...p, displayed: p.id === pot.id } : p,
    );
  } else if (command.kind === "removePot") {
    if (
      !Number.isInteger(command.species) ||
      command.species < 1 ||
      command.species > 6
    )
      throw new Error("INVALID_FARM_LAND_ID");
    state.pots = state.pots.map((p) =>
      p.species === command.species ? { ...p, displayed: false } : p,
    );
  } else if (command.kind === "buyDecor") {
    const catalog = RELEASED_DECOR.find((d) => d.id === command.catalogId);
    if (!catalog) throw new Error("DECOR_NOT_RELEASED");
    if (
      !catalog.repeatable &&
      state.decor.some((d) => d.catalogId === catalog.id)
    )
      throw new Error("DECOR_ALREADY_OWNED");
    cost = catalog.price;
    const first = state.decorGallery[catalog.id] === undefined;
    if (first) {
      state.decorGallery[catalog.id] = now;
      reward = 30;
    }
    state.decor.push({
      id,
      catalogId: catalog.id,
      slot: null,
      acquiredAt: now,
    });
    referenceId = `${catalog.id}:${first ? 1 : 0}`;
  } else if (command.kind === "placeDecor") {
    const asset = state.decor.find((d) => d.id === command.decorId);
    if (!asset) throw new Error("DECOR_NOT_OWNED");
    const catalog = RELEASED_DECOR.find((d) => d.id === asset.catalogId);
    if (!catalog) throw new Error("DECOR_NOT_RELEASED");
    const slot = command.slot;
    if (slot !== null) {
      if (!Number.isInteger(slot) || slot < 1 || slot > 6)
        throw new Error("INVALID_DECOR_SLOT");
      if (workshopLingyun(state) < (slot - 1) * 20)
        throw new Error("DECOR_SLOT_LOCKED");
      if (!(catalog.allowedSlots as readonly number[]).includes(slot))
        throw new Error("DECOR_SLOT_INCOMPATIBLE");
      const occupant = state.decor.find(
        (d) => d.slot === slot && d.id !== asset.id,
      );
      if (occupant) {
        const other = RELEASED_DECOR.find((d) => d.id === occupant.catalogId)!;
        if (
          asset.slot !== null &&
          !(other.allowedSlots as readonly number[]).includes(asset.slot)
        )
          throw new Error("DECOR_SLOT_INCOMPATIBLE");
        occupant.slot = asset.slot;
      }
    }
    asset.slot = slot;
  } else throw new Error("INVALID_WORKSHOP_COMMAND");
  state = reconcileDecorSlots(state);
  warehouse = { ...warehouse, workshop: state } as WorkshopWarehouse;
  return {
    warehouse,
    cost,
    reward,
    referenceId,
    ...workshopPublicState(warehouse),
  };
}

// FORMATION-EXPIRE-001: expired limited rights disappear, without fallback/history.
export function settleWorkshopTimedRights(
  w: WorkshopWarehouse,
  now: number,
): WorkshopWarehouse {
  const state = workshopState(w);
  if (!state.formations) return w;
  const formations = state.formations.filter(
    (f) => f.expiresAt === null || f.expiresAt > now,
  );
  const activeFormation = formations.some((f) => f.id === state.activeFormation)
    ? state.activeFormation
    : null;
  if (
    formations.length === state.formations.length &&
    activeFormation === state.activeFormation
  )
    return w;
  return { ...w, workshop: { ...state, formations, activeFormation } };
}
