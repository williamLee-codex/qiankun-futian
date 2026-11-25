import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFarmV2CorePaidQualification } from "./farm-v2-core-paid-value";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Farm V2 Core paid-value qualification", () => {
  it("rejects missing launch identity and unsafe Core origins", async () => {
    vi.stubEnv("REPLIT_APP_SHARED_SECRET", "secret");
    vi.stubEnv("PLATFORM_BASE_URL", "https://platform.example");
    await expect(fetchFarmV2CorePaidQualification("")).rejects.toThrow("FARM_PAID_VALUE_SYNC_NOT_CONFIGURED");
    vi.stubEnv("PLATFORM_BASE_URL", "http://remote.example");
    await expect(fetchFarmV2CorePaidQualification("token")).rejects.toThrow("INVALID_FARM_PLATFORM_BASE_URL");
  });

  it("only accepts a nonnegative safe integer from Core", async () => {
    vi.stubEnv("REPLIT_APP_SHARED_SECRET", "secret");
    vi.stubEnv("PLATFORM_BASE_URL", "https://platform.example");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ effectivePaidCrystals: 300 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchFarmV2CorePaidQualification("token")).resolves.toBe(300);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.toString()).toBe("https://platform.example/api/replit/farm-v2/paid-value");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body)).toEqual({ launchToken: "token" });
    for (const invalid of [-1, 0.5, "300", Number.MAX_SAFE_INTEGER + 1]) {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ effectivePaidCrystals: invalid }) });
      await expect(fetchFarmV2CorePaidQualification("token")).rejects.toThrow("FARM_PAID_VALUE_INVALID_CORE_RESPONSE");
    }
  });

  it("fails closed when Core refuses the lookup", async () => {
    vi.stubEnv("REPLIT_APP_SHARED_SECRET", "secret");
    vi.stubEnv("PLATFORM_BASE_URL", "https://platform.example");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    await expect(fetchFarmV2CorePaidQualification("expired")).rejects.toThrow("FARM_PAID_VALUE_CORE_UNAVAILABLE");
  });
});
