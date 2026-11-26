import { describe, expect, it } from "vitest";
import {
  assertSynthesisMaterials,
  FarmV2PrecheckRefusal,
  materialShortages,
  precheckSynthesisMaterials,
  precheckWorkshopMaterials,
} from "./farm-v2-precheck";
import type { WorkshopWarehouse } from "../../../qiankun-farm/src/game/v2/workshopRuntime";

const names = { clay: "陶土", reed: "蘆葦" };
const warehouseWith = (sand: number, jade: number) =>
  ({ workshop: { materials: { 蘊靈砂: sand, 九霄玉髓: jade } } }) as unknown as WorkshopWarehouse;

describe("workshop material pre-check", () => {
  it("names each short material with required, held and missing counts", () => {
    const result = precheckWorkshopMaterials({
      required: { clay: 6, reed: 2 },
      available: { clay: 4, reed: 2 },
      names,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a refusal");
    expect(result.code).toBe("FARM_MATERIALS_INSUFFICIENT");
    expect(result.details?.materials).toBe("陶土：需求 6、持有 4、不足 2");
  });

  it("passes when every material is held in full", () => {
    expect(
      precheckWorkshopMaterials({ required: { clay: 6 }, available: { clay: 6 }, names }),
    ).toEqual({ ok: true });
  });

  it("treats a missing material as zero held", () => {
    expect(
      materialShortages({ required: { reed: 3 }, available: {}, names })[0],
    ).toEqual({ material: "reed", name: "蘆葦", required: 3, held: 0, missing: 3 });
  });

  it("reports every short material, not only the first", () => {
    const shortages = materialShortages({
      required: { clay: 2, reed: 1 },
      available: { clay: 0, reed: 0 },
      names,
    });
    expect(shortages.map((s) => s.name)).toEqual(["陶土", "蘆葦"]);
  });

  it("returns the same shortages as structured details for the client notice", () => {
    const result = precheckWorkshopMaterials({
      required: { clay: 6, reed: 2 },
      available: { clay: 4, reed: 1 },
      names,
    });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.details?.shortages).toEqual([
      { material: "clay", name: "陶土", required: 6, held: 4, missing: 2 },
      { material: "reed", name: "蘆葦", required: 2, held: 1, missing: 1 },
    ]);
  });
});

describe("synthesis material pre-check", () => {
  it("uses the canonical recipe for every grade", () => {
    expect(precheckSynthesisMaterials({ warehouse: warehouseWith(1, 0), grade: "黃" })).toEqual({
      ok: true,
    });
    expect(precheckSynthesisMaterials({ warehouse: warehouseWith(1, 0), grade: "地" })).toMatchObject({
      ok: false,
      code: "FARM_MATERIALS_INSUFFICIENT",
    });
    expect(precheckSynthesisMaterials({ warehouse: warehouseWith(0, 10), grade: "神" })).toEqual({
      ok: true,
    });
  });

  it("names the short material with required, held and missing", () => {
    const result = precheckSynthesisMaterials({ warehouse: warehouseWith(1, 0), grade: "地" });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.details?.shortages).toEqual([
      { material: "蘊靈砂", name: "蘊靈砂", required: 4, held: 1, missing: 3 },
    ]);
  });

  it("refuses 神 grade with 九霄玉髓 10 required", () => {
    const result = precheckSynthesisMaterials({ warehouse: warehouseWith(99, 4), grade: "神" });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.details?.materials).toBe("九霄玉髓：需求 10、持有 4、不足 6");
  });

  it("treats a missing workshop as zero held", () => {
    const result = precheckSynthesisMaterials({
      warehouse: {} as WorkshopWarehouse,
      grade: "黃",
    });
    if (result.ok) throw new Error("expected a refusal");
    expect(result.details?.shortages).toEqual([
      { material: "蘊靈砂", name: "蘊靈砂", required: 1, held: 0, missing: 1 },
    ]);
  });

  it("rejects an unknown grade instead of assuming a recipe", () => {
    expect(
      precheckSynthesisMaterials({ warehouse: warehouseWith(9, 9), grade: "靈" as never }),
    ).toEqual({ ok: false, code: "INVALID_POT_GRADE" });
  });

  it("throws a refusal carrying the details for the error handler", () => {
    let thrown: unknown;
    try {
      assertSynthesisMaterials({ warehouse: warehouseWith(0, 0), grade: "天" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FarmV2PrecheckRefusal);
    expect((thrown as FarmV2PrecheckRefusal).message).toBe("FARM_MATERIALS_INSUFFICIENT");
    expect((thrown as FarmV2PrecheckRefusal).details?.materials).toBe(
      "九霄玉髓：需求 2、持有 0、不足 2",
    );
  });

  it("does not throw when the materials are held", () => {
    expect(() =>
      assertSynthesisMaterials({ warehouse: warehouseWith(1, 2), grade: "天" }),
    ).not.toThrow();
  });
});
