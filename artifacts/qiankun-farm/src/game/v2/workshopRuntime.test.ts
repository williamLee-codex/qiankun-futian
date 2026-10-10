import { test, expect } from "vitest";
import { createEmptyFarmWarehouse } from "./warehouseRuntime";
import {
  settleWorkshopTimedRights,
  planWorkshopMutation,
  workshopState,
  workshopPublicState,
  type WorkshopWarehouse,
} from "./workshopRuntime";
function fixture() {
  const w: WorkshopWarehouse = createEmptyFarmWarehouse();
  w.crops[1] = 9;
  w.workshop = { ...workshopState(w), materials: { 蘊靈砂: 10, 九霄玉髓: 30 } };
  return w;
}
test("POT-ATOMIC-001/POT-GALLERY-004: costs, material, unique asset and first reward", () => {
  const w = fixture(),
    a = planWorkshopMutation(
      w,
      { kind: "synthesize", species: 1, grade: "黃", useDisplayed: false },
      "a",
      1,
    );
  expect([
    a.cost,
    a.reward,
    a.warehouse.crops[1],
    a.state.materials.蘊靈砂,
  ]).toEqual([3, 15, 6, 9]);
  const b = planWorkshopMutation(
    a.warehouse,
    { kind: "synthesize", species: 1, grade: "黃", useDisplayed: false },
    "b",
    2,
  );
  expect(b.reward).toBe(0);
  expect(b.state.potGallery["1:黃"]).toBe(1);
  expect(w.crops[1]).toBe(9);
  expect(() =>
    planWorkshopMutation(
      w,
      { kind: "synthesize", species: 1, grade: "神", useDisplayed: false },
      "bad",
      3,
    ),
  ).toThrow("INSUFFICIENT_SAME_GRADE_POTS");
});
test("POT-DISPLAY-003/POT-LOCATION-001: display source upgrades in place without copying", () => {
  let w = fixture();
  for (let i = 0; i < 3; i++)
    w = planWorkshopMutation(
      w,
      { kind: "synthesize", species: 1, grade: "黃", useDisplayed: false },
      String(i),
      i,
    ).warehouse;
  w = planWorkshopMutation(
    w,
    { kind: "displayPot", potId: "0" },
    "unused",
    3,
  ).warehouse;
  const a = planWorkshopMutation(
    w,
    { kind: "synthesize", species: 1, grade: "玄", useDisplayed: true },
    "new",
    4,
  );
  expect(a.state.pots).toEqual([
    { id: "new", species: 1, grade: "玄", displayed: true, acquiredAt: 4 },
  ]);
  expect(a.lingyun).toBe(2);
  expect(Object.keys(a.state.potGallery)).toHaveLength(2);
});
test("LINGYUN-SLOT-001/DECOR-COMPAT-001: collapse returns decor, incompatible swap rolls back", () => {
  let w = fixture();
  w.workshop!.pots = [
    { id: "pot", species: 6, grade: "神", displayed: true, acquiredAt: 0 },
  ];
  w = planWorkshopMutation(
    w,
    { kind: "buyDecor", catalogId: "DF003" },
    "bamboo",
    1,
  ).warehouse;
  w = planWorkshopMutation(
    w,
    { kind: "placeDecor", decorId: "bamboo", slot: 2 },
    "",
    2,
  ).warehouse;
  expect(workshopPublicState(w).lingyun).toBe(36);
  w = planWorkshopMutation(
    w,
    { kind: "removePot", species: 6 },
    "",
    3,
  ).warehouse;
  expect(w.workshop!.decor[0].slot).toBe(null);
  expect(() =>
    planWorkshopMutation(
      w,
      { kind: "placeDecor", decorId: "bamboo", slot: 3 },
      "",
      4,
    ),
  ).toThrow("DECOR_SLOT_LOCKED");
  expect(() =>
    planWorkshopMutation(w, { kind: "buyDecor", catalogId: "DF019" }, "", 5),
  ).toThrow("DECOR_NOT_RELEASED");
});

test("POT-RATIO-002/POT-UPGRADE-001: chaos consumes two of exactly the preceding grade and species", () => {
  const w = fixture();
  w.workshop!.pots = [
    { id: "a", species: 6, grade: "仙", displayed: false, acquiredAt: 0 },
    { id: "b", species: 6, grade: "仙", displayed: false, acquiredAt: 0 },
    { id: "c", species: 5, grade: "仙", displayed: false, acquiredAt: 0 },
  ];
  const result = planWorkshopMutation(
    w,
    { kind: "synthesize", species: 6, grade: "神", useDisplayed: false },
    "god",
    1,
  );
  expect(result.state.pots.map((p) => p.id)).toEqual(["c", "god"]);
  expect(result.cost).toBe(600);
  expect(result.state.materials.九霄玉髓).toBe(20);
  expect(() =>
    planWorkshopMutation(
      w,
      { kind: "synthesize", species: 6, grade: "天", useDisplayed: false },
      "skip",
      2,
    ),
  ).toThrow("INSUFFICIENT_SAME_GRADE_POTS");
});
test("FORMATION-EXPIRE-001: expired active right disappears without automatically activating permanent right", () => {
  const w = fixture();
  w.workshop!.formations = [
    { id: "expired", expiresAt: 10 },
    { id: "permanent", expiresAt: null },
  ];
  w.workshop!.activeFormation = "expired";
  const next = settleWorkshopTimedRights(w, 10);
  expect(next.workshop!.formations).toEqual([
    { id: "permanent", expiresAt: null },
  ]);
  expect(next.workshop!.activeFormation).toBe(null);
  expect(settleWorkshopTimedRights(next, 11)).toBe(next);
  expect(w.workshop!.activeFormation).toBe("expired");
});
