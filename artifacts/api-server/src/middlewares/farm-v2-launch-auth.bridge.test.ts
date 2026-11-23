import { afterEach, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
const { fetchPlatform } = vi.hoisted(() => ({ fetchPlatform: vi.fn() }));
vi.mock("../lib/farm-v2-platform-fetch", () => ({ farmV2PlatformFetch: fetchPlatform }));
import { requireFarmV2LaunchIdentity } from "./farm-v2-launch-auth";
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function request(token: string) { return { header: (name: string) => name === "authorization" ? `Bearer ${token}` : undefined } as unknown as Request; }
function response() { return { status: vi.fn().mockReturnThis(), json: vi.fn(), locals: {} } as unknown as Response; }
function configure() { vi.stubEnv("PLATFORM_BASE_URL", "https://platform.example"); vi.stubEnv("REPLIT_APP_SHARED_SECRET", ""); vi.stubEnv("FARM_V2_BRIDGE_SHARED_SECRET", "bridge-only"); vi.stubEnv("FARM_V2_IDENTITY_CACHE_ENABLED", "0"); }
it("validates opaque Sessions with only the dedicated server credential", async () => {
 configure(); fetchPlatform.mockResolvedValueOnce(Response.json({ userId: "verified-owner", appId: "qiankun-futian" })); const res=response(); const next=vi.fn();
 await requireFarmV2LaunchIdentity(request("fvs1." + "a".repeat(43)),res,next);
 expect(next).toHaveBeenCalledOnce(); expect(res.locals.authenticatedUserId).toBe("verified-owner");
 const [url,init]=fetchPlatform.mock.calls[0]; expect(url.pathname).toBe("/api/replit/farm-v2/identity"); expect(new Headers(init.headers).get("x-farm-v2-shared-secret")).toBe("bridge-only"); expect(new Headers(init.headers).has("x-replit-shared-secret")).toBe(false);
});
it("does not use the dedicated credential for legacy launch bootstrap", async () => {
 configure(); const res=response(); await requireFarmV2LaunchIdentity(request("legacy-launch-token"),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(503); expect(fetchPlatform).not.toHaveBeenCalled();
});
it("keeps missing credential failure closed before HTTP", async () => {
 configure(); vi.stubEnv("FARM_V2_BRIDGE_SHARED_SECRET", ""); const res=response(); await requireFarmV2LaunchIdentity(request("fvs1." + "a".repeat(43)),res,vi.fn());
 expect(res.status).toHaveBeenCalledWith(503); expect(fetchPlatform).not.toHaveBeenCalled();
});
it("rejects wrong-app Session identity and never retries", async () => {
 configure(); fetchPlatform.mockResolvedValueOnce(Response.json({ userId: "verified-owner", appId: "other-app" })); const res=response(); const next=vi.fn(); await requireFarmV2LaunchIdentity(request("fvs1." + "a".repeat(43)),res,next);
 expect(res.status).toHaveBeenCalledWith(403); expect(next).not.toHaveBeenCalled(); expect(fetchPlatform).toHaveBeenCalledOnce();
});
