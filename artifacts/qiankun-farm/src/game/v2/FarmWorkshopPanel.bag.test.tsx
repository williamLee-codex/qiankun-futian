import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FarmWorkshopPanel } from "./FarmWorkshopPanel";
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

  it("keeps the 36-pot inventory out of the bag and directs players to synthesis", () => {
    const html = renderToStaticMarkup(
      <FarmWorkshopPanel tab="乾坤寶囊" warehouse={warehouse} busy={false} transact={async () => true} />,
    );
    expect(html).not.toContain('aria-label="盆栽庫存格位"');
    expect(html).not.toContain("盆栽總數：");
    expect(html).toContain("盆栽合成");
  });

  it("defines 36 distinct species-and-grade slots", () => {
    const keys = FARM_V2_LANDS.flatMap((land) =>
      POT_GRADES.map((grade) => `${land.id}:${grade}`),
    );
    expect(keys).toHaveLength(36);
    expect(new Set(keys).size).toBe(36);
  });
});
