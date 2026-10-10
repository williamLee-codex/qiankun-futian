import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { atomicPotPreflightSql } from "./farm-v2-atomic-pot-preflight.mjs";
const enabled = Boolean(
  process.env.FARM_V2_TEST_DATABASE_URL &&
  process.env.FARM_V2_PLATFORM_CHECKOUT,
);
test(
  "atomic preflight rejects SELECT-only and missing land UPDATE grants",
  { skip: !enabled },
  async () => {
    const url = new URL(process.env.FARM_V2_TEST_DATABASE_URL);
    assert.equal(url.hostname, "127.0.0.1");
    assert.match(url.pathname, /^\/farm_v2_/);
    const { Pool } = createRequire(
      new URL("../lib/db/package.json", import.meta.url),
    )("pg");
    const pool = new Pool({ connectionString: url.toString() });
    const role = `farm_v2_acl_probe_${process.pid}`;
    try {
      await pool.query(
        `CREATE ROLE ${role}; GRANT USAGE ON SCHEMA public,core TO ${role}; GRANT SELECT ON farm_v2_player_state,farm_v2_land,farm_v2_mutation,farm_v2_authorization_attempt TO ${role}`,
      );
      const inspect = async () => {
        const result = await pool.query(
          atomicPotPreflightSql(process.env.FARM_V2_PLATFORM_CHECKOUT, role),
        );
        return JSON.parse(
          result.find((x) => x.rows.length)?.rows[0].json_build_object,
        );
      };
      const readOnly = await inspect();
      assert.equal(readOnly.farm_v2_player_state_runtime_access, false);
      assert.equal(readOnly.farm_v2_mutation_runtime_access, false);
      assert.equal(readOnly.farm_v2_land_runtime_access, false);
      await pool.query(
        `GRANT INSERT,UPDATE ON farm_v2_player_state,farm_v2_mutation,farm_v2_authorization_attempt TO ${role}; GRANT INSERT ON farm_v2_land TO ${role}`,
      );
      assert.equal((await inspect()).farm_v2_land_runtime_access, false);
      await pool.query(`GRANT UPDATE ON farm_v2_land TO ${role}`);
      const complete = await inspect();
      for (const table of [
        "farm_v2_player_state",
        "farm_v2_land",
        "farm_v2_mutation",
        "farm_v2_authorization_attempt",
      ])
        assert.equal(complete[table + "_runtime_access"], true);
    } finally {
      await pool.query(`DROP OWNED BY ${role}; DROP ROLE ${role}`);
      await pool.end();
    }
  },
);
