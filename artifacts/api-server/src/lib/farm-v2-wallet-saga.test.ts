import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  record: null as any,
  wallet: vi.fn(),
  updates: [] as any[],
}));
vi.mock("@workspace/db", async () => ({
  ...(await import("../../../../lib/db/src/schema")),
  walletJournalDb: {
    query: { farmV2MutationTable: { findFirst: async () => state.record } },
    update: () => ({
      set: (values: any) => ({
        where: async () => {
          state.updates.push(values);
          Object.assign(state.record, values);
        },
      }),
    }),
  },
}));
vi.mock("./farm-v2-wallet-client", async () => ({
  ...(await vi.importActual("./farm-v2-wallet-client")),
  mutateFarmV2Wallet: state.wallet,
}));
import {
  applyFarmV2WalletStep,
  compensateFarmV2WalletStep,
} from "./farm-v2-wallet-saga";
const input = {
  userId: "alice",
  requestId: "same-request",
  launchToken: "test-only",
  amount: 2,
  currency: "coin" as const,
  direction: "credit" as const,
  reason: "farm_crop_exchange",
  referenceId: "1:10",
  referenceType: "farm_crop_exchange",
};
beforeEach(() => {
  state.record = { transactionState: "PENDING", walletAmount: null };
  state.updates = [];
  state.wallet.mockReset();
});
describe("TX-IDEMPOTENCY-001 wallet intent recovery (mocked persistence boundary)", () => {
  it("persists exact intent before Core, then persists receipt before Farm commit", async () => {
    state.wallet.mockImplementation(async () => {
      expect(state.record.walletAmount).toBe(2);
      expect(state.record.walletDirection).toBe("credit");
      return {
        duplicate: false,
        transaction: { id: "receipt" },
        wallet: { id: "wallet" },
      };
    });
    await applyFarmV2WalletStep(input);
    expect(state.record.transactionState).toBe("WALLET_APPLIED");
    await applyFarmV2WalletStep(input);
    expect(state.wallet).toHaveBeenCalledTimes(1);
  });
  it("lost Core response preserves amount and reuses the same request", async () => {
    state.wallet
      .mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce({
        duplicate: true,
        transaction: { id: "receipt" },
        wallet: { id: "wallet" },
      });
    await expect(applyFarmV2WalletStep(input)).rejects.toThrow("network lost");
    expect(state.record.walletAmount).toBe(2);
    await expect(
      applyFarmV2WalletStep({ ...input, amount: 3 }),
    ).rejects.toThrow("FARM_WALLET_INTENT_MISMATCH");
    await applyFarmV2WalletStep(input);
    expect(state.wallet.mock.calls.map((c) => c[0].requestId)).toEqual([
      "same-request",
      "same-request",
    ]);
  });
  it("marks compensation before Core and never compensates completed Farm state", async () => {
    Object.assign(state.record, {
      transactionState: "WALLET_APPLIED",
      walletDirection: "credit",
      walletCurrency: "coin",
      walletAmount: 2,
      walletTransaction: { transaction: { id: "primary" } },
    });
    state.wallet.mockImplementation(async (arg) => {
      expect(state.record.transactionState).toBe("COMPENSATING");
      expect(arg.direction).toBe("debit");
      expect(arg.idempotencySuffix).toBe("compensation");
      return {
        duplicate: false,
        transaction: { id: "compensation" },
        wallet: { id: "wallet" },
      };
    });
    await compensateFarmV2WalletStep(input);
    expect(state.record.transactionState).toBe("COMPENSATED");
    state.record.transactionState = "COMPLETED";
    await expect(compensateFarmV2WalletStep(input)).rejects.toThrow(
      "COMPLETED_MUTATION_CANNOT_BE_COMPENSATED",
    );
    expect(state.wallet).toHaveBeenCalledTimes(1);
  });
});
