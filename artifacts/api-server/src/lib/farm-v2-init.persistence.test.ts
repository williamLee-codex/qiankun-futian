import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
const url = process.env.FARM_V2_INIT_TEST_DATABASE_URL;
describe.skipIf(!url)("first Farm entry persistence on disposable PostgreSQL", () => {
  let storage: typeof import("@workspace/db");
  let initialize: typeof import("./farm-v2-init").ensureFarmV2PlayerInitialized;
  const start = Date.parse("2026-11-18T01:00:00Z");
  beforeAll(async () => {
    const connection = new URL(url!);
    if (connection.hostname !== "127.0.0.1" || !connection.pathname.startsWith("/farm_v2_init_")) throw Error("DISPOSABLE_INIT_DATABASE_REQUIRED");
    vi.stubEnv("DATABASE_URL", url!);
    vi.stubEnv("FARM_V2_LOCAL_COINS_ENABLED", "0");
    storage = await import("@workspace/db");
    initialize = (await import("./farm-v2-init")).ensureFarmV2PlayerInitialized;
    await storage.pool.query(`
      CREATE TABLE farm_v2_player_state (
        user_id text PRIMARY KEY, first_farm_entered_at timestamptz,
        effective_paid_crystals integer NOT NULL DEFAULT 0,
        access_state jsonb NOT NULL, warehouse_state jsonb NOT NULL,
        mission_state jsonb NOT NULL, pet_state jsonb NOT NULL,
        farmer_state jsonb NOT NULL, chaos_seed_state jsonb,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE farm_v2_land (
        user_id text NOT NULL, land_id integer NOT NULL, lifecycle text NOT NULL,
        access_active boolean NOT NULL, planted_quantity integer NOT NULL DEFAULT 0,
        planted_at timestamptz, matures_at timestamptz,
        version bigint NOT NULL DEFAULT 0, PRIMARY KEY(user_id,land_id)
      );`);
  });
  afterAll(async () => { if (storage) await storage.pool.end(); vi.unstubAllEnvs(); });
  it("permanently keeps the first entry across later reads without resetting inventory or lands", async () => {
    const first = await initialize({userId:"first-owner",now:start});
    expect(first.player.firstFarmEnteredAt?.getTime()).toBe(start);
    expect(first.lands).toHaveLength(6);
    await storage.pool.query("UPDATE farm_v2_player_state SET warehouse_state=jsonb_set(warehouse_state,'{seeds,1}','9') WHERE user_id='first-owner'");
    await storage.pool.query("UPDATE farm_v2_land SET version=17 WHERE user_id='first-owner' AND land_id=2");
    const later = await initialize({userId:"first-owner",now:start+10*86400000});
    expect(later.player.firstFarmEnteredAt?.getTime()).toBe(start);
    expect((later.player.warehouseState as {seeds:Record<string,number>}).seeds['1']).toBe(9);
    expect(later.lands.find(l=>l.landId===2)?.version).toBe(17);
    const persisted = await storage.pool.query("SELECT first_farm_entered_at FROM farm_v2_player_state WHERE user_id='first-owner'");
    expect(persisted.rows[0].first_farm_entered_at.getTime()).toBe(start);
  });
  it("serializes concurrent first visits into one timestamp and six persisted fields", async () => {
    const visits = await Promise.all([0,1,2,3].map(offset=>initialize({userId:"concurrent-owner",now:start+offset*1000})));
    const saved = visits[0].player.firstFarmEnteredAt!.getTime();
    expect([start,start+1000,start+2000,start+3000]).toContain(saved);
    for (const result of visits) { expect(result.player.firstFarmEnteredAt?.getTime()).toBe(saved); expect(result.lands).toHaveLength(6); }
    expect((await storage.pool.query("SELECT count(*)::int AS count FROM farm_v2_land WHERE user_id='concurrent-owner'")).rows[0].count).toBe(6);
  });
  it("rolls back both first-entry persistence and field creation when a field insert fails", async () => {
    await storage.pool.query(`CREATE FUNCTION reject_test_land() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.user_id='failed-owner' AND NEW.land_id=6 THEN RAISE EXCEPTION 'ISOLATED_FIELD_FAILURE'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_test_land BEFORE INSERT ON farm_v2_land FOR EACH ROW EXECUTE FUNCTION reject_test_land();`);
    await expect(initialize({userId:"failed-owner",now:start})).rejects.toThrow();
    expect((await storage.pool.query("SELECT count(*)::int AS count FROM farm_v2_player_state WHERE user_id='failed-owner'")).rows[0].count).toBe(0);
    expect((await storage.pool.query("SELECT count(*)::int AS count FROM farm_v2_land WHERE user_id='failed-owner'")).rows[0].count).toBe(0);
  });
  it("does not invent or reset an unknown historical first entry", async () => {
    await initialize({userId:"legacy-owner",now:start});
    await storage.pool.query("UPDATE farm_v2_player_state SET first_farm_entered_at=NULL WHERE user_id='legacy-owner'");
    expect((await initialize({userId:"legacy-owner",now:start+86400000})).player.firstFarmEnteredAt).toBeNull();
  });
  it("rejects invalid initialization clocks before persisting a player", async () => {
    for (const now of [0,-1,NaN,Infinity,8640000000000001]) {
      await expect(initialize({userId:"invalid-owner",now})).rejects.toThrow("INVALID_FIRST_FARM_ENTRY_TIME");
    }
    expect((await storage.pool.query("SELECT count(*)::int AS count FROM farm_v2_player_state WHERE user_id='invalid-owner'")).rows[0].count).toBe(0);
  });
});
