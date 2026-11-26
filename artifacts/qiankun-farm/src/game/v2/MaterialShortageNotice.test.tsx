// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PotSynthesisGrid } from "./PotSynthesisGrid";
import { MaterialShortageNotice } from "./MaterialShortageNotice";
import {
  materialShortageLine,
  materialShortageTitle,
  readMaterialShortages,
} from "./materialShortageNotice";
import type { WorkshopWarehouse } from "./workshopRuntime";

const shortages = [
  { material: "蘊靈砂", name: "蘊靈砂", required: 6, held: 4, missing: 2 },
  { material: "九霄玉髓", name: "九霄玉髓", required: 3, held: 1, missing: 2 },
];
const warehouse = (): WorkshopWarehouse => ({
  seeds: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  crops: { 1: 3, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
  workshop: {
    pots: [],
    decor: [],
    potGallery: {},
    decorGallery: {},
    materials: { 蘊靈砂: 4, 九霄玉髓: 1 },
  },
});
afterEach(cleanup);

describe("material shortage wording", () => {
  it("uses the approved title", () => {
    expect(materialShortageTitle).toBe("您的合成材料不足");
  });

  it("states name, required, held and missing for one material", () => {
    expect(materialShortageLine(shortages[0])).toBe("蘊靈砂：需求 6、持有 4、不足 2。");
  });

  it("reads the server details and ignores malformed rows", () => {
    expect(readMaterialShortages({ shortages })).toEqual(shortages);
    expect(readMaterialShortages(undefined)).toEqual([]);
    expect(readMaterialShortages({})).toEqual([]);
    expect(readMaterialShortages({ shortages: "蘊靈砂" })).toEqual([]);
    expect(
      readMaterialShortages({
        shortages: [{ material: "蘊靈砂", name: "蘊靈砂", required: 6, held: 4 }],
      }),
    ).toEqual([]);
    expect(
      readMaterialShortages({
        shortages: [{ material: "蘊靈砂", name: "蘊靈砂", required: 6, held: 4, missing: 0 }],
      }),
    ).toEqual([]);
  });
});

describe("material shortage notice", () => {
  it("lists every short material as a normal status, not a fault", () => {
    const { container } = render(<MaterialShortageNotice shortages={shortages} onClose={() => {}} />);
    const notice = container.querySelector(".farm-v2-material-shortage")!;
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.textContent).toContain("您的合成材料不足");
    expect(notice.textContent).toContain("蘊靈砂：需求 6、持有 4、不足 2。");
    expect(notice.textContent).toContain("九霄玉髓：需求 3、持有 1、不足 2。");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("closes without leaving the synthesis panel", () => {
    const onClose = vi.fn();
    render(<MaterialShortageNotice shortages={shortages} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("synthesis refusal stays on the same interface", () => {
  it("shows the shortfall and keeps the chosen product and quantity", async () => {
    const clear = vi.fn();
    const { container } = render(
      <PotSynthesisGrid
        warehouse={warehouse()}
        busy={false}
        readWallet={async () => ({ coins: 100 })}
        transact={async () => false}
        materialShortages={shortages}
        clearMaterialShortages={clear}
      />,
    );
    expect(
      container.querySelector(".farm-v2-material-shortage")!.textContent,
    ).toContain("您的合成材料不足");
    // The recipe the player was looking at is still selected.
    expect(screen.getByText("4 / 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    await waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
  });

  it("returns to the recipe with the product and quantity intact after a refusal", async () => {
    const { container } = render(
      <PotSynthesisGrid
        warehouse={warehouse()}
        busy={false}
        readWallet={async () => ({ coins: 100 })}
        transact={async () => false}
        materialShortages={shortages}
        clearMaterialShortages={() => {}}
      />,
    );
    const button = screen.getByRole("button", { name: "合成黃階盆栽" });
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    fireEvent.click(button);
    // The recipe and its quantity survive, and no uncertain-transaction text
    // replaces the normal shortfall notice.
    await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
    expect(screen.getByText("4 / 1")).toBeTruthy();
    expect(container.querySelector(".farm-v2-material-shortage")).toBeTruthy();
    expect(screen.queryByText(/尚未確認合成結果/)).toBeNull();
  });

  it("shows no notice when nothing is short", () => {
    render(
      <PotSynthesisGrid
        warehouse={warehouse()}
        busy={false}
        readWallet={async () => ({ coins: 100 })}
        transact={async () => true}
      />,
    );
    expect(screen.queryByText("您的合成材料不足")).toBeNull();
  });
});
