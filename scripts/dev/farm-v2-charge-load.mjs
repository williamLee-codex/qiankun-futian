#!/usr/bin/env node
/**
 * Concurrency check for the atomic charge RPC against an isolated database.
 * It measures the wallet path only, never a deployed site. Usage:
 *   FARM_V2_TEST_DATABASE_URL=postgres://... node scripts/dev/farm-v2-charge-load.mjs 100
 */
import { createRequire } from "node:module";
// Resolve pg from the database package that owns the dependency.
const pg = createRequire(new URL("../../lib/db/package.json", import.meta.url))("pg");

const url = process.env.FARM_V2_TEST_DATABASE_URL;
if (!url) throw new Error("FARM_V2_TEST_DATABASE_URL must be set");
const players = Number(process.argv[2] ?? 100);
// Bounded connections: the request count is the load, not the socket count.
const pool = new pg.Pool({ connectionString: url, max: Math.min(players, 50) });

const ids = Array.from(
  { length: players },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
await pool.query("INSERT INTO auth.users(id) SELECT unnest($1::uuid[]) ON CONFLICT DO NOTHING", [ids]);
for (const id of ids) {
  await pool.query("SELECT core_wallet_get_or_create($1)", [id]);
  await pool.query("UPDATE core_wallets SET coin_balance=500 WHERE owner_id=$1", [id]);
}

const stamp = Date.now();
const started = Date.now();
const results = await Promise.allSettled(
  ids.map(async (id, index) => {
    const at = Date.now();
    const { rows } = await pool.query(
      "SELECT public.core_wallet_apply_transaction($1::uuid,3,'coin','debit',$2,'farm_seed_purchase','1:1','farm_seed_pack',null) AS r",
      [id, `load-${stamp}-${index + 1}-primary`],
    );
    // "duplicate" is the idempotent replay: it must never charge twice.
    if (!["created", "applied", "duplicate"].includes(rows[0].r.result_status))
      throw new Error(rows[0].r.result_status);
    return Date.now() - at;
  }),
);
const elapsed = (Date.now() - started) / 1000;
const latencies = results.filter((r) => r.status === "fulfilled").map((r) => r.value).sort((a, b) => a - b);
const pct = (q) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))];
const failed = results.filter((r) => r.status === "rejected");
console.log(JSON.stringify({
  players,
  requests_per_second: Number((players / elapsed).toFixed(1)),
  elapsed_seconds: Number(elapsed.toFixed(2)),
  p50_ms: pct(0.5), p95_ms: pct(0.95), max_ms: latencies[latencies.length - 1],
  error_rate: Number((failed.length / players).toFixed(4)),
  sample_error: failed[0]?.reason?.message ?? null,
}, null, 2));
await pool.end();
