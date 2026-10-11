import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  createRolesSql,
  rolePreflightSql,
  revokeRolesSql,
} from "./farm-v2-runtime-roles.mjs";
import { grantsSql } from "./farm-v2-production-authority.mjs";
test("role SQL rejects reserved roles and is password-free/read-only in review", () => {
  assert.throws(
    () => createRolesSql("postgres", "farm_operator"),
    /INVALID_FARM_ROLE/,
  );
  assert.match(
    createRolesSql("farm_runtime", "farm_operator"),
    /LOGIN.*NOINHERIT.*CONNECTION LIMIT 0 PASSWORD NULL/,
  );
  assert.match(
    rolePreflightSql("farm_runtime", "farm_operator"),
    /^BEGIN READ ONLY;/,
  );
  assert.doesNotMatch(
    revokeRolesSql("farm_runtime", "farm_operator"),
    /^\s*DROP OWNED/m,
  );
});
test(
  "isolated LOGIN roles, restricted grants, inherited definer rejection and revocation",
  { skip: process.env.LOCAL_TEST_POSTGRES_CONTAINER !== "farm-v2-p0-test-db" },
  () => {
    const c = process.env.LOCAL_TEST_POSTGRES_CONTAINER,
      d = `farm_v2_roles_${process.pid}`,
      r = `farm_rt_${process.pid}`,
      o = `farm_ro_${process.pid}`;
    const sql = (s, db = d) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          c,
          "psql",
          "-X",
          "-q",
          "-U",
          "postgres",
          "-d",
          db,
          "-At",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: s, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
    sql(
      `CREATE DATABASE ${d} TEMPLATE farm_v2_core_contract_final`,
      "postgres",
    );
    try {
      sql(createRolesSql(r, o));
      assert.equal(
        sql(
          `SELECT rolcanlogin AND NOT rolinherit AND NOT rolsuper AND NOT rolbypassrls AND rolconnlimit=0 FROM pg_roles WHERE rolname='${r}'`,
        ),
        "t",
      );
      assert.throws(() => sql(createRolesSql(r, o)), /ROLE_ALREADY_EXISTS/);
      sql(grantsSql(r, o));
      assert.throws(
        () =>
          sql(
            `SET ROLE ${o}; UPDATE public.farm_v2_mutation SET transaction_state='COMPLETED'`,
          ),
        /permission denied/,
      );
      assert.throws(
        () =>
          sql(
            `SET ROLE ${o}; SELECT public.farm_v2_apply_atomic_pot_wallet(NULL,NULL,NULL,NULL,NULL)`,
          ),
        /permission denied/,
      );
      assert.throws(
        () =>
          sql(`SET ROLE ${r}; UPDATE public.core_wallets SET coin_balance=0`),
        /permission denied/,
      );
      sql(
        `SET ROLE ${o}; INSERT INTO public.farm_v2_reconciliation_case(id,user_id,request_id,actor,evidence,status) VALUES('runtime-review','test','runtime-review','operator','isolated','OPEN'); INSERT INTO public.farm_v2_reconciliation_event(case_id,actor,action,evidence) VALUES('runtime-review','operator','OPEN','isolated');`,
      );
      assert.throws(
        () =>
          sql(
            `SET ROLE ${o}; UPDATE public.farm_v2_reconciliation_event SET actor='changed'`,
          ),
        /permission denied/,
      );
      sql(`GRANT service_role TO ${r}`);
      assert.throws(() => sql(grantsSql(r, o)), /UNSAFE_FARM_ROLE/);
      sql(`REVOKE service_role FROM ${r}`);
      sql(rolePreflightSql(r, o));
      sql(revokeRolesSql(r, o));
      assert.equal(
        sql(`SELECT NOT rolcanlogin FROM pg_roles WHERE rolname='${r}'`),
        "t",
      );
      assert.equal(
        sql(
          `SELECT has_table_privilege('${r}','public.farm_v2_mutation','UPDATE')`,
        ),
        "f",
      );
    } finally {
      sql(`DROP DATABASE ${d}`, "postgres");
      sql(`DROP ROLE IF EXISTS ${r}; DROP ROLE IF EXISTS ${o}`, "postgres");
    }
  },
);
