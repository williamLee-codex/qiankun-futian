#!/usr/bin/env node
/**
 * TSC performance harness for the atomic charge path on an isolated database.
 * It separates pool wait, SQL execution and lock wait, and never claims a
 * deployed-site capacity. Usage:
 *   FARM_V2_TEST_DATABASE_URL=postgres://... node scripts/dev/farm-v2-tsc-bench.mjs \
 *     --mode charge --concurrency 100 --pool 50 --label before
 */
import { createRequire } from "node:module";
import { appendFileSync } from "node:fs";

const pg = createRequire(new URL("../../lib/db/package.json", import.meta.url))("pg");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const url = process.env.FARM_V2_TEST_DATABASE_URL;
if (!url) throw new Error("FARM_V2_TEST_DATABASE_URL must be set");

const mode = flag("mode", "charge");
const concurrency = Number(flag("concurrency", 100));
const poolSize = Number(flag("pool", 50));
const label = flag("label", "run");
const sustainSeconds = Number(flag("sustain", 0));
const targetRps = Number(flag("rate", 0));
const outFile = flag("out", "");

const players = Math.max(concurrency, 1);
const ids = Array.from(
  { length: players },
  (_, i) => `00000000-0000-4000-9000-${String(i + 1).padStart(12, "0")}`,
);
const pool = new pg.Pool({
  connectionString: url,
  max: poolSize,
  application_name: "tsc_bench",
});

await pool.query("INSERT INTO auth.users(id) SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING", [ids]);
for (const id of ids) {
  await pool.query("SELECT core_wallet_get_or_create($1)", [id]);
  await pool.query("UPDATE core_wallets SET coin_balance=100000 WHERE owner_id=$1", [id]);
}

// Lock-wait sampler: how many of our sessions are blocked while the load runs.
let lockSamples = 0;
let lockHits = 0;
let sampler;
const sample = async () => {
  try {
    const { rows } = await pool.query(
      `SELECT count(*) FILTER (WHERE wait_event_type='Lock')::int AS blocked,
              count(*)::int AS active
         FROM pg_stat_activity
        WHERE application_name='tsc_bench' AND state='active'`,
    );
    lockSamples += 1;
    if (rows[0].blocked > 0) lockHits += 1;
  } catch {}
};

const stamp = Date.now();
const one = async (index) => {
  const id = ids[index % ids.length];
  // Same-player mode reuses one key: the idempotent replay path.
  const key =
    mode === "duplicate" ? `dup-${stamp}` : `bench-${stamp}-${index}-primary`;
  const t0 = process.hrtime.bigint();
  const client = await pool.connect();
  const t1 = process.hrtime.bigint();
  try {
    const { rows } = await client.query(
      "SELECT public.core_wallet_apply_transaction($1::uuid,3,'coin','debit',$2,'farm_seed_purchase','1:1','farm_seed_pack',null) AS r",
      [id, key],
    );
    const t2 = process.hrtime.bigint();
    const status = rows[0].r.result_status;
    if (!["created", "applied", "duplicate"].includes(status))
      throw new Error(status);
    return {
      pool: Number(t1 - t0) / 1e6,
      exec: Number(t2 - t1) / 1e6,
      total: Number(t2 - t0) / 1e6,
    };
  } finally {
    client.release();
  }
};

const runBatch = async (count) => {
  const out = [];
  await Promise.all(
    Array.from({ length: count }, (_, i) =>
      one(i).then(
        (value) => out.push(value),
        (error) => out.push({ error: error.message }),
      ),
    ),
  );
  return out;
};

const results = [];
const startedAt = Date.now();
sampler = setInterval(sample, 100);
if (sustainSeconds > 0) {
  // Sustained load: a fixed rate for a fixed time.
  const perTick = Math.max(1, Math.round(targetRps / 10));
  const ticks = sustainSeconds * 10;
  for (let tick = 0; tick < ticks; tick++) {
    const at = startedAt + tick * 100;
    const wait = at - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    results.push(...(await runBatch(perTick)));
  }
} else {
  results.push(...(await runBatch(concurrency)));
}
const elapsed = (Date.now() - startedAt) / 1000;
clearInterval(sampler);

const ok = results.filter((r) => !r.error);
const failed = results.filter((r) => r.error);
const sorted = (key) => ok.map((r) => r[key]).sort((a, b) => a - b);
const at = (list, q) => list[Math.min(list.length - 1, Math.floor(q * list.length))] ?? null;
const total = sorted("total");
const round = (n) => (n === null ? null : Number(n.toFixed(1)));
const report = {
  label,
  mode,
  concurrency: sustainSeconds > 0 ? `sustained ${sustainSeconds}s @ ${targetRps}rps` : concurrency,
  pool: poolSize,
  requests: results.length,
  seconds: Number(elapsed.toFixed(2)),
  rps: Number((results.length / elapsed).toFixed(1)),
  p50_ms: round(at(total, 0.5)),
  p95_ms: round(at(total, 0.95)),
  p99_ms: round(at(total, 0.99)),
  max_ms: round(total[total.length - 1] ?? null),
  mean_pool_wait_ms: round(ok.reduce((s, r) => s + r.pool, 0) / Math.max(ok.length, 1)),
  mean_sql_exec_ms: round(ok.reduce((s, r) => s + r.exec, 0) / Math.max(ok.length, 1)),
  lock_wait_samples: `${lockHits}/${lockSamples}`,
  error_rate: Number((failed.length / Math.max(results.length, 1)).toFixed(4)),
  sample_error: failed[0]?.error ?? null,
};
const line = JSON.stringify(report);
console.log(line);
if (outFile) appendFileSync(outFile, `${line}\n`);
await pool.end();
