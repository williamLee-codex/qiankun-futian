// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { FarmWorkshopPanel } from "./FarmWorkshopPanel";
import { createMissionState, recordMissionEvent } from "./missionRuntime";

afterEach(() => { cleanup(); vi.useRealTimers(); });

it("does not offer yesterday's completed mission after Taipei 05:00", () => {
  const beforeReset = Date.parse("2026-11-08T20:59:00Z");
  const missions = recordMissionEvent(createMissionState(beforeReset), "SOW", beforeReset);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-08T21:03:00Z"));
  render(<FarmWorkshopPanel tab="任務" warehouse={{ seeds: {1:0,2:0,3:0,4:0,5:0,6:0}, crops: {1:0,2:0,3:0,4:0,5:0,6:0} }} missions={missions} busy={false} transact={async () => true} />);
  const sow = screen.getAllByRole("article")[0];
  expect(sow.textContent).toContain("播種・0/1");
  expect(within(sow).getByRole("button", {name:"領取"}).hasAttribute("disabled")).toBe(true);
  expect(missions.progress.MISSION_D01.completed).toBe(true);
});
