import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
const { initialize, session, authority } = vi.hoisted(() => ({
  initialize: vi.fn(),
  session: vi.fn(),
  authority: vi.fn(),
}));
vi.mock("../lib/farm-v2-init", () => ({
  ensureFarmV2PlayerInitialized: initialize,
}));
vi.mock("../lib/farm-v2-platform", () => ({
  requestFarmV2PlatformSession: session,
  farmV2PlatformConnection: vi.fn(),
}));
vi.mock("../lib/farm-v2-authority", () => ({ withFarmAuthority: authority }));
vi.mock("../lib/farm-v2-sow", () => ({ sowFarmV2Land: vi.fn() }));
vi.mock("../lib/farm-v2-harvest", () => ({ harvestFarmV2Land: vi.fn() }));
vi.mock("../lib/farm-v2-seed-purchase", () => ({
  purchaseFarmV2SeedPacks: vi.fn(),
}));
vi.mock("../lib/farm-v2-crop-exchange", () => ({
  exchangeFarmV2Crops: vi.fn(),
}));
vi.mock("../lib/farm-v2-paid-access", () => ({
  reconcileFarmV2PaidAccessFromCore: vi.fn(),
}));
vi.mock("../lib/farm-v2-gameplay", () => ({
  claimFarmV2ChaosSeeds: vi.fn(),
  configureFarmV2Farmer: vi.fn(),
  settleFarmV2Farmer: vi.fn(),
}));
vi.mock("../lib/farm-v2-workshop", () => ({ mutateFarmV2Workshop: vi.fn() }));
vi.mock("../lib/farm-v2-friends", () => ({
  readFarmV2Friends: vi.fn(),
  visitFarmV2Cave: vi.fn(),
}));
import router from "./farm-v2";
let server: Server;
let base: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  app.get("/farm", (_req, res) => res.send("V1"));
  server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    ),
);
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
const paths = [
  "state",
  "workshop",
  "friends",
  "friends/someone/cave",
  "chaos/claim",
  "farmer/1",
  "session",
  "lands/6/sow",
  "lands/6/harvest",
  "seeds/6/purchase",
  "crops/6/exchange",
  "internal/effective-paid/reconcile",
];
it.each(paths)(
  "disabled entry blocks direct API %s with explicit parameters and credentials",
  async (path) => {
    vi.stubEnv("FARM_V2_ENTRY_ENABLED", "0");
    const response = await fetch(`${base}/api/farm/v2/${path}?farmV2=1`, {
      method: path === "state" ? "GET" : "POST",
      headers: {
        authorization: "Bearer credential",
        "content-type": "application/json",
      },
      ...(path !== "state"
        ? { body: JSON.stringify({ action: "exchange", farmV2: 1 }) }
        : {}),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "FARM_V2_ENTRY_DISABLED" });
    expect(initialize).not.toHaveBeenCalled();
    expect(session).not.toHaveBeenCalled();
    expect(authority).not.toHaveBeenCalled();
  },
);
it.each([undefined, "", "true"])("flag %s defaults to closed", async (flag) => {
  vi.stubEnv("FARM_V2_ENTRY_ENABLED", flag);
  const response = await fetch(`${base}/api/farm/v2/state`);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "FARM_V2_ENTRY_DISABLED" });
});
it.each(["state", "session"])(
  "enabled entry still rejects unauthenticated %s",
  async (path) => {
    vi.stubEnv("FARM_V2_ENTRY_ENABLED", "1");
    const response = await fetch(`${base}/api/farm/v2/${path}`, {
      method: path === "state" ? "GET" : "POST",
    });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "MISSING_LAUNCH_TOKEN" });
  },
);
it("enabled entry allows authenticated session exchange through platform verification", async () => {
  vi.stubEnv("FARM_V2_ENTRY_ENABLED", "1");
  session.mockResolvedValue({ sessionToken: "verified" });
  const response = await fetch(`${base}/api/farm/v2/session`, {
    method: "POST",
    headers: {
      authorization: "Bearer credential",
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "exchange" }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ sessionToken: "verified" });
  expect(session).toHaveBeenCalledWith("credential", "exchange");
});
it("closed entry preserves revocation verification and does not intercept V1", async () => {
  vi.stubEnv("FARM_V2_ENTRY_ENABLED", "0");
  session.mockResolvedValue({ revoked: true });
  const response = await fetch(`${base}/api/farm/v2/session`, {
    method: "POST",
    headers: {
      authorization: "Bearer credential",
      "content-type": "application/json",
    },
    body: JSON.stringify({ action: "revoke" }),
  });
  expect(response.status).toBe(200);
  expect(session).toHaveBeenCalledWith("credential", "revoke");
  const anonymous = await fetch(`${base}/api/farm/v2/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "revoke" }),
  });
  expect(anonymous.status).toBe(401);
  expect(await (await fetch(`${base}/farm`)).text()).toBe("V1");
});

it("platform closure overrides the farm flag for a previously issued direct launch", async () => {
  vi.stubEnv("FARM_V2_ENTRY_ENABLED", "1");
  vi.stubEnv("PLATFORM_BASE_URL", "https://platform.test");
  vi.stubEnv("REPLIT_APP_SHARED_SECRET", "test-only");
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    if (String(input).startsWith("https://platform.test")) {
      expect(JSON.parse(String(init?.body))).toEqual({
        launchToken: "credential",
        farmV2: true,
      });
      return new Response(JSON.stringify({ error: "FARM_V2_ENTRY_DISABLED" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  });
  const response = await fetch(`${base}/api/farm/v2/state?farmV2=1`, {
    headers: { authorization: "Bearer credential" },
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "FARM_V2_ENTRY_DISABLED" });
  expect(initialize).not.toHaveBeenCalled();
  expect(authority).not.toHaveBeenCalled();
});
