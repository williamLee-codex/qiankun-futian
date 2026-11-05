import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BagPotInventoryGrid, FarmWorkshopPanel } from "./FarmWorkshopPanel";
import { FARM_V2_LANDS } from "./canonicalLandData";
import { POT_GRADES } from "./potRuntime";
import type { WorkshopWarehouse } from "./workshopRuntime";

const warehouse: WorkshopWarehouse = {
  seeds: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  crops: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  workshop: {
    pots: [],
    decor: [],
    potGallery: {},
    decorGallery: {},
    materials: { 蘊靈砂: 2, 九霄玉髓: 3 },
  },
};

describe("Qiankun bag initial render", () => {
  it("renders six categories and the server-derived material quantities", () => {
    const html = renderToStaticMarkup(
      <FarmWorkshopPanel
        tab="乾坤寶囊"
        warehouse={warehouse}
        busy={false}
        transact={async () => true}
      />,
    );
    expect((html.match(/aria-pressed=/g) ?? []).length).toBe(6);
    for (const name of ["材料", "碎片", "傢俱", "外型", "盆栽", "其他"]) {
      expect(html).toContain(`>${name}</button>`);
    }
    expect(html).toContain("蘊靈砂：2");
    expect(html).toContain("九霄玉髓：3");
    expect(html).not.toContain("洞府</button>");
  });

  it("renders all 36 pot inventory cells, not just a calculated combination count", () => {
    const html = renderToStaticMarkup(<BagPotInventoryGrid pots={[]} />);
    expect((html.match(/<article\b/g) ?? []).length).toBe(36);
    expect((html.match(/持有 0 株/g) ?? []).length).toBe(36);
    expect(html).toContain('aria-label="盆栽庫存格位"');
  });

  it("counts matching pots without mixing land or grade", () => {
    const pots = [
      { id: "pot-1", species: 1 as const, grade: "黃" as const, displayed: false, acquiredAt: 1 },
      { id: "pot-2", species: 1 as const, grade: "黃" as const, displayed: true, acquiredAt: 2 },
      { id: "pot-3", species: 6 as const, grade: "神" as const, displayed: false, acquiredAt: 3 },
    ];
    const html = renderToStaticMarkup(<BagPotInventoryGrid pots={pots} />);
    expect((html.match(/<article\b/g) ?? []).length).toBe(36);
    expect((html.match(/持有 2 株/g) ?? []).length).toBe(1);
    expect((html.match(/持有 1 株/g) ?? []).length).toBe(1);
    expect((html.match(/持有 0 株/g) ?? []).length).toBe(34);
  });

  it("defines 36 distinct species-and-grade slots", () => {
    const keys = FARM_V2_LANDS.flatMap((land) =>
      POT_GRADES.map((grade) => `${land.id}:${grade}`),
    );
    expect(keys).toHaveLength(36);
    expect(new Set(keys).size).toBe(36);
  });
});
