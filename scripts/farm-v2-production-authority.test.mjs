import test from "node:test";
import { createRequire } from "node:module";
import { farmDatabaseConfig } from "../lib/db/src/connection-config.ts";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  loadFarmMigrations,
  reviewedSql,
  grantsSql,
  guard,
} from "./farm-v2-production-authority.mjs";
const platform = "../imperial-compass-platform";
test("offline sources, ordered versions and unauthorized execution", () => {
  const ms = loadFarmMigrations(platform);
  assert.deepEqual(
    ms.map((m) => m.version),
    ["20261011000201", "20261011000202", "20261011000203"],
  );
  for (const m of ms) {
    assert.equal(m.executionAuthorized, false);
    assert.ok(reviewedSql(m).endsWith("COMMIT;"));
  }
  assert.throws(() => grantsSql("service_role", "service_role"), /SEPARATE/);
  const result = spawnSync(
    process.execPath,
    ["scripts/farm-v2-production-authority.mjs", "--apply"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /REVIEW_ONLY_NO_APPLY/);
});
test(
  "isolated Journal atomicity, least-privilege runtime and Node 24 Functions",
  { skip: process.env.LOCAL_TEST_POSTGRES_CONTAINER !== "farm-v2-p0-test-db" },
  async () => {
    assert.match(process.version, /^v24\./);
    const container = process.env.LOCAL_TEST_POSTGRES_CONTAINER,
      db = `farm_v2_production_roles_${process.pid}`;
    const runtime = `farm_runtime_${process.pid}`,
      operator = `farm_operator_${process.pid}`;
    const sql = (s, d = db) =>
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
          d,
          "-At",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        {
          input: s,
          encoding: "utf8",
          stdio: ["pipe", "pipe", "pipe"],
          maxBuffer: 16 * 1024 * 1024,
        },
      ).trim();
    sql(
      `CREATE DATABASE ${db} TEMPLATE farm_v2_core_contract_final`,
      "postgres",
    );
    try {
      const ms = loadFarmMigrations(platform);
      sql(
        "DROP TABLE IF EXISTS public.farm_v2_reconciliation_event,public.farm_v2_reconciliation_case,public.farm_v2_authorization_attempt,public.farm_v2_mutation,public.farm_v2_land,public.farm_v2_player_state CASCADE; DROP FUNCTION IF EXISTS public.farm_v2_audit_append_only();",
      );
      // Journal fixture is explicitly simulated; actual prior Core RPCs come from isolated template.
      sql(
        "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]); TRUNCATE supabase_migrations.schema_migrations;",
      );
      assert.throws(
        () => sql("BEGIN READ ONLY;" + guard(ms[0]) + "ROLLBACK;"),
        /PREDECESSOR_DRIFT/,
      );
      const q = (s) => "'" + s.replaceAll("'", "''") + "'";
      for (const p of ms[0].prerequisites)
        sql(
          `INSERT INTO supabase_migrations.schema_migrations VALUES(${q(p.version)},${q(p.name)},ARRAY[${q(p.source)}]::text[])`,
        );
      sql(reviewedSql(ms[0]));
      assert.throws(() => sql(reviewedSql(ms[0])), /VERSION_CONFLICT/);
      const broken = reviewedSql(ms[1]).replace(
        /COMMIT;$/,
        "SELECT 1/0; COMMIT;",
      );
      assert.throws(() => sql(broken), /division by zero/);
      assert.equal(
        sql("SELECT to_regclass('public.farm_v2_player_state') IS NULL"),
        "t",
      );
      assert.equal(
        sql(
          "SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='20261011000202'",
        ),
        "0",
      );
      sql(reviewedSql(ms[1]));
      sql(reviewedSql(ms[2]));
      sql(`CREATE ROLE ${runtime}; CREATE ROLE ${operator};`);
      const insert = `INSERT INTO public.farm_v2_authorization_attempt(id,user_id,request_id,action,state) VALUES('00000000-0000-0000-0000-000000000011','test','key','test','OPEN')`;
      assert.throws(
        () => sql(`SET ROLE ${runtime}; ${insert}`),
        /permission denied/,
      );
      sql(grantsSql(runtime, operator));
      sql(
        `SET ROLE ${runtime}; BEGIN; ${insert}; UPDATE public.farm_v2_authorization_attempt SET state='SETTLED' WHERE request_id='key'; INSERT INTO public.farm_v2_land(user_id,land_id,lifecycle,access_active) VALUES('test',1,'EMPTY',false); INSERT INTO public.farm_v2_player_state(user_id,access_state,warehouse_state,mission_state,pet_state,farmer_state) VALUES('test','{}','{}','{}','{}','{}'); INSERT INTO public.farm_v2_mutation(user_id,request_id,action) VALUES('test','key','test'); COMMIT;`,
      );
      assert.throws(
        () =>
          sql(
            `SET ROLE ${runtime}; UPDATE public.core_wallets SET coin_balance=0`,
          ),
        /permission denied/,
      );
      assert.throws(
        () =>
          sql(
            `SET ROLE ${runtime}; INSERT INTO public.farm_v2_reconciliation_case(id,user_id,request_id,actor,evidence,status) VALUES('case','test','key','actor','evidence','OPEN')`,
          ),
        /permission denied/,
      );
      assert.throws(
        () =>
          sql(
            `SET ROLE ${operator}; INSERT INTO public.farm_v2_reconciliation_case(id,user_id,request_id,actor,evidence,status) VALUES('case','test','key','actor','evidence','OPEN'); INSERT INTO public.farm_v2_reconciliation_event(case_id,actor,action,evidence) VALUES('case','actor','OPEN','evidence')`,
          ),
        /permission denied/,
      );
      assert.throws(
        () =>
          sql(
            `SET ROLE ${operator}; UPDATE public.farm_v2_reconciliation_event SET actor='changed'`,
          ),
        /permission denied/,
      );
      assert.equal(
        sql(
          `SELECT has_function_privilege('${runtime}','public.farm_v2_apply_atomic_pot_wallet(uuid,uuid,text,jsonb,text)','EXECUTE')`,
        ),
        "t",
      );
      assert.equal(
        sql(
          `SELECT has_function_privilege('${runtime}','public.core_wallet_apply_transaction(uuid,integer,text,text,text,text,text,text,uuid)','EXECUTE')`,
        ),
        "f",
      );
      sql(`GRANT UPDATE ON public.core_wallets TO ${runtime}`);
      assert.throws(
        () => sql(grantsSql(runtime, operator)),
        /CORE_AUTHORITY_ROLE_CONFLICT/,
      );
      sql(`REVOKE UPDATE ON public.core_wallets FROM ${runtime}`);
      const { Pool } = createRequire(
        new URL("../lib/db/package.json", import.meta.url),
      )("pg");
      const pool = new Pool({
        ...farmDatabaseConfig({
          NODE_ENV: "test",
          DATABASE_URL: `postgresql://postgres@127.0.0.1:55432/${db}`,
        }),
        max: 2,
      });
      const a = await pool.connect(),
        b = await pool.connect();
      try {
        const pid = (await a.query("SELECT pg_backend_pid() AS pid")).rows[0]
          .pid;
        await a.query("SELECT pg_advisory_lock(881299)");
        await a.query("BEGIN");
        await a.query("SELECT 1");
        await a.query("COMMIT");
        await a.query("BEGIN");
        await a.query("ROLLBACK");
        assert.equal(
          (await a.query("SELECT pg_backend_pid() AS pid")).rows[0].pid,
          pid,
        );
        assert.equal(
          (await b.query("SELECT pg_try_advisory_lock(881299) AS acquired"))
            .rows[0].acquired,
          false,
        );
        assert.equal(
          (await a.query("SELECT pg_advisory_unlock(881299) AS released"))
            .rows[0].released,
          true,
        );
        assert.equal(
          (await b.query("SELECT pg_try_advisory_lock(881299) AS acquired"))
            .rows[0].acquired,
          true,
        );
        await b.query("SELECT pg_advisory_unlock(881299)");
      } finally {
        a.release(true);
        b.release(true);
        await pool.end();
      }
      const smoke = spawnSync(
        process.execPath,
        ["scripts/farm-v2-serverless-smoke.mjs"],
        {
          env: {
            ...process.env,
            FARM_V2_TEST_DATABASE_URL: `postgresql://postgres@127.0.0.1:55432/${db}`,
          },
          encoding: "utf8",
          timeout: 60000,
        },
      );
      assert.equal(smoke.status, 0, smoke.stderr);
      console.log(smoke.stdout.trim());
    } finally {
      sql(`DROP DATABASE ${db}`, "postgres");
      sql(
        `DROP ROLE IF EXISTS ${runtime}; DROP ROLE IF EXISTS ${operator}`,
        "postgres",
      );
    }
  },
);

test("Node 24 production configuration requires verified TLS and rejects transaction pooling", () => {
  for (const mode of ["session", "direct"]) {
    const c = farmDatabaseConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://runtime@db.example/postgres?sslmode=require",
      FARM_DB_CONNECTION_MODE: mode,
    });
    assert.equal(c.ssl.rejectUnauthorized, true);
    assert.equal(c.max, 1);
    assert.match(
      c.options,
      /statement_timeout=15000.*lock_timeout=3000.*idle_in_transaction_session_timeout=8000/,
    );
  }
  assert.throws(
    () =>
      farmDatabaseConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://runtime@db.example/postgres",
        FARM_DB_CONNECTION_MODE: "transaction",
      }),
    /FARM_SESSION_CONNECTION_REQUIRED/,
  );
});
