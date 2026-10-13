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
import { claimFarmV2Mission } from "./farm-v2-mission-claim";
import { createMissionState, recordMissionEvent } from "../../../qiankun-farm/src/game/v2/missionRuntime";
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
  await pg.query(
    "INSERT INTO farm_v2_mutation(user_id,request_id,action) VALUES('legacy','legacy-before-migration','old-action')",
  );
  await pg.exec(
    readFileSync(
      "supabase/migrations/20261013090000_farm_v2_mission_claim.sql",
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
  it("claims all canonical missions once and credits Core and Farm-owned rewards", async () => {
    const now = Date.parse("2026-10-13T10:00:00+08:00");
    await ensureFarmV2PlayerInitialized({ userId: "mission-claim-user", now });
    let missions = createMissionState(now);
    for (let index = 0; index < 10; index++) missions = recordMissionEvent(missions, "SOW", now);
    for (let index = 0; index < 10; index++) missions = recordMissionEvent(missions, "HARVEST", now);
    for (let index = 0; index < 5; index++) missions = recordMissionEvent(missions, "EXCHANGE", now);
    await pg.query("UPDATE farm_v2_player_state SET mission_state=$1::jsonb WHERE user_id='mission-claim-user'", [JSON.stringify(missions)]);

    const rewards: Record<string, number> = { MISSION_D01: 2, MISSION_D02: 3, MISSION_D03: 3, MISSION_D04: 5, MISSION_W01: 10, MISSION_W02: 15, MISSION_W03: 15, MISSION_W04: 20 };
    const calls: any[] = [];
    vi.stubEnv("PLATFORM_BASE_URL", "https://core.test");
    vi.stubEnv("REPLIT_APP_SHARED_SECRET", "test-only");
    vi.stubGlobal("fetch", async (url: any, init: any) => {
      const body = JSON.parse(init.body);
      calls.push({ url: String(url), requestId: init.headers["x-request-id"], body });
      const amount = rewards[body.missionId];
      return Response.json({
        result_status: "created", mission_id: body.missionId, amount,
        transaction: { id: `tx-${body.missionId}`, owner_id: "mission-claim-user", amount, currency: "coin", direction: "credit", reason: "farm_v2_mission_reward", reference_type: "farm_v2_mission_reward", reference_id: body.missionId, idempotency_key: `farm-v2:mission-claim:${init.headers["x-request-id"]}` },
        wallet: { wallet_id: "wallet" },
      }, { status: 201 });
    });

    for (const missionId of Object.keys(rewards)) {
      const result = await claimFarmV2Mission({ userId: "mission-claim-user", launchToken: "launch", requestId: `claim-${missionId}`, missionId: missionId as any, now });
      expect(result.missionId).toBe(missionId);
      expect(result.coins).toBe(rewards[missionId]);
      expect(result.missionState.progress[missionId].claimed).toBe(true);
    }
    const replay = await claimFarmV2Mission({ userId: "mission-claim-user", launchToken: "launch", requestId: "claim-MISSION_D01", missionId: "MISSION_D01", now });
    expect(replay.warehouse.materials).toEqual({ "蘊靈砂": 1, "九霄玉髓": 0 });
    expect(calls).toHaveLength(8);
    expect(calls.every((call) => call.body && Object.keys(call.body).sort().join(",") === "launchToken,missionId")).toBe(true);
    const stored = await ensureFarmV2PlayerInitialized({ userId: "mission-claim-user", now });
    expect(stored.player.warehouseState).toMatchObject({ materials: { "蘊靈砂": 6, "九霄玉髓": 4 } });
    const ledger = await pg.query("SELECT mission_id, transaction_state FROM farm_v2_mutation WHERE user_id='mission-claim-user' AND mission_id IS NOT NULL ORDER BY mission_id");
    expect(ledger.rows).toHaveLength(8);
    expect(ledger.rows.every((row: any) => row.transaction_state === "COMPLETED")).toBe(true);
  });
  it("releases a mission-period reservation after a definitive preflight rejection", async () => {
    const now = Date.parse("2026-10-13T10:00:00+08:00");
    await ensureFarmV2PlayerInitialized({ userId: "mission-rejected", now });
    const calls: any[] = [];
    vi.stubEnv("PLATFORM_BASE_URL", "https://core.test");
    vi.stubEnv("REPLIT_APP_SHARED_SECRET", "test-only");
    vi.stubGlobal("fetch", async (_url: any, init: any) => { calls.push(init); return Response.json({}); });
    await expect(claimFarmV2Mission({ userId: "mission-rejected", launchToken: "launch", requestId: "preflight-rejected", missionId: "MISSION_D01", now })).rejects.toThrow("MISSION_NOT_COMPLETE");
    expect(calls).toHaveLength(0);
    const rejected = await pg.query("SELECT transaction_state,mission_id FROM farm_v2_mutation WHERE user_id='mission-rejected' AND request_id='preflight-rejected'");
    expect(rejected.rows).toEqual([{ transaction_state: "REJECTED", mission_id: null }]);

    let missions = createMissionState(now);
    missions = recordMissionEvent(missions, "SOW", now);
    await pg.query("UPDATE farm_v2_player_state SET mission_state=$1::jsonb WHERE user_id='mission-rejected'", [JSON.stringify(missions)]);
    vi.stubGlobal("fetch", async (_url: any, init: any) => {
      const id = init.headers["x-request-id"];
      return Response.json({ result_status: "created", mission_id: "MISSION_D01", amount: 2,
        transaction: { id: "tx-after-reject", owner_id: "mission-rejected", amount: 2, currency: "coin", direction: "credit", reason: "farm_v2_mission_reward", reference_type: "farm_v2_mission_reward", reference_id: "MISSION_D01", idempotency_key: `farm-v2:mission-claim:${id}` }, wallet: { wallet_id: "wallet" } });
    });
    const result = await claimFarmV2Mission({ userId: "mission-rejected", launchToken: "launch", requestId: "valid-after-reject", missionId: "MISSION_D01", now });
    expect(result.warehouse.materials).toEqual({ "蘊靈砂": 1, "九霄玉髓": 0 });
  });
  it("recovers a Core-applied daily claim after the Taiwan 05:00 reset without claiming the new period", async () => {
    const oldNow = Date.parse("2026-10-13T04:59:00+08:00");
    const newNow = Date.parse("2026-10-13T05:01:00+08:00");
    await ensureFarmV2PlayerInitialized({ userId: "mission-boundary", now: oldNow });
    let missions = createMissionState(oldNow);
    missions = recordMissionEvent(missions, "SOW", oldNow);
    await pg.query("UPDATE farm_v2_player_state SET mission_state=$1::jsonb WHERE user_id='mission-boundary'", [JSON.stringify(missions)]);
    const receipt = {
      duplicate: true, missionId: "MISSION_D01", amount: 2, transactionId: "core-committed",
      transaction: { id: "core-committed" }, wallet: { wallet_id: "wallet" },
    };
    await pg.query(
      `INSERT INTO farm_v2_mutation(user_id,request_id,action,response,transaction_state,wallet_direction,wallet_currency,wallet_amount,wallet_transaction,mission_id,mission_period_start,mission_material_id,mission_material_quantity)
       VALUES('mission-boundary','boundary-request','mission-claim:MISSION_D01',NULL,'WALLET_APPLIED','credit','coin',2,$1::jsonb,'MISSION_D01',$2,'蘊靈砂',1)`,
      [JSON.stringify(receipt), new Date(missions.dailyPeriodStart)],
    );
    let coreCalls = 0;
    vi.stubEnv("PLATFORM_BASE_URL", "https://core.test");
    vi.stubEnv("REPLIT_APP_SHARED_SECRET", "test-only");
    vi.stubGlobal("fetch", async () => { coreCalls++; throw new Error("should recover without contacting Core"); });
    const result = await claimFarmV2Mission({ userId: "mission-boundary", launchToken: "launch", requestId: "boundary-request", missionId: "MISSION_D01", now: newNow });
    expect(result.warehouse.materials).toEqual({ "蘊靈砂": 1, "九霄玉髓": 0 });
    expect(result.missionState.dailyPeriodStart).toBeGreaterThan(missions.dailyPeriodStart);
    expect(result.missionState.progress.MISSION_D01).toMatchObject({ progress: 0, completed: false, claimed: false });
    expect(coreCalls).toBe(0);
    const row = await pg.query("SELECT transaction_state FROM farm_v2_mutation WHERE user_id='mission-boundary' AND request_id='boundary-request'");
    expect(row.rows).toEqual([{ transaction_state: "COMPLETED" }]);
  });
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
  it("migration preserves legacy journal rows and enforces fixed mission reservations", async () => {
    const legacy = await pg.query(
      "SELECT mission_id, mission_period_start FROM farm_v2_mutation WHERE user_id='legacy' AND request_id='legacy-before-migration'",
    );
    expect(legacy.rows).toEqual([{ mission_id: null, mission_period_start: null }]);

    const rewards = [
      ["MISSION_D01", 2, "蘊靈砂", 1],
      ["MISSION_D02", 3, "蘊靈砂", 1],
      ["MISSION_D03", 3, "蘊靈砂", 1],
      ["MISSION_D04", 5, "蘊靈砂", 3],
      ["MISSION_W01", 10, "九霄玉髓", 1],
      ["MISSION_W02", 15, "九霄玉髓", 1],
      ["MISSION_W03", 15, "九霄玉髓", 1],
      ["MISSION_W04", 20, "九霄玉髓", 1],
    ] as const;
    for (const [missionId, amount, material, quantity] of rewards) {
      await pg.query(
        `INSERT INTO farm_v2_mutation(user_id,request_id,action,wallet_direction,wallet_currency,wallet_amount,mission_id,mission_period_start,mission_material_id,mission_material_quantity)
         VALUES('mission-user',$1,'mission-claim:' || $2,'credit','coin',$3,$2,'2026-10-12T21:00:00Z',$4,$5)`,
        [`claim-${missionId}`, missionId, amount, material, quantity],
      );
    }
    await expect(
      pg.query(
        `INSERT INTO farm_v2_mutation(user_id,request_id,action,wallet_direction,wallet_currency,wallet_amount,mission_id,mission_period_start,mission_material_id,mission_material_quantity)
         VALUES('mission-user','claim-again','mission-claim:MISSION_D01','credit','coin',2,'MISSION_D01','2026-10-12T21:00:00Z','蘊靈砂',1)`,
      ),
    ).rejects.toThrow(/unique constraint/);
    for (const values of [
      ["partial", "mission-claim:MISSION_D01", "credit", "coin", 2, "MISSION_D01", null, "蘊靈砂", 1],
      ["missing-id", "old-action", null, null, null, null, "2026-10-13T00:00:00Z", "蘊靈砂", 1],
      ["wrong-reward", "mission-claim:MISSION_D01", "credit", "coin", 999, "MISSION_D01", "2026-10-13T00:00:00Z", "蘊靈砂", 1],
      ["wrong-direction", "mission-claim:MISSION_D01", "debit", "coin", 2, "MISSION_D01", "2026-10-13T00:00:00Z", "蘊靈砂", 1],
      ["unknown", "mission-claim:MISSION_X99", "credit", "coin", 2, "MISSION_X99", "2026-10-13T00:00:00Z", "蘊靈砂", 1],
    ]) {
      await expect(
        pg.query(
          `INSERT INTO farm_v2_mutation(user_id,request_id,action,wallet_direction,wallet_currency,wallet_amount,mission_id,mission_period_start,mission_material_id,mission_material_quantity)
           VALUES('invalid-mission',$1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          values,
        ),
      ).rejects.toThrow(/check constraint/);
    }
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
      if (path.endsWith('/coin-land-unlocks')) return Response.json({result_status:'ok',lands:[2,3].map(landId=>({landId,historicallyUnlocked:false,accessActive:false,firstUnlockedAt:null}))});
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
      const invalidClaim = await nativeFetch(`${endpoint}/missions/MISSION_D01/claim`, {
        method: "POST",
        headers: { ...headers, "x-request-id": "injected-claim" },
        body: JSON.stringify({ coins: 999, materialId: "蘊靈砂", quantity: 99 }),
      });
      expect(invalidClaim.status).toBe(400);
      expect(await invalidClaim.json()).toMatchObject({ error: "INVALID_MISSION_CLAIM_REQUEST", definitive: true });
      const response = await nativeFetch(`${endpoint}/state`, { headers });
      expect(response.status).toBe(200);
      const snapshot: any = await response.json();
      expect(snapshot.lands).toHaveLength(6);
      expect(Number.isFinite(snapshot.serverTime)).toBe(true);
      expect(snapshot.player.missionState.progress.MISSION_D01).toMatchObject({ progress: 0, completed: false, claimed: false });
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
      const expiredAt = Date.now() - 24 * 3600000;
      let expiredMissions = createMissionState(expiredAt);
      expiredMissions = recordMissionEvent(expiredMissions, "SOW", expiredAt);
      await pg.query("UPDATE farm_v2_player_state SET mission_state=$1::jsonb WHERE user_id='http-alice'", [JSON.stringify(expiredMissions)]);
      const afterMissionReset: any = await (await nativeFetch(`${endpoint}/state`, { headers })).json();
      expect(afterMissionReset.player.missionState.progress.MISSION_D01).toMatchObject({ progress: 0, completed: false, claimed: false });
      expect(afterMissionReset.player.missionState.expiredMissionIds).toContain("MISSION_D01");
      await pg.query(
        `INSERT INTO farm_v2_mutation(user_id,request_id,action,transaction_state,wallet_direction,wallet_currency,wallet_amount,mission_id,mission_period_start,mission_material_id,mission_material_quantity)
         VALUES('http-alice','pending-mission','mission-claim:MISSION_D01','PENDING','credit','coin',2,'MISSION_D01','2026-10-13T21:00:00Z','蘊靈砂',1)`,
      );
      const recoveredState: any = await (await nativeFetch(`${endpoint}/state`, { headers })).json();
      expect(recoveredState.pendingMutation).toEqual({ requestId: "pending-mission", operation: "claimMission", missionId: "MISSION_D01" });
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


it('Core permanent unlock survives a lost response and replays the original Farm request without another debit', async()=>{
 const {purchaseFarmV2CoinLand}=await import('./farm-v2-coin-land-unlock');
 await ensureFarmV2PlayerInitialized({userId:'coin-land'});
 vi.stubEnv('PLATFORM_BASE_URL','https://core.test');vi.stubEnv('REPLIT_APP_SHARED_SECRET','shared');
 let debits=0,owned=false,lost=true;const requestIds:string[]=[];
 vi.stubGlobal('fetch',async(_url:any,init:any)=>{
  const payload=JSON.parse(init.body);
  if(payload.operation==='purchase') {
   requestIds.push(init.headers['x-request-id']);if(!owned){owned=true;debits++;}
   if(lost){lost=false;throw new Error('response lost after Core committed');}
   return Response.json({result_status:'already_unlocked',land_id:2,cost:0,unlocked_at:'2026-10-12T00:00:00Z',entitlement_id:'core-right'});
  }
  return Response.json({result_status:'ok',lands:[{landId:2,historicallyUnlocked:owned,accessActive:owned,firstUnlockedAt:owned?'2026-10-12T00:00:00Z':null},{landId:3,historicallyUnlocked:false,accessActive:false,firstUnlockedAt:null}]});
 });
 await expect(purchaseFarmV2CoinLand({userId:'coin-land',launchToken:'launch',requestId:'original-unlock',landId:2})).rejects.toThrow('response lost');
 expect((await ensureFarmV2PlayerInitialized({userId:'coin-land'})).lands[1].accessActive).toBe(false);
 await purchaseFarmV2CoinLand({userId:'coin-land',launchToken:'launch',requestId:'original-unlock',landId:2});
 const result=await ensureFarmV2PlayerInitialized({userId:'coin-land'});expect(result.lands[1]).toMatchObject({lifecycle:'EMPTY',accessActive:true});expect(debits).toBe(1);expect(requestIds).toEqual(['original-unlock','original-unlock']);
 await purchaseFarmV2CoinLand({userId:'coin-land',launchToken:'launch',requestId:'original-unlock',landId:2});expect(debits).toBe(1);expect(requestIds).toHaveLength(2);
});

it("claims a mission through the authenticated HTTP route without accepting reward fields", async () => {
  const userId = "route-mission-claim";
  const now = Date.parse("2026-10-13T10:00:00+08:00");
  await ensureFarmV2PlayerInitialized({ userId, now });
  const missions = recordMissionEvent(createMissionState(now), "SOW", now);
  await pg.query("UPDATE farm_v2_player_state SET mission_state=$1::jsonb WHERE user_id=$2", [JSON.stringify(missions), userId]);
  const app = express();
  app.use(express.json());
  app.use("/api", farmRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const endpoint = `http://127.0.0.1:${address.port}/api/farm/v2/missions/MISSION_D01/claim`;
  let coreCalls = 0;
  const nativeFetch = globalThis.fetch;
  vi.stubEnv("PLATFORM_BASE_URL", "https://core.test");
  vi.stubEnv("REPLIT_APP_SHARED_SECRET", "test-only");
  vi.stubGlobal("fetch", async (url: any, init: any) => {
    const path = new URL(url).pathname;
    const body = JSON.parse(init.body ?? "{}");
    if (path.endsWith("/launch/validate")) return Response.json({ userId, appId: "qiankun-futian" });
    if (path.endsWith("/mission-rewards")) {
      coreCalls++;
      expect(body).toEqual({ missionId: "MISSION_D01", launchToken: "launch" });
      return Response.json({ result_status: "created", mission_id: "MISSION_D01", amount: 2,
        transaction: { id: "route-core-tx", owner_id: userId, amount: 2, currency: "coin", direction: "credit", reason: "farm_v2_mission_reward", reference_type: "farm_v2_mission_reward", reference_id: "MISSION_D01", idempotency_key: "farm-v2:mission-claim:route-claim-id" },
        wallet: { wallet_id: "wallet" } });
    }
    throw new Error(`unexpected Core request ${path}`);
  });
  try {
    const headers = { Authorization: "Bearer launch", "x-request-id": "route-claim-id" };
    const first = await nativeFetch(endpoint, { method: "POST", headers });
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ missionId: "MISSION_D01", coins: 2, material: { id: "蘊靈砂", quantity: 1 } });
    const replay = await nativeFetch(endpoint, { method: "POST", headers });
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ missionId: "MISSION_D01", coins: 2 });
    expect(coreCalls).toBe(1);
    const player = await ensureFarmV2PlayerInitialized({ userId, now });
    expect(player.player.warehouseState).toMatchObject({ materials: { "蘊靈砂": 1, "九霄玉髓": 0 } });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
