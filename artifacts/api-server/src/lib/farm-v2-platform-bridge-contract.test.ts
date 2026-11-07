import { afterEach, expect, it, vi } from "vitest";
import { farmV2PlatformConnection, requestFarmV2PlatformSession } from "./farm-v2-platform";
import { farmV2PlatformFetch } from "./farm-v2-platform-fetch";

vi.mock("./farm-v2-platform-fetch", () => ({ farmV2PlatformFetch: vi.fn() }));
const fetchMock = vi.mocked(farmV2PlatformFetch);

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

it("uses the legacy Replit header in existing Preview configurations", async () => {
  vi.stubEnv("PLATFORM_BASE_URL", "https://platform.example");
  vi.stubEnv("REPLIT_APP_SHARED_SECRET", "preview-only");
  vi.stubEnv("FARM_V2_BRIDGE_SHARED_SECRET", "");
  fetchMock.mockImplementationOnce(async (_url: URL, init: RequestInit) => {
    expect(new Headers(init.headers).get("x-replit-shared-secret")).toBe("preview-only");
    expect(new Headers(init.headers).has("x-farm-v2-shared-secret")).toBe(false);
    return Response.json({ revoked: true });
  });
  await expect(requestFarmV2PlatformSession("token", "revoke")).resolves.toEqual({ revoked: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("uses the explicit bridge header and secret for the deployed production Session route", async () => {
  vi.stubEnv("PLATFORM_BASE_URL", "https://platform.example");
  vi.stubEnv("REPLIT_APP_SHARED_SECRET", "legacy-only");
  vi.stubEnv("FARM_V2_BRIDGE_SHARED_SECRET", "bridge-only");
  expect(farmV2PlatformConnection().secret).toBe("legacy-only");
  fetchMock.mockImplementationOnce(async (_url: URL, init: RequestInit) => {
    expect(new Headers(init.headers).get("x-farm-v2-shared-secret")).toBe("bridge-only");
    expect(new Headers(init.headers).has("x-replit-shared-secret")).toBe(false);
    return Response.json({ revoked: true });
  });
  await expect(requestFarmV2PlatformSession("token", "revoke")).resolves.toEqual({ revoked: true });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("fails closed when neither shared secret is configured", () => {
  vi.stubEnv("PLATFORM_BASE_URL", "https://platform.example");
  vi.stubEnv("REPLIT_APP_SHARED_SECRET", "");
  vi.stubEnv("FARM_V2_BRIDGE_SHARED_SECRET", "");
  expect(() => farmV2PlatformConnection()).toThrow("FARM_SESSION_NOT_CONFIGURED");
});

it("exchanges a launch token with the production bridge header and validates session response", async () => {
  vi.stubEnv("PLATFORM_BASE_URL", "https://platform.example");
  vi.stubEnv("REPLIT_APP_SHARED_SECRET", "legacy-only");
  vi.stubEnv("FARM_V2_BRIDGE_SHARED_SECRET", "bridge-only");
  const sessionToken = "fvs1." + "A".repeat(43);
  fetchMock.mockImplementationOnce(async (url: URL, init: RequestInit) => {
    expect(url.pathname).toBe("/api/replit/farm-v2/session");
    expect(new Headers(init.headers).get("x-farm-v2-shared-secret")).toBe("bridge-only");
    expect(JSON.parse(String(init.body))).toEqual({ launchToken: "launch-token", action: "exchange" });
    return Response.json({
      sessionToken, userId: "user-1", appId: "qiankun-futian",
      expiresAt: "2026-11-08T00:00:00.000Z",
    });
  });
  await expect(requestFarmV2PlatformSession("launch-token", "exchange")).resolves.toEqual({
    sessionToken, userId: "user-1", expiresAt: "2026-11-08T00:00:00.000Z",
    reauthenticateUrl: "https://platform.example/api/apps/qiankun-futian/launch?farmV2=1",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("rejects unauthorized session exchange without retrying against the legacy header", async () => {
  vi.stubEnv("PLATFORM_BASE_URL", "https://platform.example");
  vi.stubEnv("REPLIT_APP_SHARED_SECRET", "legacy-only");
  vi.stubEnv("FARM_V2_BRIDGE_SHARED_SECRET", "bridge-only");
  fetchMock.mockResolvedValueOnce(Response.json({ error: "unauthorized" }, { status: 401 }));
  await expect(requestFarmV2PlatformSession("invalid-token", "exchange")).rejects.toThrow("FARM_SESSION_NOT_ACTIVE");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
