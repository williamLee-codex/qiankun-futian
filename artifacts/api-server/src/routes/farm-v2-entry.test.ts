import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
const { initialize, session, authority } = vi.hoisted(() => ({
  initialize: vi.fn(),
  session: vi.fn(),
  authority: vi.fn(),
}));
// Entry-gate tests must never construct a real database pool.
vi.mock("@workspace/db", () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));
vi.mock("../lib/farm-v2-init", () => ({
  ensureFarmV2PlayerInitialized: initialize,
}));
vi.mock("../lib/farm-v2-platform", () => ({
  requestFarmV2PlatformSession: session,
  farmV2PlatformConnection: vi.fn(),
}));
vi.mock("../lib/farm-v2-authority", () => ({ withFarmAuthority: authority }));
vi.mock("../lib/farm-v2-sow", () => ({ sowFarmV2Land: vi.fn() }));
vi.mock("../lib/farm-v2-coin-land-unlock", () => ({ purchaseFarmV2CoinLand: vi.fn() }));
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
vi.mock("../lib/farm-v2-friend-actions", () => ({
  mutateFarmV2Friend: vi.fn(),
}));
vi.mock("../lib/farm-v2-friend-authority", () => ({
  withFarmFriendAuthority: vi.fn(),
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
  "friends/someone/actions",
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

it.each([
  { operation: "sow", recent: true },
  { operation: "sow", recent: false },
  { operation: "harvest", recent: true },
  { operation: "harvest", recent: false },
])("$operation uses recent paid qualification when available ($recent)", async ({ operation, recent }) => {
  const { pool } = await import("@workspace/db");
  const { sowFarmV2Land } = await import("../lib/farm-v2-sow");
  const { harvestFarmV2Land } = await import("../lib/farm-v2-harvest");
  const { reconcileFarmV2PaidAccessFromCore } = await import("../lib/farm-v2-paid-access");
  const { farmAuthorityContext } = await import("../lib/farm-v2-authority-context");
  const userId = "00000000-0000-0000-0000-000000000001";
  vi.stubEnv("FARM_V2_ENTRY_ENABLED", "1");
  vi.stubEnv("PLATFORM_BASE_URL", "https://platform.test");
  vi.stubEnv("REPLIT_APP_SHARED_SECRET", "test-only");
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
    String(input).startsWith("https://platform.test")
      ? Response.json({ userId, appId: "qiankun-futian" })
      : originalFetch(input, init),
  );
  vi.mocked(pool.query).mockResolvedValueOnce({ rows: recent ? [{}] : [] } as never);
  vi.mocked(sowFarmV2Land).mockResolvedValueOnce({} as never);
  vi.mocked(harvestFarmV2Land).mockResolvedValueOnce({} as never);
  authority.mockImplementationOnce(async (_input, run) =>
    farmAuthorityContext.run({ userId, operationId: "test", qualification: 600 }, run),
  );
  const response = await fetch(`${base}/api/farm/v2/lands/4/${operation}`, {
    method: "POST",
    headers: { authorization: "Bearer credential", "x-request-id": "sow-test" },
  });
  expect(response.status).toBe(200);
  expect(authority).toHaveBeenCalledTimes(recent ? 0 : 1);
  expect(reconcileFarmV2PaidAccessFromCore).toHaveBeenCalledTimes(recent ? 0 : 1);
  expect(operation === "sow" ? sowFarmV2Land : harvestFarmV2Land)
    .toHaveBeenCalledWith({ userId, requestId: "sow-test", landId: 4 });
});

it("seed purchase keeps wallet transaction authority even with recent paid qualification", async () => {
  const { pool } = await import("@workspace/db");
  const { purchaseFarmV2SeedPacks } = await import("../lib/farm-v2-seed-purchase");
  const { farmAuthorityContext } = await import("../lib/farm-v2-authority-context");
  const userId = "00000000-0000-0000-0000-000000000001";
  vi.stubEnv("FARM_V2_ENTRY_ENABLED", "1");
  vi.stubEnv("PLATFORM_BASE_URL", "https://platform.test");
  vi.stubEnv("REPLIT_APP_SHARED_SECRET", "test-only");
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
    String(input).startsWith("https://platform.test")
      ? Response.json({ userId, appId: "qiankun-futian" })
      : originalFetch(input, init),
  );
  vi.mocked(pool.query).mockResolvedValue({ rows: [{}] } as never);
  authority.mockImplementation(async (_input, run) =>
    farmAuthorityContext.run({ userId, operationId: "00000000-0000-4000-8000-000000000002", qualification: 600 }, run),
  );
  // The real Core wallet contract requires an operation UUID, independently
  // of the cached six-hour paid-land qualification.
  vi.mocked(purchaseFarmV2SeedPacks).mockImplementation(async () => {
    if (!farmAuthorityContext.getStore()?.operationId)
      throw new Error("INVALID_FARM_WALLET_OPERATION");
    return { seedsAdded: 20 } as never;
  });
  const response = await fetch(`${base}/api/farm/v2/seeds/1/purchase`, {
    method: "POST",
    headers: { authorization: "Bearer credential", "content-type": "application/json", "x-request-id": "seed-authority-regression" },
    body: JSON.stringify({ packs: 1 }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ seedsAdded: 20 });
});

it.each([true, false])("state read uses six-hour qualification and returns post-settlement state (%s)", async (recent) => {
  const { pool } = await import("@workspace/db");
  const { settleFarmV2Farmer } = await import("../lib/farm-v2-gameplay");
  const { reconcileFarmV2PaidAccessFromCore } = await import("../lib/farm-v2-paid-access");
  const { farmAuthorityContext } = await import("../lib/farm-v2-authority-context");
  const userId = "00000000-0000-0000-0000-000000000001";
  vi.stubEnv("FARM_V2_ENTRY_ENABLED", "1");
  vi.stubEnv("PLATFORM_BASE_URL", "https://platform.test");
  vi.stubEnv("REPLIT_APP_SHARED_SECRET", "test-only");
  const originalFetch = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
    String(input).startsWith("https://platform.test")
      ? Response.json({ userId, appId: "qiankun-futian" })
      : originalFetch(input, init),
  );
  vi.mocked(pool.query).mockResolvedValue({ rows: recent ? [{}] : [] } as never);
  authority.mockImplementation(async (_input, run) =>
    farmAuthorityContext.run({ userId, operationId: "00000000-0000-4000-8000-000000000003", qualification: 600 }, run),
  );
  let settled = false;
  vi.mocked(settleFarmV2Farmer).mockImplementation(async () => { settled = true; return {} as never; });
  initialize.mockImplementation(async () => ({ player: { crops: settled ? 20 : 0 }, lands: [] }));
  const response = await fetch(`${base}/api/farm/v2/state`, {
    headers: { authorization: "Bearer credential" },
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ player: { crops: 20 }, lands: [] });
  expect(authority).toHaveBeenCalledTimes(recent ? 0 : 1);
  expect(reconcileFarmV2PaidAccessFromCore).toHaveBeenCalledTimes(recent ? 0 : 1);
  expect(initialize).toHaveBeenCalledTimes(recent ? 1 : 2);
});
