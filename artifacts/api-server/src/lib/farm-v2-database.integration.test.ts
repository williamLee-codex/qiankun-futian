import {
  beforeAll,
  afterAll,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../../../lib/db/src/schema";
const state = vi.hoisted(() => ({ db: null as any }));
vi.mock("@workspace/db", async () => ({
  ...(await import("../../../../lib/db/src/schema")),
  get db() {
    return state.db;
  },
  get walletJournalDb() {
    return state.db;
  },
}));
import { ensureFarmV2PlayerInitialized } from "./farm-v2-init";
import { sowFarmV2Land } from "./farm-v2-sow";
import { harvestFarmV2Land } from "./farm-v2-harvest";
import {
  reconcileFarmV2PaidAccess,
  reconcileFarmV2PaidAccessFromCore,
} from "./farm-v2-paid-access";
import { purchaseFarmV2SeedPacks } from "./farm-v2-seed-purchase";
import { exchangeFarmV2Crops } from "./farm-v2-crop-exchange";
import express from "express";
import farmRouter from "../routes/farm-v2";
let pg: PGlite;
beforeAll(async () => {
  pg = new PGlite();
  const database = drizzle(pg, { schema });
  let active: any = null;
  // PGlite has a single connection. Route outer calls through the active
  // connection to exercise SQL only; this cannot validate cross-connection
  // wallet durability or concurrent transactions.
  state.db = {
    get query() {
      return (active ?? database).query;
    },
    select: (...args: any[]) => (active ?? database).select(...args),
    insert: (...args: any[]) => (active ?? database).insert(...args),
    update: (...args: any[]) => (active ?? database).update(...args),
    transaction: async (callback: any) =>
      database.transaction(async (tx) => {
        active = tx;
        try {
          return await callback(tx);
        } finally {
          active = null;
        }
      }),
  };
  await pg.exec(
    "CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;",
  );
  await pg.exec(
    readFileSync(
      "supabase/migrations/20261012034556_farm_v2_runtime.sql",
      "utf8",
    ),
  );
});
afterAll(async () => {
  await pg.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
describe("Farm V2 isolated PostgreSQL engine", () => {
  it("settles enabled farmer cycles into persisted warehouse once without claiming chaos", async () => {
    await ensureFarmV2PlayerInitialized({ userId: "farmer", now: 0 });
    await pg.query(
      `UPDATE farm_v2_player_state SET farmer_state='{"entitled":true,"enabledByLand":{"1":true,"2":false,"3":false,"4":false,"5":false,"6":false}}', warehouse_state=jsonb_set(warehouse_state,'{seeds,1}','60') WHERE user_id='farmer'`,
    );
    await pg.query(
      "UPDATE farm_v2_land SET lifecycle='GROWING',planted_quantity=20,planted_at=to_timestamp(0),matures_at=to_timestamp(14400) WHERE user_id='farmer' AND land_id=1",
    );
    await reconcileFarmV2PaidAccess({
      userId: "farmer",
      requestId: "farmer-login",
      settleFarmer: true,
      effectivePaidCrystals: 999,
      now: 13 * 3600000,
    });
    const first = await ensureFarmV2PlayerInitialized({ userId: "farmer" });
    expect((first.player.warehouseState as any).crops[1]).toBe(360);
    expect((first.player.warehouseState as any).seeds[1]).toBe(0);
    expect(first.lands[0].plantedAt?.getTime()).toBe(12 * 3600000);
    await reconcileFarmV2PaidAccess({
      userId: "farmer",
      requestId: "farmer-login-again",
      settleFarmer: true,
      effectivePaidCrystals: 999,
      now: 13 * 3600000,
    });
    const second = await ensureFarmV2PlayerInitialized({ userId: "farmer" });
    expect(second.player.warehouseState).toEqual(first.player.warehouseState);
    expect(second.player.chaosSeedState).toEqual(first.player.chaosSeedState);
    await reconcileFarmV2PaidAccess({
      userId: "farmer",
      requestId: "farmer-refund",
      settleFarmer: true,
      effectivePaidCrystals: 0,
      now: 20 * 3600000,
    });
    const paused = await ensureFarmV2PlayerInitialized({ userId: "farmer" });
    expect(paused.player.warehouseState).toEqual(second.player.warehouseState);
    expect(paused.lands[0].plantedAt).toEqual(second.lands[0].plantedAt);
    expect((paused.player.farmerState as any).entitled).toBe(false);
  });
  it("migration protects backend-only state from direct client reads and writes", async () => {
    const tables = ["farm_v2_player_state", "farm_v2_land", "farm_v2_mutation"];
    for (const role of ["anon", "authenticated"]) {
      for (const table of tables) {
        for (const privilege of [
          "SELECT",
          "INSERT",
          "UPDATE",
          "DELETE",
          "TRUNCATE",
          "REFERENCES",
          "TRIGGER",
        ]) {
          const result = await pg.query<{ allowed: boolean }>(
            "SELECT has_table_privilege($1, $2, $3) AS allowed",
            [role, table, privilege],
          );
          expect(result.rows[0].allowed).toBe(false);
        }
      }
      await pg.exec(`SET ROLE ${role}`);
      try {
        for (const table of tables) {
          await expect(pg.query(`SELECT * FROM ${table}`)).rejects.toThrow(
            /permission denied/,
          );
          await expect(pg.query(`DELETE FROM ${table}`)).rejects.toThrow(
            /permission denied/,
          );
        }
      } finally {
        await pg.exec("RESET ROLE");
      }
    }
    await pg.exec("SET ROLE service_role");
    try {
      for (const table of tables) await pg.query(`SELECT * FROM ${table}`);
    } finally {
      await pg.exec("RESET ROLE");
    }
    const rows = await pg.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE relname IN ('farm_v2_player_state','farm_v2_land','farm_v2_mutation')",
    );
    expect(rows.rows).toHaveLength(3);
    expect(rows.rows.every((row) => row.relrowsecurity)).toBe(true);
  });
  it("migration rejects invalid land identities and negative quantities", async () => {
    for (const [land, quantity] of [
      [7, 0],
      [1, -1],
    ]) {
      await expect(
        pg.query(
          "INSERT INTO farm_v2_land(user_id,land_id,lifecycle,access_active,planted_quantity) VALUES ('invalid',$1,'EMPTY',true,$2)",
          [land, quantity],
        ),
      ).rejects.toThrow(/check constraint/);
    }
  });
  it("SEED-MARKET-002 commits wallet reservation before starting a domain transaction", async () => {
    await ensureFarmV2PlayerInitialized({ userId: "buyer" });
    const originalTransaction = state.db.transaction.bind(state.db);
    const transaction = vi
      .spyOn(state.db, "transaction")
      .mockImplementation(async (callback: any) => {
        const row = await pg.query(
          "SELECT action FROM farm_v2_mutation WHERE user_id='buyer' AND request_id='buy-once'",
        );
        expect(row.rows).toEqual([{ action: "seed-purchase:2:1" }]);
        return originalTransaction(callback);
      });
    vi.stubEnv("PLATFORM_BASE_URL", "https://core.test");
    vi.stubEnv("REPLIT_APP_SHARED_SECRET", "test-only");
    const requests: any[] = [];
    vi.stubGlobal("fetch", async (_url: any, init: any) => {
      requests.push(JSON.parse(init.body));
      return new Response(
        JSON.stringify({
          duplicate: false,
          transaction: { id: "tx" },
          wallet: { id: "wallet" },
        }),
        { status: 201 },
      );
    });
    const result = await purchaseFarmV2SeedPacks({
      userId: "buyer",
      requestId: "buy-once",
      launchToken: "buyer-test",
      landId: 2,
      packs: 1,
    });
    expect(result.seedsAdded).toBe(10);
    expect(result.warehouse.seeds[2]).toBe(10);
    await purchaseFarmV2SeedPacks({
      userId: "buyer",
      requestId: "buy-once",
      launchToken: "buyer-test",
      landId: 2,
      packs: 1,
    });
    expect(requests).toHaveLength(1);
    transaction.mockRestore();
  });
  it("real HTTP routes validate identity, reject missing IDs, and preserve exchange units", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api", farmRouter);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    const address = server.address() as { port: number };
    const endpoint = `http://127.0.0.1:${address.port}/api/farm/v2`;
    const nativeFetch = globalThis.fetch;
    const walletRequests: any[] = [];
    let paidQualification = 600;
    vi.stubEnv("PLATFORM_BASE_URL", "https://core.test");
    vi.stubEnv("REPLIT_APP_SHARED_SECRET", "test-only");
    vi.stubGlobal("fetch", async (url: any, init: any) => {
      const path = new URL(url).pathname;
      const payload = JSON.parse(init?.body ?? "{}");
      if (path.endsWith("/launch/validate"))
        return new Response(
          JSON.stringify({
            userId: payload.launchToken,
            appId: "qiankun-futian",
          }),
        );
      if (path.endsWith("/paid-value"))
        return new Response(
          JSON.stringify({ effectivePaidCrystals: paidQualification }),
        );
      if (path.endsWith("/wallet")) {
        walletRequests.push(payload);
        return new Response(
          JSON.stringify({
            duplicate: false,
            transaction: { id: "http-receipt" },
            wallet: { id: "wallet" },
          }),
          { status: 201 },
        );
      }
      return nativeFetch(url, init);
    });
    try {
      const headers = {
        Authorization: "Bearer http-alice",
        "content-type": "application/json",
      };
      expect((await nativeFetch(`${endpoint}/state`)).status).toBe(401);
      const response = await nativeFetch(`${endpoint}/state`, { headers });
      expect(response.status).toBe(200);
      const snapshot: any = await response.json();
      expect(snapshot.lands).toHaveLength(6);
      expect(Number.isFinite(snapshot.serverTime)).toBe(true);
      const rejected = await nativeFetch(`${endpoint}/crops/1/exchange`, {
        method: "POST",
        headers: { ...headers, "x-request-id": "no-crops" },
        body: JSON.stringify({ cropQuantity: 5 }),
      });
      expect(rejected.status).toBe(400);
      expect(await rejected.json()).toMatchObject({
        definitive: true,
        error: "INSUFFICIENT_CROPS_FOR_EXCHANGE",
      });
      const recoveredSnapshot: any = await (
        await nativeFetch(`${endpoint}/state`, { headers })
      ).json();
      expect(recoveredSnapshot.pendingMutation).toBe(null);
      const anchor = Date.now() - 5 * 72 * 3600000 - 1000;
      await pg.query(
        "UPDATE farm_v2_player_state SET chaos_seed_state=$1::jsonb, access_state=jsonb_set(access_state,'{firstUnlockedAt,6}',$2::jsonb) WHERE user_id='http-alice'",
        [
          JSON.stringify({ anchorAt: anchor, processedCycle: 0, pending: 0 }),
          JSON.stringify(anchor),
        ],
      );
      const chaosSnapshot: any = await (
        await nativeFetch(`${endpoint}/state`, { headers })
      ).json();
      expect(chaosSnapshot.player.chaosSeedState).toMatchObject({
        pending: 3,
        processedCycle: 5,
        anchorAt: anchor,
      });
      const claimHeaders = { ...headers, "x-request-id": "chaos-once" };
      const claim = await nativeFetch(`${endpoint}/chaos-seeds/claim`, {
        method: "POST",
        headers: claimHeaders,
      });
      expect(claim.status).toBe(200);
      const claimed: any = await claim.json();
      expect(claimed.claimed).toBe(3);
      expect(claimed.warehouse.seeds["6"]).toBe(4);
      expect(claimed.chaosSeedState).toMatchObject({
        pending: 0,
        processedCycle: 5,
        anchorAt: anchor,
      });
      const repeatedClaim = await nativeFetch(`${endpoint}/chaos-seeds/claim`, {
        method: "POST",
        headers: claimHeaders,
      });
      expect(repeatedClaim.status).toBe(200);
      expect(await repeatedClaim.json()).toEqual(claimed);
      const afterClaim: any = await (
        await nativeFetch(`${endpoint}/state`, { headers })
      ).json();
      expect(afterClaim.player.warehouseState.seeds["6"]).toBe(4);
      expect(afterClaim.player.chaosSeedState.pending).toBe(0);
      const missing = await nativeFetch(`${endpoint}/lands/1/sow`, {
        method: "POST",
        headers,
      });
      expect(missing.status).toBe(400);
      await pg.query(
        "UPDATE farm_v2_player_state SET warehouse_state=jsonb_set(warehouse_state,'{crops,1}','12') WHERE user_id='http-alice'",
      );
      const exchangeHeaders = { ...headers, "x-request-id": "http-exchange" };
      const exchange = await nativeFetch(`${endpoint}/crops/1/exchange`, {
        method: "POST",
        headers: exchangeHeaders,
        body: JSON.stringify({ cropQuantity: 12 }),
      });
      expect(exchange.status).toBe(200);
      const result: any = await exchange.json();
      expect(result.cropsConsumed).toBe(10);
      expect(result.warehouse.crops["1"]).toBe(2);
      expect(
        (
          await nativeFetch(`${endpoint}/crops/1/exchange`, {
            method: "POST",
            headers: exchangeHeaders,
            body: JSON.stringify({ cropQuantity: 12 }),
          })
        ).status,
      ).toBe(200);
      expect(walletRequests).toHaveLength(1);
      expect(walletRequests[0].amount).toBe(2);
      const farmerHeaders = { ...headers, "x-request-id": "farmer-on" };
      const farmerRequest = () =>
        nativeFetch(`${endpoint}/lands/1/farmer`, {
          method: "POST",
          headers: farmerHeaders,
          body: JSON.stringify({ enabled: true }),
        });
      expect((await farmerRequest()).status).toBe(403);
      await pg.query(
        "UPDATE farm_v2_player_state SET warehouse_state=jsonb_set(warehouse_state,'{seeds,1}','20') WHERE user_id='http-alice'",
      );
      paidQualification = 999;
      const enabled = await farmerRequest();
      expect(enabled.status).toBe(200);
      expect(await enabled.json()).toMatchObject({
        farmer: { entitled: true, enabledByLand: { 1: true } },
      });
      expect((await farmerRequest()).status).toBe(200);
      const afterFarmer: any = await (
        await nativeFetch(`${endpoint}/state`, { headers })
      ).json();
      expect(afterFarmer.lands[0].lifecycle).toBe("GROWING");
      expect(afterFarmer.player.warehouseState.seeds[1]).toBe(0);
      expect(afterFarmer.lands[0].plantedQuantity).toBe(20);
      expect(
        (
          await nativeFetch(`${endpoint}/lands/1/farmer`, {
            method: "POST",
            headers: { ...headers, "x-request-id": "farmer-off" },
            body: JSON.stringify({ enabled: false }),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await nativeFetch(`${endpoint}/lands/1/farmer`, {
            method: "POST",
            headers: { ...headers, "x-request-id": "invalid-farmer" },
            body: JSON.stringify({ enabled: "false" }),
          })
        ).status,
      ).toBe(400);
      expect(walletRequests).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it("defers milestone grants and blocks other writes during an uncertain wallet effect", async () => {
    await ensureFarmV2PlayerInitialized({ userId: "uncertain" });
    await pg.query(
      "INSERT INTO farm_v2_mutation(user_id,request_id,action,wallet_direction,wallet_currency,wallet_amount) VALUES('uncertain','lost-receipt','seed-purchase:1:1','debit','coin',1)",
    );
    vi.stubEnv("PLATFORM_BASE_URL", "https://core.test");
    vi.stubEnv("REPLIT_APP_SHARED_SECRET", "test-only");
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ effectivePaidCrystals: 600 })),
    );
    const result = await reconcileFarmV2PaidAccessFromCore({
      launchToken: "uncertain-test",
      userId: "uncertain",
      requestId: "paid-check",
    });
    expect(result).toMatchObject({ reconciliationDeferred: true });
    const snapshot = await ensureFarmV2PlayerInitialized({
      userId: "uncertain",
    });
    expect((snapshot.player.warehouseState as any).seeds["6"]).toBe(0);
    expect(snapshot.lands[5].accessActive).toBe(false);
    await expect(
      sowFarmV2Land({
        userId: "uncertain",
        requestId: "different-action",
        landId: 1,
      }),
    ).rejects.toThrow("FARM_V2_PREVIOUS_MUTATION_UNCONFIRMED");
  });
  it("initializes once, isolates players and persists all six authoritative batches", async () => {
    const now = Date.parse("2026-10-01T00:00:00Z");
    await ensureFarmV2PlayerInitialized({ userId: "alice", now });
    await ensureFarmV2PlayerInitialized({ userId: "bob", now });
    await reconcileFarmV2PaidAccess({
      userId: "alice",
      requestId: "paid-600",
      effectivePaidCrystals: 600,
      now,
    });
    const seed = { "1": 20, "2": 10, "3": 6, "4": 4, "5": 3, "6": 1 };
    // Test fixture unlocks coin lands and seeds directly; this does not test a wallet purchase.
    await pg.query(
      "UPDATE farm_v2_land SET access_active=true,lifecycle='EMPTY' WHERE user_id='alice'",
    );
    await pg.query(
      "UPDATE farm_v2_player_state SET warehouse_state=jsonb_set(warehouse_state,'{seeds}',$1::jsonb) WHERE user_id='alice'",
      [JSON.stringify(seed)],
    );
    for (let landId = 1; landId <= 6; landId++) {
      const planted = await sowFarmV2Land({
        userId: "alice",
        requestId: `sow-${landId}`,
        landId,
        now: new Date(now),
      });
      expect(planted.land.plantedQuantity).toBe(
        seed[String(landId) as keyof typeof seed],
      );
      const repeated = await sowFarmV2Land({
        userId: "alice",
        requestId: `sow-${landId}`,
        landId,
        now: new Date(now),
      });
      expect(repeated).toEqual(JSON.parse(JSON.stringify(planted)));
      await expect(
        harvestFarmV2Land({
          userId: "alice",
          requestId: `early-${landId}`,
          landId,
          now: new Date(now),
        }),
      ).rejects.toThrow("LAND_NOT_HARVESTABLE");
      const harvested = await harvestFarmV2Land({
        userId: "alice",
        requestId: `harvest-${landId}`,
        landId,
        now: new Date(now + 61 * 3600000),
      });
      expect(harvested.creditedQuantity).toBe(
        seed[String(landId) as keyof typeof seed] * 6,
      );
      expect(harvested.land.lifecycle).toBe("EMPTY");
      expect(
        await harvestFarmV2Land({
          userId: "alice",
          requestId: `harvest-${landId}`,
          landId,
          now: new Date(now + 62 * 3600000),
        }),
      ).toEqual(JSON.parse(JSON.stringify(harvested)));
      await expect(
        harvestFarmV2Land({
          userId: "alice",
          requestId: `double-${landId}`,
          landId,
          now: new Date(now + 62 * 3600000),
        }),
      ).rejects.toThrow("LAND_NOT_HARVESTABLE");
    }
    const bob = await ensureFarmV2PlayerInitialized({
      userId: "bob",
      now: now + 61 * 3600000,
    });
    expect(bob.lands.every((l) => l.plantedQuantity === 0)).toBe(true);
    expect(bob.player.firstFarmEnteredAt!.getTime()).toBe(now);
  });
});
