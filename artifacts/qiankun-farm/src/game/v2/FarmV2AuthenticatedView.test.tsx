import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FarmV2AuthenticatedView } from "./FarmV2AuthenticatedView";
import { mapServerLands } from "./farmV2SceneAdapter";
import { createFarmV2SceneEntities } from "./farmV2SceneWorld";
const state = vi.hoisted(() => ({ value: null as any }));
vi.mock("./useFarmV2Scene", () => ({ useFarmV2Scene: () => state.value }));
let renderer: ReactTestRenderer;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
    addEventListener() {},
    removeEventListener() {},
  });
  vi.stubGlobal("document", { body: { classList: { add() {}, remove() {} } } });
  const plots = mapServerLands(
    Array.from({ length: 6 }, (_, i) => ({
      landId: i + 1,
      lifecycle: "EMPTY" as const,
      accessActive: true,
      plantedQuantity: 0,
      maturesAt: null,
    })),
    0,
  );
  state.value = {
    data: {
      plots,
      entities: createFarmV2SceneEntities(plots),
      seedInventory: { yaojin: 20 },
      cropInventory: {},
      serverTime: 0,
      receivedAt: Date.now(),
      farmer: null,
      chaosPending: 0,
    },
    mutate: vi.fn(async () => true),
    refresh: vi.fn(),
    busy: false,
    loading: false,
    pendingRetry: null,
    error: null,
  };
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());

  vi.unstubAllGlobals();
});
async function mount(token = "A") {
  await act(async () => {
    renderer = create(
      <FarmV2AuthenticatedView apiBaseUrl="/api" launchToken={token} />,
    );
  });
}
const activate = () =>
  renderer.root
    .findAllByType("button")
    .find((b) => b.props["aria-label"] === "微芒凡土，待播種")!
    .props.onClick();
async function selectLand() {
  await mount();
  await act(async () => activate());
  state.value.mutate.mockClear();
}
it("purchases the chosen pack count through the existing server mutation", async () => {
  await selectLand();
  const input = renderer.root.findByProps({ "aria-label": "購買種子包數" });
  await act(async () => input.props.onChange({ target: { value: "3" } }));
  const buy = renderer.root
    .findAllByType("button")
    .find((b) => b.children.join("") === "購買 3 包種子（3 金幣）")!;
  await act(async () => buy.props.onClick());
  expect(state.value.mutate).toHaveBeenCalledWith("purchaseSeeds", 1, 3);
});
it("rejects empty, fractional, negative and unsafe pack counts before sending a purchase", async () => {
  await selectLand();
  for (const value of ["", "1.5", "-1", "0", "9007199254740992"]) {
    await act(async () =>
      renderer.root
        .findByProps({ "aria-label": "購買種子包數" })
        .props.onChange({ target: { value } }),
    );
    const buy = renderer.root
      .findAllByType("button")
      .find((b) => b.children.join("").startsWith("購買"))!;
    expect(buy.props.disabled).toBe(true);
  }
  expect(state.value.mutate).not.toHaveBeenCalled();
});

it("allows locked land seed purchases without sowing", async () => {
  state.value.data.plots[1].unlocked = false;
  await mount();
  await act(async () =>
    renderer.root
      .findAllByType("button")
      .find((b) => b.props["aria-label"] === "幽熒沃土，尚未解鎖")!
      .props.onClick(),
  );
  expect(state.value.mutate).not.toHaveBeenCalled();
  await act(async () =>
    renderer.root
      .findByProps({ "aria-label": "購買種子包數" })
      .props.onChange({ target: { value: "3" } }),
  );
  await act(async () =>
    renderer.root
      .findAllByType("button")
      .find((b) => b.children.join("") === "購買 3 包種子（3 金幣）")!
      .props.onClick(),
  );
  expect(state.value.mutate).toHaveBeenCalledWith("purchaseSeeds", 2, 3);
});
