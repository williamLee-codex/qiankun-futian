import { describe, expect, it } from "vitest";
import { planCoinShortfall, shortfallImage, shortfallWalletForCode } from "./coinShortfall";

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

  it("uses dedicated shortfall artwork, never the conversion artwork", () => {
    expect(shortfallImage("central")).toBe("/images/farm/coin-shortfall-central.png");
    expect(shortfallImage("farm")).toBe("/images/farm/coin-shortfall-farm.png");
    expect(shortfallImage("central")).not.toContain("coin-conversion");
    expect(shortfallImage("farm")).not.toContain("coin-conversion");
  });

  it("maps refusal codes to the wallet that has to be topped up", () => {
    expect(shortfallWalletForCode("CORE_COIN_INSUFFICIENT")).toBe("central");
    expect(shortfallWalletForCode("FARM_COIN_INSUFFICIENT")).toBe("farm");
    expect(shortfallWalletForCode("CRYSTAL_INSUFFICIENT")).toBe("crystal");
    expect(shortfallWalletForCode("FARM_LAND_BUSY")).toBeNull();
  });
});

describe("resumesPendingPurchase", () => {
  it("resumes only when the paying wallet can cover the price", async () => {
    const { resumesPendingPurchase } = await import("./coinShortfall");
    expect(resumesPendingPurchase({ paying: "central", required: 100, payingBalance: 100, otherBalance: 0 })).toBe(true);
    expect(resumesPendingPurchase({ paying: "central", required: 100, payingBalance: 40, otherBalance: 0 })).toBe(false);
  });
});
