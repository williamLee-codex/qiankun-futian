import { afterEach, describe, expect, it, vi } from "vitest";
import { mutateFarmV2Wallet } from "./farm-v2-wallet-client";

const input = {
  amount: 1,
  currency: "coin" as const,
  direction: "debit" as const,
  launchToken: "launch-token",
  reason: "farm_seed_purchase",
  referenceId: "1:1",
  referenceType: "farm_seed_pack",
  requestId: "request-1",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Farm V2 Core Wallet bridge", () => {
  it("rejects missing configuration and insecure platform URLs", async () => {
    await expect(mutateFarmV2Wallet(input)).rejects.toThrow("FARM_WALLET_BRIDGE_NOT_CONFIGURED");
    vi.stubEnv("REPLIT_APP_SHARED_SECRET", "secret");
    vi.stubEnv("PLATFORM_BASE_URL", "http://remote.example");
    await expect(mutateFarmV2Wallet(input)).rejects.toThrow("INVALID_FARM_PLATFORM_BASE_URL");
    vi.stubEnv("PLATFORM_BASE_URL", "https://user:pass@remote.example");
    await expect(mutateFarmV2Wallet(input)).rejects.toThrow("INVALID_FARM_PLATFORM_BASE_URL");
  });

  it("passes Core-authoritative transaction metadata and blocks redirects", async () => {
    vi.stubEnv("REPLIT_APP_SHARED_SECRET", "secret");
    vi.stubEnv("PLATFORM_BASE_URL", "https://platform.example");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ duplicate: false, transaction: { id: "tx-1" }, wallet: { id: "wallet-1" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(mutateFarmV2Wallet(input)).resolves.toMatchObject({ duplicate: false });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe("https://platform.example/api/replit/farm-v2/wallet");
    expect(init.redirect).toBe("error");
    expect(init.headers["x-replit-shared-secret"]).toBe("secret");
    expect(JSON.parse(init.body)).toMatchObject({
      launchToken: "launch-token",
      idempotencyKey: "farm-v2:request-1:primary:debit:coin",
      amount: 1,
      currency: "coin",
      direction: "debit",
    });
  });

  it("rejects an incomplete success response", async () => {
    vi.stubEnv("REPLIT_APP_SHARED_SECRET", "secret");
    vi.stubEnv("PLATFORM_BASE_URL", "https://platform.example");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ duplicate: false }),
    }));
    await expect(mutateFarmV2Wallet(input)).rejects.toThrow("INVALID_FARM_WALLET_BRIDGE_RESPONSE");
  });
});
