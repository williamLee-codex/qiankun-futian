// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { FarmNewbieBoost } from "./FarmNewbieBoost";
import { NEWBIE_WINDOW_MS } from "./timeRuntime";
afterEach(() => { cleanup(); vi.useRealTimers(); });
const start = Date.parse("2026-11-18T01:00:00Z");
it("counts down the same server-owned 168h window to the second across all six fields", () => {
  vi.useFakeTimers(); vi.setSystemTime(start);
  render(<FarmNewbieBoost firstFarmEnteredAt={start}/>);
  expect(screen.getByText("7 天 0 小時 0 分 0 秒")).toBeTruthy();
  act(() => { vi.advanceTimersByTime(1000); });
  expect(screen.getByText("6 天 23 小時 59 分 59 秒")).toBeTruthy();
  act(() => { vi.setSystemTime(start+NEWBIE_WINDOW_MS); vi.advanceTimersByTime(1000); });
  expect(screen.getByText("活動已結束")).toBeTruthy();
});
it("does not present a future first-entry timestamp as an active boost", () => {
  vi.useFakeTimers(); vi.setSystemTime(start);
  render(<FarmNewbieBoost firstFarmEnteredAt={start+3600000}/>);
  expect(screen.getByText("資格待確認")).toBeTruthy();
  expect(screen.queryByText("活動已結束")).toBeNull();
});
it.each([null,undefined,0,-1,NaN,Infinity])("keeps missing/invalid entry evidence separate from expiry (%s)", value => {
 render(<FarmNewbieBoost firstFarmEnteredAt={value}/>);
 expect(screen.getByRole("status").textContent).toContain("無法判定");
 expect(screen.getByRole("status").textContent).not.toContain("活動已結束");
});
it("uses the existing illustrated close control without adding a second visible X", () => {
  const close = vi.fn();
  render(<FarmNewbieBoost firstFarmEnteredAt={start} onClose={close}/>);
  const button = screen.getByRole("button", { name: "關閉新手六倍公告" });
  expect(button.textContent).toBe("");
  button.click();
  expect(close).toHaveBeenCalledOnce();
});
