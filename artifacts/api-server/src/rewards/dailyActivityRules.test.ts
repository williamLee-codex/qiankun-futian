import { describe, expect, it } from "vitest";
import { activitySnapshot, selectDailyActivityTasks, taipeiActivityDate } from "./dailyActivityRules";

describe("Farm V2 daily activity rules", () => {
  it("resets at 05:00 Taipei time, not midnight", () => {
    expect(taipeiActivityDate(new Date("2026-11-13T20:59:59Z"))).toBe("2026-11-13");
    expect(taipeiActivityDate(new Date("2026-11-13T21:00:00Z"))).toBe("2026-11-14");
  });
  it("selects exactly six stable, distinct tasks", () => {
    const first = selectDailyActivityTasks("player-a", "2026-11-14");
    expect(first).toHaveLength(6);
    expect(new Set(first.map(t => t.id)).size).toBe(6);
    expect(selectDailyActivityTasks("player-a", "2026-11-14")).toEqual(first);
  });
  it("scores only completed server events and gates the 30/60/100 milestones", () => {
    const tasks = selectDailyActivityTasks("player-b", "2026-11-14");
    const counters = { plant: 99, harvest: 99, buy_seeds: 99, open_warehouse: 99, view_pet: 99, visit_friend: 99, friend_interaction: 99 };
    const full = activitySnapshot(tasks, counters);
    expect(full.points).toBe(120);
    expect(full.milestones.map(m => m.eligible)).toEqual([true,true,true]);
    const empty = activitySnapshot(tasks, {});
    expect(empty.points).toBe(0);
    expect(empty.milestones.map(m => m.eligible)).toEqual([false,false,false]);
    expect(activitySnapshot(tasks, { plant: -1 })).toThrow("INVALID_ACTIVITY_COUNTER");
  });
});
