// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FarmV2AuthenticatedView } from "./FarmV2AuthenticatedView";
import { mapServerLands, mapServerWarehouse } from "./farmV2SceneAdapter";
const { scene } = vi.hoisted(() => ({ scene: vi.fn() }));
vi.mock("./useFarmV2Scene", () => ({ useFarmV2Scene: scene }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function show(mature = false, desktop = true) {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: desktop, addEventListener(){}, removeEventListener(){} }));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    const crop = this.classList.contains("farm-v2-crop-stage");
    const warehouse = this.classList.contains("farm-v2-warehouse-building");
    const x = warehouse ? 700 : crop ? 210 : 200;
    const y = warehouse ? 100 : crop ? 320 : 300;
    const width = crop ? 30 : 100, height = crop ? 40 : 100;
    return { x, y, width, height, left:x, top:y, right:x+width, bottom:y+height, toJSON(){} };
  });
  let finish!: (ok: boolean) => void;
  const mutate = vi.fn(() => new Promise<boolean>(resolve => { finish = resolve; }));
  const warehouse = { seeds:{1:20,2:0,3:0,4:0,5:0,6:0}, crops:{1:0,2:0,3:0,4:0,5:0,6:0} };
  scene.mockReturnValue({ loading:false, busy:false, error:null, mutate, pendingWorkshop:[], pendingFriends:[],
    data:{ warehouse, ...mapServerWarehouse(warehouse), plots:mapServerLands([1,2,3,4,5,6].map(landId => ({
      landId, lifecycle:landId === 1 ? mature ? "MATURE" : "EMPTY" : "LOCKED", accessActive:landId === 1,
      plantedQuantity:mature && landId === 1 ? 20 : 0, plantedAt:mature ? Date.now()-15000000 : null, maturesAt:mature ? Date.now()-1000 : null,
    }))) } });
  const view = render(<FarmV2AuthenticatedView apiBaseUrl="https://farm.test/api/" launchToken="verified"/>);
  return { ...view, mutate, finish:(ok:boolean)=>finish(ok), flight:()=>view.container.querySelector<HTMLElement>(".farm-v2-flight") };
}
for (const desktop of [true, false]) {
  it(`flies seeds to the clicked field and rejects rapid duplicate actions (${desktop ? "desktop" : "mobile"})`, async () => {
    const v = show(false, desktop);
    const field = screen.getByRole("button",{name:"微芒凡土，待播種"});
    fireEvent.click(field, {detail:1,clientX:230,clientY:350});
    fireEvent.click(field);
    expect(v.mutate).toHaveBeenCalledTimes(1);
    expect(v.flight()?.style.left).toBe("750px");
    expect(v.flight()?.style.top).toBe("180px");
    expect(v.flight()?.style.getPropertyValue("--farm-flight-x")).toBe("-520px");
    expect(v.flight()?.style.getPropertyValue("--farm-flight-y")).toBe("170px");
    fireEvent.animationEnd(v.flight()!);
    expect(v.flight()).not.toBeNull(); // No success before transaction confirmation.
    await act(async () => { v.finish(true); await vi.advanceTimersByTimeAsync(420); });
    expect(v.flight()?.classList.contains("confirmed")).toBe(true);
    fireEvent.animationEnd(v.flight()!);
    expect(v.flight()).toBeNull();
  });
}
it("flies a mature crop to the warehouse door and removes feedback on server failure", async () => {
  const v = show(true);
  fireEvent.click(screen.getByRole("button",{name:"微芒凡土，已成熟"}));
  expect(v.mutate).toHaveBeenCalledWith("harvest",1,undefined);
  expect(v.flight()?.style.left).toBe("225px");
  expect(v.flight()?.style.top).toBe("340px");
  expect(v.flight()?.style.getPropertyValue("--farm-flight-x")).toBe("525px");
  expect(v.flight()?.style.getPropertyValue("--farm-flight-y")).toBe("-160px");
  await act(async () => { v.finish(false); await vi.advanceTimersByTimeAsync(420); });
  expect(v.flight()).toBeNull();
  expect(screen.getByRole("button",{name:"微芒凡土，已成熟"})).toBeTruthy();
  expect(screen.getByText("操作未確認，請檢查錯誤並重新讀取。")).toBeTruthy();
});
