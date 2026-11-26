import { it, expect, vi, afterEach } from "vitest";
const { query, update } = vi.hoisted(() => ({
  query: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@workspace/db", () => ({
  db: {},
  farmV2MutationTable: { userId: "user", requestId: "request" },
  createDatabaseConnection: () => ({ pool: {}, db: {} }),
}));
import {
  localCoinTransaction,
  postLocalCoin,
  bankError,
} from "./farm-v2-local-coins";
import { applyFarmV2WalletStep } from "./farm-v2-wallet-saga";
afterEach(() => vi.restoreAllMocks());
it("new local coin settlement uses the asset transaction and makes no central HTTP call", async () => {
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("central must not be contacted"));
  const journal: any = { set: () => journal, where: async () => {} };
  const tx: any = {
    execute: query.mockResolvedValue({
      rows: [{ result: { id: "ledger-1", duplicate: false, coins: 9 } }],
    }),
    update: update.mockReturnValue(journal),
  };
  const result = await localCoinTransaction.run(tx, () =>
    applyFarmV2WalletStep({
      userId: "u",
      requestId: "request",
      amount: 1,
      currency: "coin",
      direction: "debit",
      launchToken: "credential",
      reason: "farm_seed_purchase",
      referenceId: "1:1",
      referenceType: "farm_seed_pack",
    }),
  );
  expect(result.wallet.id).toBe("farm:u");
  expect(result.transaction.id).toBe("ledger-1");
  expect(fetch).not.toHaveBeenCalled();
  expect(update).toHaveBeenCalledTimes(1);
});
it("local SQL errors retain a stable insufficient funds code", async () => {
  const tx: any = {
    execute: async () => {
      throw { cause: { code: "P0001", message: "FARM_COIN_INSUFFICIENT" } };
    },
  };
  await expect(
    postLocalCoin(tx, {
      userId: "u",
      requestId: "r",
      amount: 1,
      currency: "coin",
      direction: "debit",
      launchToken: "x",
      reason: "farm_seed_purchase",
      referenceId: "1:1",
      referenceType: "farm_seed_pack",
    }),
  ).rejects.toThrow("FARM_COIN_INSUFFICIENT");
});
it("unknown database failures are not mislabeled as rejected transactions", () => {
  const error = new Error("connection lost");
  expect(() => bankError(error)).toThrow(error);
});
