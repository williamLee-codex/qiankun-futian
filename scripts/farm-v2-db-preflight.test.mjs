import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import test from "node:test";
test("Farm plan states actual Drizzle baseline source and cannot create missing tables", () => {
  const p = spawnSync("node", ["scripts/farm-v2-db-preflight.mjs", "--plan"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH },
  });
  assert.equal(p.status, 0, p.stderr);
  const plan = JSON.parse(p.stdout);
  assert.equal(plan.baselineSource, "lib/db/src/schema/farm-v2.ts");
  assert.equal(plan.baselineSqlMigrationExists, true);
  assert.equal(plan.requiredBaseTables.length, 3);
  assert.match(plan.sha256, /^[a-f0-9]{64}$/);
});
test("emitted Farm preflight is strictly read-only", () => {
  const p = spawnSync(
    "node",
    ["scripts/farm-v2-db-preflight.mjs", "--emit-preflight"],
    { encoding: "utf8", env: { PATH: process.env.PATH } },
  );
  assert.equal(p.status, 0, p.stderr);
  assert.match(p.stdout, /^BEGIN TRANSACTION READ ONLY;/);
  assert.doesNotMatch(p.stdout, /CREATE |INSERT |UPDATE |DELETE |DO \$/);
});
import { execFileSync } from "node:child_process";
import {
  farmDbPreflightSql,
  assertFarmDbPreflight,
} from "./farm-v2-db-preflight.mjs";
const container = process.env.LOCAL_TEST_POSTGRES_CONTAINER;
test(
  "isolated Farm missing tables, real baseline shape, and SELECT-only role fail closed",
  { skip: !container },
  () => {
    assert.match(container, /^farm-v2-.*test/);
    const db = `farm_v2_preflight_test_${process.pid}`;
    const role = `farm_v2_read_test_${process.pid}`;
    const sql = (s, database = db) =>
      execFileSync(
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
          database,
          "-At",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: s, encoding: "utf8" },
      ).trim();
    sql(`create database ${db}`, "postgres");
    try {
      assert.throws(
        () => assertFarmDbPreflight(sql(farmDbPreflightSql())),
        /farm_v2_player_state_columns/,
      );
      sql(
        `create table farm_v2_player_state(user_id text primary key,first_farm_entered_at timestamptz,effective_paid_crystals integer not null default 0,access_state jsonb not null,warehouse_state jsonb not null,mission_state jsonb not null,pet_state jsonb not null,farmer_state jsonb not null,chaos_seed_state jsonb,updated_at timestamptz not null default now());create table farm_v2_land(user_id text not null,land_id integer not null,lifecycle text not null,access_active boolean not null,planted_quantity integer not null default 0,planted_at timestamptz,matures_at timestamptz,version bigint not null default 0,primary key(user_id,land_id));create table farm_v2_mutation(request_id text not null,user_id text not null,action text not null,response jsonb,transaction_state text not null default 'PENDING',wallet_direction text,wallet_currency text,wallet_amount integer,wallet_transaction jsonb,failure_code text,updated_at timestamptz not null default now(),created_at timestamptz not null default now(),primary key(user_id,request_id));`,
      );
      assertFarmDbPreflight(sql(farmDbPreflightSql()));
      sql(
        `create role ${role};grant usage,create on schema public to ${role};grant select on all tables in schema public to ${role}`,
      );
      const result = JSON.parse(
        sql(
          farmDbPreflightSql().replace(
            "BEGIN TRANSACTION READ ONLY;",
            `BEGIN TRANSACTION READ ONLY;SET LOCAL ROLE ${role};`,
          ),
        ),
      );
      assert.equal(result.farm_v2_player_state_runtime_access, false);
      assert.throws(
        () => assertFarmDbPreflight(JSON.stringify(result)),
        /runtime_access/,
      );
      sql(`drop owned by ${role};drop role ${role}`);
      sql(
        "alter table farm_v2_mutation alter column transaction_state drop default;alter table farm_v2_mutation alter column transaction_state type integer using 1",
      );
      assert.throws(
        () => assertFarmDbPreflight(sql(farmDbPreflightSql())),
        /farm_v2_mutation_columns/,
      );
    } finally {
      sql(`drop database if exists ${db} with(force)`, "postgres");
      sql(`drop role if exists ${role}`, "postgres");
    }
  },
);
