import { describe, expect, it } from "vitest";
import { decideFarmV2CoinCompensation } from "./farm-v2-coin-compensation.policy";

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
