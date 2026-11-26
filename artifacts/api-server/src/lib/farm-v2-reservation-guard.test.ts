import { describe, expect, it } from "vitest";
import { planReservedLands } from "./farm-v2-reservation-guard";

const plan = (before: unknown, state: unknown) => ({ before, state });

describe("reserved workshop assets", () => {
  it("fences only the lands whose stored crops the plan changes", () => {
    const reserved = planReservedLands(
      plan(
        { crops: { 1: 20, 2: 10 }, workshop: { pots: 0 } },
        { crops: { 1: 17, 2: 10 }, workshop: { pots: 1 } },
      ),
    );
    expect(reserved).toEqual([1]);
    expect(reserved).not.toContain(2);
  });

  it("keeps an unreadable plan whole so its owner must recover it", () => {
    expect(planReservedLands(null)).toEqual([]);
    expect(planReservedLands({ reserved: true })).toEqual([]);
    expect(planReservedLands(plan({}, {}))).toEqual([]);
  });

  it("ignores quantity changes that leave every land's crops intact", () => {
    const reserved = planReservedLands(
      plan({ coins: 100, pots: 1 }, { coins: 112, pots: 2 }),
    );
    expect(reserved).toEqual([]);
  });
});
