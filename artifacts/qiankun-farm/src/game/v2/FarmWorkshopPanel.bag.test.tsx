import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FarmWorkshopPanel } from "./FarmWorkshopPanel";
import type { WorkshopWarehouse } from "./workshopRuntime";

const emptyWarehouse = (): WorkshopWarehouse => ({
  seeds: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  crops: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  workshop: {
    pots: [],
    decor: [],
    potGallery: {},
    decorGallery: {},
    materials: { 蘊靈砂: 2, 九霄玉髓: 3 },
  },
});

afterEach(cleanup);

describe("Qiankun bag categories", () => {
  it("keeps six bag categories separate from the workshop navigation", () => {
    render(
      <FarmWorkshopPanel
        tab="乾坤寶囊"
        warehouse={emptyWarehouse()}
        busy={false}
        transact={async () => true}
      />,
    );
    const categories = screen.getByRole("navigation", { name: "乾坤寶囊分類" });
    expect(categories.querySelectorAll("button")).toHaveLength(6);
    expect(screen.getByText("蘊靈砂：2")).toBeTruthy();
    expect(screen.getByText("九霄玉髓：3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "盆栽" }));
    expect(screen.getAllByText("持有 0 株")).toHaveLength(36);
    fireEvent.click(screen.getByRole("button", { name: "碎片" }));
    expect(screen.getByText("碎片庫存尚未接入。")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "外型" }));
    expect(screen.getByText("外型與稱號庫存尚未接入。")).toBeTruthy();
  });
});
