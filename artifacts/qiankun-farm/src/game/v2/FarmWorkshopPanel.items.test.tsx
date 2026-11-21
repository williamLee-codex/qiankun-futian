// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FarmWorkshopPanel } from "./FarmWorkshopPanel";
import { FARM_V2_PETS } from "./petRuntime";
import type { WorkshopWarehouse } from "./workshopRuntime";

afterEach(cleanup);
const warehouse: WorkshopWarehouse = {
  seeds: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  crops: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  workshop: {
    pots: [],
    decor: [],
    potGallery: {},
    decorGallery: {},
    materials: { 蘊靈砂: 5, 九霄玉髓: 4 },
    petFood: 2,
    formations: [
      { id: "FORMATION_PREMIUM_V2", expiresAt: null },
      { id: "FORMATION_ACHIEVEMENT_01", expiresAt: Date.now() + 86400000 },
    ],
    activeFormation: "FORMATION_PREMIUM_V2",
  },
};

describe("Qiankun bag game-style grid", () => {
  it("renders material slots as grid items with counts", () => {
    const html = render(
      <FarmWorkshopPanel tab="乾坤寶囊" warehouse={warehouse} busy={false} transact={async () => true} />,
    );
    const list = screen.getByRole("list", { name: "材料背包格子" });
    expect(list.querySelectorAll('[role="listitem"]')).toHaveLength(2);
    expect(screen.getByText("蘊靈砂")).toBeTruthy();
    expect(screen.getByText("×5")).toBeTruthy();
    cleanup();
  });
});

describe("Pets card catalogue", () => {
  it("shows every pet with unlock state and feed gating from server food", () => {
    render(
      <FarmWorkshopPanel
        tab="靈寵"
        warehouse={warehouse}
        busy={false}
        transact={async () => true}
        pets={{ owned: ["尋星犬"], activePetId: "尋星犬", activeUntil: Date.now() + 3600000 }}
      />,
    );
    const catalogue = screen.getByRole("list", { name: "靈獸圖鑑" });
    expect(catalogue.querySelectorAll('[role="listitem"]')).toHaveLength(FARM_V2_PETS.length);
    expect(screen.getByText("已解鎖")).toBeTruthy();
    expect(screen.getByText(/活動中・截止/)).toBeTruthy();
    // 尋星犬 (1 food) is feedable with 2 food in stock; 辟邪狻猊 is not owned yet.
    expect(screen.getByRole("button", { name: "餵食" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "取得" })).toBeTruthy();
    cleanup();
  });

  it("opens the official pet description panel on demand", () => {
    render(
      <FarmWorkshopPanel tab="靈寵" warehouse={warehouse} busy={false} transact={async () => true} pets={{ owned: [], activePetId: null, activeUntil: null }} />,
    );
    const describeButtons = screen.getAllByRole("button", { name: "說明" });
    fireEvent.click(describeButtons[0]);
    expect(screen.getByLabelText("尋星犬靈獸說明")).toBeTruthy();
    expect(screen.getByAltText("尋星犬正式能力說明圖")).toBeTruthy();
    cleanup();
  });
});

describe("Formation item cards", () => {
  it("lists owned formations with expiry, equip state and equip/unequip actions", () => {
    const transact = vi.fn(async () => true);
    render(<FarmWorkshopPanel tab="護陣" warehouse={warehouse} busy={false} transact={transact} />);
    const list = screen.getByRole("list", { name: "持有護陣道具" });
    expect(list.querySelectorAll('[role="listitem"]')).toHaveLength(2);
    expect(screen.getByText("永久有效")).toBeTruthy();
    expect(screen.getByText(/有效至/)).toBeTruthy();
    expect(screen.getByText("裝備中")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "卸下" }));
    expect(transact).toHaveBeenCalledWith({ kind: "switchFormation", formationId: null });
    fireEvent.click(screen.getByRole("button", { name: "裝備" }));
    expect(transact).toHaveBeenCalledWith({ kind: "switchFormation", formationId: "FORMATION_ACHIEVEMENT_01" });
    cleanup();
  });
});

describe("Individual scene pet selection", () => {
  it.each(FARM_V2_PETS)("keeps $id artwork and description separate", pet => {
    render(<FarmWorkshopPanel tab="靈寵" petId={pet.id} warehouse={warehouse} busy={false} transact={async()=>true} pets={{owned:[pet.id],activePetId:null,activeUntil:null}} />);
    const list=screen.getByRole("list",{name:"靈獸圖鑑"});
    expect(list.querySelectorAll('[role="listitem"]')).toHaveLength(1);
    expect(screen.getByAltText(`${pet.id}正式角色圖片`)).toBeTruthy();
    expect(screen.getByAltText(`${pet.id}正式能力說明圖`)).toBeTruthy();
    for(const other of FARM_V2_PETS.filter(item=>item.id!==pet.id)) expect(screen.queryByAltText(`${other.id}正式角色圖片`)).toBeNull();
    cleanup();
  });
});
