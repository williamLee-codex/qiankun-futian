// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { FarmWorkshopPanel } from "./FarmWorkshopPanel";
import type { WorkshopWarehouse } from "./workshopRuntime";
afterEach(()=>{cleanup();vi.useRealTimers();});
const start=Date.parse('2026-11-18T01:00:00Z');
function warehouse(): WorkshopWarehouse { return {seeds:{1:0,2:0,3:0,4:0,5:0,6:0},crops:{1:0,2:0,3:0,4:0,5:0,6:0},workshop:{pots:[],decor:[],potGallery:{},decorGallery:{},materials:{蘊靈砂:0,九霄玉髓:0},petFood:4,formations:[{id:'FORMATION_PREMIUM_V2',expiresAt:null},{id:'FORMATION_ATTEND',expiresAt:start+1000}]}}; }
it("moves an expired owned pet into its resting state without unlocking or feeding anything",()=>{
 vi.useFakeTimers();vi.setSystemTime(start);const transact=vi.fn(async()=>true);
 render(<FarmWorkshopPanel tab="靈寵" warehouse={warehouse()} pets={{owned:['乾坤麒麟'],activePetId:'乾坤麒麟',activeUntil:start+1000}} busy={false} transact={transact}/>);
 expect(screen.getByText(/活動中・截止/)).toBeTruthy();
 act(()=>vi.advanceTimersByTime(2000));
 expect(screen.queryByText(/活動中・截止/)).toBeNull();
 expect(screen.getByText('休息中（尚未啟用）')).toBeTruthy();
 expect(screen.getByText('已解鎖')).toBeTruthy();expect(transact).not.toHaveBeenCalled();
});
it("expires timed formation slots live while preserving the permanent premium formation",()=>{
 vi.useFakeTimers();vi.setSystemTime(start);const transact=vi.fn(async()=>true);
 render(<FarmWorkshopPanel tab="護陣" warehouse={warehouse()} busy={false} transact={transact}/>);
 const owned=()=>within(screen.getByRole("list",{name:"持有護陣道具"}));
 expect(owned().getByText('天道酬勤')).toBeTruthy();expect(owned().getByText('太虛星河大陣')).toBeTruthy();
 act(()=>vi.advanceTimersByTime(2000));
 expect(screen.queryByText('天道酬勤')).toBeNull();expect(owned().getByText('太虛星河大陣')).toBeTruthy();
 expect(owned().getByText('永久有效')).toBeTruthy();expect(transact).not.toHaveBeenCalled();
});
