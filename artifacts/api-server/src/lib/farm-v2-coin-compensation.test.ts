import { describe, expect, it } from "vitest";
import {
  decideCoinClaim,
  decideFarmV2CoinCompensation,
} from "./farm-v2-coin-compensation.policy";

const journal = (over: Partial<Parameters<typeof decideFarmV2CoinCompensation>[0]> = {}) => ({
  transactionState: "WALLET_APPLIED",
  walletCurrency: "coin",
  walletAmount: 120,
  walletTransaction: { command: { amount: 120, currency: "coin" } },
  ...over,
});

describe("coin compensation policy", () => {
  it("refunds a confirmed charge with no delivery in full", () => {
    expect(decideFarmV2CoinCompensation(journal())).toEqual({
      due: true,
      scope: "central",
      amount: 120,
      evidence: "CHARGED_NOT_DELIVERED",
    });
  });

  it("refunds an unknown charge outcome in full", () => {
    expect(decideFarmV2CoinCompensation(journal({ transactionState: "WALLET_PENDING" }))).toEqual({
      due: true,
      scope: "central",
      amount: 120,
      evidence: "CHARGE_OUTCOME_UNKNOWN",
    });
  });

  it("never refunds a delivered transaction", () => {
    expect(decideFarmV2CoinCompensation(journal({ transactionState: "COMPLETED" }))).toEqual({
      due: false,
      reason: "DELIVERED",
    });
  });

  it("never refunds twice", () => {
    for (const state of ["COMPENSATING", "COMPENSATED"])
      expect(decideFarmV2CoinCompensation(journal({ transactionState: state }))).toEqual({
        due: false,
        reason: "ALREADY_COMPENSATED",
      });
  });

  it("excludes crystals and every non-coin wallet", () => {
    for (const currency of ["crystal", "destiny_ticket", null])
      expect(decideFarmV2CoinCompensation(journal({ walletCurrency: currency }))).toEqual({
        due: false,
        reason: "NOT_A_COIN_WALLET",
      });
  });

  it("refuses to invent an amount", () => {
    for (const amount of [null, 0, -5, 1.5])
      expect(decideFarmV2CoinCompensation(journal({ walletAmount: amount }))).toEqual({
        due: false,
        reason: "NO_RECORDED_AMOUNT",
      });
  });

  it("needs a persisted wallet attempt before a pending request is refunded", () => {
    expect(
      decideFarmV2CoinCompensation(journal({ transactionState: "PENDING", walletTransaction: null })),
    ).toEqual({ due: false, reason: "NOT_CHARGED" });
    expect(
      decideFarmV2CoinCompensation(journal({ transactionState: "PENDING" })),
    ).toMatchObject({ due: true, evidence: "WALLET_CHARGE_ATTEMPTED" });
  });

  it("compensates the farm wallet on its own ledger", () => {
    expect(
      decideFarmV2CoinCompensation(
        journal({ walletTransaction: { settlement: "ATOMIC_FARM_COINS", command: {} } }),
      ),
    ).toMatchObject({ due: true, scope: "farm", amount: 120 });
  });

  it("leaves an unrecognised state alone", () => {
    expect(decideFarmV2CoinCompensation(journal({ transactionState: "WEIRD" }))).toEqual({
      due: false,
      reason: "UNKNOWN_STATE",
    });
  });
});

describe("coin compensation claim lease", () => {
  const now = new Date("2026-11-26T10:00:00.000Z");
  const base = {
    status: "claimed" as const,
    attempts: 1,
    now,
    timeoutSeconds: 120,
    maxAttempts: 8,
  };

  it("hands a stale claim to the next taker", () => {
    expect(
      decideCoinClaim({ ...base, claimedAt: "2026-11-26T09:57:00.000Z" }),
    ).toBe("take_over");
  });

  it("keeps a live claim with its owner", () => {
    expect(
      decideCoinClaim({ ...base, claimedAt: "2026-11-26T09:59:30.000Z" }),
    ).toBe("in_progress");
  });

  it("takes over a claim with no timestamp or a future one", () => {
    expect(decideCoinClaim({ ...base, claimedAt: null })).toBe("take_over");
    expect(
      decideCoinClaim({ ...base, claimedAt: "2026-11-26T10:05:00.000Z" }),
    ).toBe("take_over");
  });

  it("stops taking over once the attempt budget is spent", () => {
    expect(
      decideCoinClaim({
        ...base,
        attempts: 8,
        claimedAt: "2026-11-26T09:00:00.000Z",
      }),
    ).toBe("exhausted");
  });

  it("never reports a takeover for a posted or failed row", () => {
    expect(
      decideCoinClaim({
        ...base,
        status: "posted",
        claimedAt: "2026-11-26T09:00:00.000Z",
      }),
    ).toBe("in_progress");
  });
});
