import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
const file = "lib/db/migrations/0002_farm_v2_game_baseline.sql";
test("baseline SQL is additive and atomic", () => {
  const s = readFileSync(file, "utf8");
  assert.match(s, /BEGIN;/);
  assert.match(s, /COMMIT;/);
  assert.doesNotMatch(
    s,
    /\b(DROP|ALTER|TRUNCATE|INSERT|UPDATE|DELETE|IF NOT EXISTS)\b/i,
  );
  assert.equal((s.match(/CREATE TABLE public\.farm_v2_/g) || []).length, 3);
});
const container = process.env.LOCAL_TEST_POSTGRES_CONTAINER;
test(
  "isolated empty DB, 0001 ordering, replay and partial collision preserve data",
  { skip: !container },
  () => {
    assert.match(container, /^farm-v2-.*test/);
    const db = `farm_v2_baseline_test_${process.pid}`;
    const run = (s, d = db) =>
      spawnSync(
        "docker",
        [
          "exec",
          "-i",
          container,
          "psql",
          "-X",
          "-q",
          "-U",
          "postgres",
          "-d",
          d,
          "-At",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: s, encoding: "utf8" },
      );
    const sql = (s, d = db) => {
      const r = run(s, d);
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    sql(`CREATE DATABASE ${db}`, "postgres");
    try {
      const baseline = readFileSync(file, "utf8");
      sql(
        readFileSync(
          "lib/db/migrations/0001_farm_v2_authority_reconciliation.sql",
          "utf8",
        ),
      );
      sql(baseline);
      assert.equal(
        sql(
          "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'farm_v2_%'",
        ),
        "6",
      );
      sql(
        "INSERT INTO farm_v2_mutation(request_id,user_id,action) VALUES('keep','user','seed')",
      );
      assert.notEqual(run(baseline).status, 0);
      assert.equal(sql("SELECT request_id FROM farm_v2_mutation"), "keep");
      // Simulate a pre-existing partial installation; migration must roll back earlier CREATEs.
      sql("DROP TABLE farm_v2_player_state,farm_v2_land");
      assert.notEqual(run(baseline).status, 0);
      assert.equal(
        sql(
          "SELECT to_regclass('public.farm_v2_player_state') IS NULL AND to_regclass('public.farm_v2_land') IS NULL",
        ),
        "t",
      );
      assert.equal(sql("SELECT request_id FROM farm_v2_mutation"), "keep");
    } finally {
      sql(`DROP DATABASE ${db} WITH(FORCE)`, "postgres");
    }
  },
);
