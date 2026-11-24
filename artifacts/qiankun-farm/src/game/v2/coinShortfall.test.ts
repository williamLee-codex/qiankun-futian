import { describe, expect, it } from "vitest";
import { planCoinShortfall, shortfallImage } from "./coinShortfall";

describe("coin shortfall planning", () => {
  it("converts from the other wallet into the paying wallet", () => {
    expect(
      planCoinShortfall({ paying: "central", required: 300, payingBalance: 100, otherBalance: 900 }),
    ).toEqual({ kind: "convert", from: "farm", to: "central", amount: 200 });
    expect(
      planCoinShortfall({ paying: "farm", required: 50, payingBalance: 0, otherBalance: 50 }),
    ).toEqual({ kind: "convert", from: "central", to: "farm", amount: 50 });
  });

  it("returns to the previous step when both wallets are short", () => {
    expect(
      planCoinShortfall({ paying: "farm", required: 50, payingBalance: 10, otherBalance: 39 }),
    ).toEqual({ kind: "blocked", code: "BOTH_INSUFFICIENT" });
  });

  it("never converts more than the exact shortfall", () => {
    const plan = planCoinShortfall({
      paying: "central",
      required: 120,
      payingBalance: 119,
      otherBalance: 10_000,
    });
    expect(plan).toMatchObject({ kind: "convert", amount: 1 });
  });

  it("treats an unreadable balance as blocked instead of sufficient", () => {
    expect(
      planCoinShortfall({ paying: "central", required: 1, payingBalance: null, otherBalance: 99 }),
    ).toEqual({ kind: "blocked", code: "BALANCE_UNAVAILABLE" });
    expect(
      planCoinShortfall({ paying: "central", required: 1, payingBalance: 0, otherBalance: null }),
    ).toEqual({ kind: "blocked", code: "BALANCE_UNAVAILABLE" });
  });

  it("reports sufficiency without proposing a conversion", () => {
    expect(
      planCoinShortfall({ paying: "farm", required: 5, payingBalance: 5, otherBalance: 0 }),
    ).toEqual({ kind: "sufficient" });
  });

  it("uses the approved artwork for each wallet", () => {
    expect(shortfallImage("central")).toBe("/images/farm/coin-conversion-final-approved.png");
    expect(shortfallImage("farm")).toBe("/images/farm/coin-conversion-approved.legacy.png");
  });
});
