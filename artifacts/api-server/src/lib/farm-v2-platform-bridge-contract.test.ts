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
