import { describe, expect, it } from "vitest";
import { materialShortages, precheckWorkshopMaterials } from "./farm-v2-precheck";

const names = { clay: "陶土", reed: "蘆葦" };

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
});
