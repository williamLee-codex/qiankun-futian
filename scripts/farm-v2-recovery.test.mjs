import { createRequire } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { grantsSql } from "./farm-v2-production-authority.mjs";
import { createRolesSql } from "./farm-v2-runtime-roles.mjs";
test(
  "isolated original-key recovery observations, readonly operator and atomic audit",
  { skip: process.env.LOCAL_TEST_POSTGRES_CONTAINER !== "farm-v2-p0-test-db" },
  async (t) => {
    const c = process.env.LOCAL_TEST_POSTGRES_CONTAINER,
      db = `farm_v2_recovery_${process.pid}`,
      rt = `farm_rec_rt_${process.pid}`,
      op = `farm_rec_op_${process.pid}`;
    const sql = (s, d = db) =>
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
          d,
          "-At",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: s, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
    sql(
      `CREATE DATABASE ${db} TEMPLATE farm_v2_core_contract_final`,
      "postgres",
    );
    try {
      sql(
        readFileSync(
          "lib/db/migrations/0003_farm_v2_recovery_observation.sql",
          "utf8",
        ),
      );
      sql(createRolesSql(rt, op));
      sql(grantsSql(rt, op));
      const owner = sql("SELECT owner_id FROM public.core_wallets LIMIT 1");
      assert.ok(owner);
      const inspect = (key, role = op) =>
        JSON.parse(
          sql(
            `SET ROLE ${role}; BEGIN READ ONLY; SELECT public.farm_v2_inspect_recovery('${owner}','${key}'); ROLLBACK;`,
          ),
        );
      assert.equal(inspect("lost-response").status, "UNKNOWN");
      assert.equal(inspect("lost-response").mayCreateNewKey, false);
      sql(
        `INSERT INTO public.farm_v2_mutation(user_id,request_id,action,transaction_state) VALUES('${owner}','pending-original','seed-purchase:1:1','WALLET_PENDING')`,
      );
      assert.equal(
        inspect("pending-original").status,
        "REPLAY_ORIGINAL_HANDLER",
      );
      const snapshot = () => sql(`SELECT jsonb_build_object(
        'wallets',(SELECT jsonb_agg(w ORDER BY owner_id) FROM public.core_wallets w),
        'ledger',(SELECT jsonb_agg(l ORDER BY id) FROM public.core_wallet_ledger l),
        'mutations',(SELECT jsonb_agg(m ORDER BY user_id,request_id) FROM public.farm_v2_mutation m),
        'players',(SELECT jsonb_agg(p ORDER BY user_id) FROM public.farm_v2_player_state p))`);
      const denied = (key) => {
        const before = snapshot();
        for (let i=0;i<2;i++) {
          const result = inspect(key);
          assert.equal(result.status, 'AUTHORITY_REVIEW_REQUIRED');
          assert.equal(result.mayCreateNewKey, false);
          sql(`SET ROLE ${rt}; SELECT public.farm_v2_observe_recovery('${owner}','${key}')`);
        }
        assert.equal(snapshot(), before, 'inspection/repeated observation must not mutate economic state');
        assert.equal(sql(`SELECT count(*) FROM public.farm_v2_reconciliation_event WHERE details->>'requestId'='${key}' AND details->>'status'='REPLAY_ORIGINAL_HANDLER'`), '0');
        assert.throws(() => sql(`SET ROLE ${op}; UPDATE public.farm_v2_mutation SET transaction_state='COMPLETED' WHERE request_id='${key}'`), /permission denied/);
      };
      for (const state of ['COMPLETED','PENDING','WALLET_PENDING','WALLET_APPLIED']) {
        await t.test(`legacy ${state} with inverse refuses replay`, () => {
          const key = `inverse-${state}`;
          sql(`SELECT public.core_wallet_apply_transaction('${owner}',1,'coin','credit','farm-v2:${key}:primary','farm_seed_purchase','fixture','fixture',NULL)`);
          const primary = sql(`SELECT id FROM public.core_wallet_ledger WHERE owner_id='${owner}' AND idempotency_key='farm-v2:${key}:primary'`);
          sql(`SELECT public.core_wallet_apply_transaction('${owner}',1,'coin','debit','farm-v2:${key}:compensation','farm_wallet_compensation','${key}','farm_wallet_compensation','${primary}')`);
          sql(`INSERT INTO public.farm_v2_mutation(user_id,request_id,action,response,transaction_state) VALUES('${owner}','${key}','seed-purchase:1:1','{}','${state}')`);
          assert.equal(inspect(key).inverseCount, 1);
          denied(key);
        });
      }
      await t.test('compensation key without inverse refuses replay', () => {
        const key='ambiguous-compensation';
        sql(`SELECT public.core_wallet_apply_transaction('${owner}',1,'coin','credit','farm-v2:${key}:compensation','fixture','fixture','fixture',NULL)`);
        sql(`INSERT INTO public.farm_v2_mutation(user_id,request_id,action,transaction_state) VALUES('${owner}','${key}','seed-purchase:1:1','PENDING')`);
        assert.equal(inspect(key).inverseCount, 0);
        denied(key);
      });
      await t.test('closed request without ledger refuses replay', () => {
        sql(`INSERT INTO public.farm_v2_wallet_closures VALUES('${owner}','closed-original','fixture','fixture','fixture','CANCELED',now()); INSERT INTO public.farm_v2_mutation(user_id,request_id,action,transaction_state) VALUES('${owner}','closed-original','seed-purchase:1:1','PENDING')`);
        denied('closed-original');
      });
      await t.test('journal pointing to another owner cannot authorize replay', () => {
        const other='00000000-0000-4000-8000-000000000099';
        sql(`INSERT INTO auth.users(id) VALUES('${other}'); SELECT public.core_wallet_apply_transaction('${other}',1,'coin','credit','foreign-fixture','fixture','fixture','fixture',NULL)`);
        const foreign=sql(`SELECT id FROM public.core_wallet_ledger WHERE owner_id='${other}' AND idempotency_key='foreign-fixture'`);
        assert.ok(foreign, 'fixture must include another owner ledger');
        sql(`INSERT INTO public.farm_v2_mutation(user_id,request_id,action,response,transaction_state,wallet_transaction) VALUES('${owner}','foreign-owner','seed-purchase:1:1','{}','COMPLETED','{"coreTransactionId":"${foreign}"}')`);
        denied('foreign-owner');
      });
      for (const state of ['COMPENSATING','COMPENSATED']) {
        await t.test(`${state} label without ledger proof cannot authorize replay`, () => {
          const key=`unproved-${state}`;
          sql(`INSERT INTO public.farm_v2_mutation(user_id,request_id,action,response,transaction_state) VALUES('${owner}','${key}','seed-purchase:1:1','{}','${state}')`);
          denied(key);
        });
      }
      await t.test('safe original-key retry and owner isolation', () => {
        const before=snapshot();
        assert.deepEqual(inspect('pending-original'), inspect('pending-original'));
        assert.equal(inspect('pending-original').status,'REPLAY_ORIGINAL_HANDLER');
        const other='00000000-0000-4000-8000-000000000099';
        const result=JSON.parse(sql(`SET ROLE ${op}; BEGIN READ ONLY; SELECT public.farm_v2_inspect_recovery('${other}','pending-original'); ROLLBACK;`));
        assert.equal(result.status,'UNKNOWN');
        assert.equal(result.primaryTransactionId,null);
        assert.equal(snapshot(),before);
      });
      // Genuine Core RPC creates fixture ledger; recovery never directly writes it.
      sql(
        `SELECT public.core_wallet_apply_transaction('${owner}',1,'coin','credit','farm-v2:atomic-original:primary','farm_pot_synthesis','fixture','farm_pot_synthesis',NULL)`,
      );
      const id = sql(
        `SELECT id FROM public.core_wallet_ledger WHERE owner_id='${owner}' AND idempotency_key='farm-v2:atomic-original:primary'`,
      );
      const command = '{"kind":"synthesize","species":1,"grade":1}';
      sql(
        `INSERT INTO public.farm_v2_atomic_pot_receipts(user_id,request_id,transaction_id,command) VALUES('${owner}','atomic-original','${id}','${command}'); INSERT INTO public.farm_v2_mutation(user_id,request_id,action,response,transaction_state,wallet_transaction) VALUES('${owner}','atomic-original','WORKSHOP:${command}','{}','COMPLETED','{"coreTransactionId":"${id}"}')`,
      );
      assert.equal(inspect("atomic-original").status, "VERIFIED_COMPLETED");
      const balance = sql(
          `SELECT coin_balance FROM public.core_wallets WHERE owner_id='${owner}'`,
        ),
        count = sql("SELECT count(*) FROM public.core_wallet_ledger");
      for (let i = 0; i < 3; i++)
        sql(
          `SET ROLE ${rt}; SELECT public.farm_v2_observe_recovery('${owner}','atomic-original')`,
        );
      assert.equal(
        sql("SELECT count(*) FROM public.core_wallet_ledger"),
        count,
      );
      assert.equal(
        sql(
          `SELECT coin_balance FROM public.core_wallets WHERE owner_id='${owner}'`,
        ),
        balance,
      );
      assert.equal(
        sql(
          `SELECT count(*) FROM public.farm_v2_reconciliation_event WHERE details->>'requestId'='atomic-original'`,
        ),
        "3",
      );
      assert.throws(
        () =>
          sql(
            `SET ROLE ${op}; SELECT public.farm_v2_observe_recovery('${owner}','atomic-original')`,
          ),
        /permission denied/,
      );
      assert.throws(
        () =>
          sql(
            `SET ROLE ${op}; UPDATE public.farm_v2_mutation SET transaction_state='COMPLETED'`,
          ),
        /permission denied/,
      );
      assert.throws(
        () =>
          sql(
            `SET ROLE ${op}; INSERT INTO public.farm_v2_reconciliation_event(case_id,actor,action,evidence) VALUES('x','x','x','x')`,
          ),
        /permission denied/,
      );
      sql(
        `UPDATE public.farm_v2_mutation SET response=NULL WHERE user_id='${owner}' AND request_id='atomic-original'`,
      );
      assert.equal(
        inspect("atomic-original").status,
        "AUTHORITY_REVIEW_REQUIRED",
      );
      assert.equal(
        inspect("atomic-original", rt).status,
        "AUTHORITY_REVIEW_REQUIRED",
      );
      // SQL disconnect/rollback and lock failure are unknown, not manufactured failures.
      sql(
        `BEGIN; SELECT public.farm_v2_observe_recovery('${owner}','timeout-original'); ROLLBACK;`,
      );
      assert.equal(
        sql(
          "SELECT count(*) FROM public.farm_v2_reconciliation_event WHERE details->>'requestId'='timeout-original'",
        ),
        "0",
      );
      assert.equal(inspect("timeout-original").status, "UNKNOWN");
      assert.equal(inspect("different-owner-key").status, "UNKNOWN");
      const { Pool } = createRequire(
        new URL("../lib/db/package.json", import.meta.url),
      )("pg");
      const pool = new Pool({
        connectionString: `postgresql://postgres@127.0.0.1:55432/${db}`,
        max: 2,
      });
      const a = await pool.connect(),
        b = await pool.connect();
      let bReleased = false;
      try {
        await a.query(
          "BEGIN; LOCK TABLE public.farm_v2_mutation IN ACCESS EXCLUSIVE MODE",
        );
        await b.query("SET lock_timeout=50");
        await assert.rejects(
          b.query("SELECT public.farm_v2_inspect_recovery($1::uuid,$2)", [
            owner,
            "atomic-original",
          ]),
          (e) => e.code === "55P03",
        );
        await a.query("ROLLBACK");
        const recovered = await b.query(
          "SELECT public.farm_v2_inspect_recovery($1::uuid,$2) AS result",
          [owner, "atomic-original"],
        );
        assert.equal(
          recovered.rows[0].result.status,
          "AUTHORITY_REVIEW_REQUIRED",
        );
        await b.query("BEGIN");
        await b.query("SELECT public.farm_v2_observe_recovery($1::uuid,$2)", [
          owner,
          "disconnect-original",
        ]);
        // Simulated service loss destroys a transaction before COMMIT.
        b.release(true);
        bReleased = true;
        assert.equal(inspect("disconnect-original").status, "UNKNOWN");
        assert.equal(
          sql(
            "SELECT count(*) FROM public.farm_v2_reconciliation_event WHERE details->>'requestId'='disconnect-original'",
          ),
          "0",
        );
      } finally {
        a.release(true);
        if (!bReleased) b.release(true);
        await pool.end();
      }
      const core = sql(
        "SELECT md5(pg_get_functiondef('public.core_wallet_apply_transaction(uuid,integer,text,text,text,text,text,text,uuid)'::regprocedure))",
      );
      inspect("atomic-original");
      assert.equal(
        sql(
          "SELECT md5(pg_get_functiondef('public.core_wallet_apply_transaction(uuid,integer,text,text,text,text,text,text,uuid)'::regprocedure))",
        ),
        core,
      );
    } finally {
      sql(`DROP DATABASE ${db}`, "postgres");
      sql(`DROP ROLE IF EXISTS ${rt}; DROP ROLE IF EXISTS ${op}`, "postgres");
    }
  },
);
