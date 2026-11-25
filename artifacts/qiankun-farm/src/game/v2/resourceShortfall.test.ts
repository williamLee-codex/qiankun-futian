import { describe, expect, it } from "vitest";
import { planResourceShortfall } from "./resourceShortfall";

describe("planResourceShortfall", () => {
  it("is silent when the player can pay", () => {
    expect(planResourceShortfall("crystal", 5, 5, true)).toEqual({ kind: "sufficient" });
  });

  it("reports the exact missing amount", () => {
    const plan = planResourceShortfall("seed", 20, 6, true);
    expect(plan.kind).toBe("short");
    if (plan.kind !== "short") return;
    expect(plan.shortfall).toEqual({
      kind: "seed", label: "種子", required: 20, available: 6, missing: 14,
    });
  });

  it("offers the shop only when the resource can be bought", () => {
    expect(planResourceShortfall("material", 3, 1, true).kind === "short" &&
      (planResourceShortfall("material", 3, 1, true) as { actions: string[] }).actions).toEqual(["shop", "back"]);
    expect((planResourceShortfall("material", 3, 1, false) as { actions: string[] }).actions).toEqual(["back"]);
  });

  it("never invents a shortfall from unknown balances", () => {
    expect(planResourceShortfall("crystal", null, 3, true)).toEqual({ kind: "sufficient" });
    expect(planResourceShortfall("crystal", 3, null, true)).toEqual({ kind: "sufficient" });
  });
});
