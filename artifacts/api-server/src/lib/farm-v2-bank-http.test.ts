import { it, expect, vi, afterEach } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@workspace/db", () => ({
  pool: { query },
  farmV2LandTable: {},
  farmV2PlayerStateTable: {},
}));
import { readFarmCoinBalances } from "./farm-v2-bank-http";
afterEach(() => {
  vi.restoreAllMocks();
  query.mockReset();
  delete process.env.FARM_V2_LOCAL_COINS_ENABLED;
});

it("reads the central ledger and reports Farm coins as zero while local coins are disabled", async () => {
  query.mockResolvedValue({ rows: [{ central: "6700" }] });
  const result = await readFarmCoinBalances("owner");
  expect(result).toEqual({ coins: 0, centralCoins: 6700, localCoinsEnabled: false });
  // The 6700 central coins must never be presented as a Farm balance.
  expect(result.coins).not.toBe(6700);
  expect(query).toHaveBeenCalledTimes(1);
});

it("rejects a non-integer central balance instead of showing a placeholder", async () => {
  query.mockResolvedValue({ rows: [{ central: "not-a-number" }] });
  await expect(readFarmCoinBalances("owner")).rejects.toThrow(
    "FARM_CENTRAL_BALANCE_UNAVAILABLE",
  );
});

it("uses the Farm bank ledger once local coins are enabled", async () => {
  process.env.FARM_V2_LOCAL_COINS_ENABLED = "1";
  query.mockResolvedValue({
    rows: [{ result: { coins: 42, centralCoins: 6700, localCoinsEnabled: true } }],
  });
  const result = await readFarmCoinBalances("owner");
  expect(result).toEqual({ coins: 42, centralCoins: 6700, localCoinsEnabled: true });
  expect(query.mock.calls[0][0]).toContain("farm_v2_bank.read_balances");
});
