// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { FarmV2AuthenticatedView } from "./FarmV2AuthenticatedView";
import { mapServerLands, mapServerWarehouse } from "./farmV2SceneAdapter";
const { scene } = vi.hoisted(() => ({ scene: vi.fn() }));
vi.mock("./useFarmV2Scene", () => ({ useFarmV2Scene: scene }));
afterEach(cleanup);
function showFarm(secondUnlocked = false) {
  vi.stubGlobal("matchMedia", () => ({ matches:true,addEventListener(){},removeEventListener(){} }));
  const warehouse = { seeds: {1:0,2:10,3:0,4:0,5:0,6:0}, crops: {1:0,2:0,3:0,4:0,5:0,6:0} };
  scene.mockReturnValue({ loading:false,busy:false,error:null,pendingWorkshop:[],pendingFriends:[],mutate:vi.fn(),
    data: { pets:{owned:["噬時諦聽","乾坤麒麟"],activePetId:null,activeUntil:null},farmer:{entitled:true,enabledByLand:{1:true,2:true,3:true,4:true,5:true,6:true}},warehouse, ...mapServerWarehouse(warehouse), plots:mapServerLands([1,2,3,4,5,6].map(landId => ({
      landId,lifecycle:landId===1 || (landId===2 && secondUnlocked)?"EMPTY":"LOCKED",accessActive:landId===1 || (landId===2 && secondUnlocked),
      plantedQuantity:0,plantedAt:null,maturesAt:null
    }))) } });
  render(<FarmV2AuthenticatedView apiBaseUrl="https://farm.test/api/" launchToken="verified"/>);
}
it("locked second field offers its coin unlock and cannot buy seeds", () => {
  showFarm();
  fireEvent.click(screen.getByRole("button",{name:"幽熒沃土，未解鎖"}));
  expect((screen.getByRole("button",{name:"解鎖田地（88 金幣）"}) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByRole("button",{name:/購買.*種子/})).toBeNull();
});
it("third-field unlock requires the second field", () => {
  showFarm();
  fireEvent.click(screen.getByRole("button",{name:"朱砂烈土，未解鎖"}));
  expect((screen.getByRole("button",{name:"解鎖田地（888 金幣）"}) as HTMLButtonElement).disabled).toBe(true);
});
it("third-field unlock is available after second-field unlock", () => {
  showFarm(true);
  fireEvent.click(screen.getByRole("button",{name:"朱砂烈土，未解鎖"}));
  expect((screen.getByRole("button",{name:"解鎖田地（888 金幣）"}) as HTMLButtonElement).disabled).toBe(false);
});

it("renders owned resting pets, an entitled farmer, and both inventory entrances", () => {
  showFarm();
  expect(screen.getByRole("img",{name:"噬時諦聽"})).toBeTruthy();
  expect(screen.getByRole("img",{name:"乾坤麒麟"})).toBeTruthy();
  expect(screen.getByRole("img",{name:"微芒凡土專屬農夫值勤中"})).toBeTruthy();
  expect(screen.getByRole("navigation",{name:"福田主要入口"})).toBeTruthy();
  fireEvent.click(within(screen.getByRole("navigation",{name:"福田主要入口"})).getByRole("button",{name:"福田倉庫"}));
  expect(screen.getByRole("region",{name:"福田倉庫庫存"})).toBeTruthy();
});
