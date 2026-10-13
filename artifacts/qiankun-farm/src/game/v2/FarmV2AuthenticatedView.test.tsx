import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FarmV2AuthenticatedView } from "./FarmV2AuthenticatedView";
import { mapServerLands } from "./farmV2SceneAdapter";
import { createFarmV2SceneEntities } from "./farmV2SceneWorld";
import { createMissionState, recordMissionEvent } from "./missionRuntime";
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
      coinLandHistory: { 2: true, 3: true },
      entities: createFarmV2SceneEntities(plots),
      seedInventory: { yaojin: 20 },
      cropInventory: {},
      serverTime: 0,
      receivedAt: Date.now(),
      missions: createMissionState(0),
      materialInventory: { "蘊靈砂": 0, "九霄玉髓": 0 },
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

it('offers the explicit 88 coin land2 purchase only when never owned', async()=>{
 state.value.data.plots[1].unlocked=false;state.value.data.coinLandHistory={2:false,3:false};await mount();
 await act(async()=>renderer.root.findAllByType('button').find(b=>b.props['aria-label']==='幽熒沃土，尚未解鎖')!.props.onClick());
 const buy=renderer.root.findAllByType('button').find(b=>b.children.join('')==='支付 88 金幣，永久解鎖')!;
 expect(buy).toBeDefined();await act(async()=>buy.props.onClick());expect(state.value.mutate).toHaveBeenCalledWith('unlockCoinLand',2,undefined);
});
it('requires historical land2 before offering land3 and does not resell inactive owned land2',async()=>{
 state.value.data.plots[1].unlocked=false;state.value.data.plots[2].unlocked=false;state.value.data.coinLandHistory={2:false,3:false};await mount();
 await act(async()=>renderer.root.findAllByType('button').find(b=>b.props['aria-label']==='朱砂烈土，尚未解鎖')!.props.onClick());
 expect(renderer.root.findAllByType('button').find(b=>b.children.join('')==='支付 888 金幣，永久解鎖')!.props.disabled).toBe(true);
 state.value.data.coinLandHistory[2]=true;
 await act(async()=>renderer.update(<FarmV2AuthenticatedView apiBaseUrl="/api" launchToken="A"/>));
 expect(renderer.root.findAllByType('button').find(b=>b.children.join('')==='支付 888 金幣，永久解鎖')!.props.disabled).toBe(false);
 await act(async()=>renderer.root.findAllByType('button').find(b=>b.props['aria-label']==='幽熒沃土，尚未解鎖')!.props.onClick());
 expect(renderer.root.findAllByType('button').filter(b=>b.children.join('')==='支付 88 金幣，永久解鎖')).toHaveLength(0);
});

it("renders five growth stages from the server maturity time", async () => {
  const start = 1_000_000;
  const duration = 4 * 60 * 60 * 1000;
  const end = start + duration;
  const stages = [
    [0.1, "萌芽"],
    [0.3, "幼苗"],
    [0.55, "生長"],
    [0.8, "將熟"],
    [1, "成熟可收成"],
  ] as const;
  for (const [progress, label] of stages) {
    state.value.data.plots[0] = {
      ...state.value.data.plots[0],
      state: progress === 1 ? "ready" : "growing",
      growthHours: 4,
      growthEndTime: end,
    };
    state.value.data.entities = createFarmV2SceneEntities(state.value.data.plots);
    state.value.data.serverTime = start + duration * progress;
    state.value.data.receivedAt = Date.now();
    await mount();
    expect(renderer.root.findAllByType("span").some((node) =>
      node.children.join("").includes(label),
    )).toBe(true);
    if (progress === 1) {
      const land = renderer.root.findByProps({ "aria-label": "微芒凡土，已成熟" });
      await act(async () => land.props.onClick());
      expect(state.value.mutate).toHaveBeenCalledWith("harvest", 1, undefined);
    }
    await act(async () => renderer.unmount());
  }
});


it("shows server-owned mission progress, fixed reward labels and claim controls", async () => {
  const now = Date.parse("2026-10-13T10:00:00+08:00");
  let missions = createMissionState(now);
  missions = recordMissionEvent(missions, "SOW", now);
  state.value.data.missions = missions;
  await mount();
  const mission = renderer.root.findByProps({ "data-mission-id": "MISSION_D01" });
  expect(mission.findByType("strong").children.join("")).toBe("今日播種");
  expect(mission.findAllByType("p").map(node => node.children.join(""))).toContain("播種：可領取");
  expect(mission.findAllByType("p").map(node => node.children.join(""))).toContain("獎勵：2 金幣、蘊靈砂 × 1");
  const claim = mission.findAllByType("button").find(button => button.children.join("") === "領取任務獎勵")!;
  await act(async () => claim.props.onClick());
  expect(state.value.mutate).toHaveBeenCalledWith("claimMission", "MISSION_D01", undefined);
});

it("keeps all task controls disabled while a mission claim is pending", async () => {
  state.value.pendingRetry = { operation: "claimMission", missionId: "MISSION_D01" };
  await mount();
  const buttons = renderer.root.findAllByType("button");
  expect(buttons.some(button => button.children.join("") === "領取任務獎勵" && button.props.disabled)).toBe(true);
});


it("distinguishes a just-expired unclaimed mission from current progress", async () => {
  state.value.data.missions = { ...createMissionState(0), expiredMissionIds: ["MISSION_D01"] };
  await mount();
  const mission = renderer.root.findByProps({ "data-mission-id": "MISSION_D01" });
  expect(mission.findAllByType("p").map(node => node.children.join(""))).toContain("播種：逾期失效；本期 0／1");
  expect(mission.findAllByType("button").find(button => button.children.join("") === "領取任務獎勵")?.props.disabled).toBe(true);
});
