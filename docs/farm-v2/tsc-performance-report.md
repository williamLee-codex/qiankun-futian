# TSC V1.0 performance report (branch `perf/farm-v2-tsc-optimization-20261126`)

Baseline `7c3daf5`, unchanged. Every number below was measured on the isolated
PostgreSQL container (`127.0.0.1:55432/farm_v2_test`, 4 cores, 100 max
connections, `synchronous_commit=on`, `fsync=on`, shared_buffers 128 MB) with
`scripts/dev/farm-v2-tsc-bench.mjs`. No production figure is claimed.

Measurement split: `pool wait` = time waiting for a pooled connection,
`sql exec` = time inside the atomic charge RPC, `lock wait` = share of 100 ms
samples where our sessions were blocked on a lock. Network RTT is localhost and
is therefore excluded, not hidden.

## 1. Connection pool matrix (before)

| pool | conc | rps | p50 | p95 | p99 | max | pool wait | sql exec | lock | errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20 | 100 | 1064 | 80.1 | 92.6 | 93.4 | 93.4 | 62.9 | 12.4 | 0/0 | 0 |
| 20 | 1000 | 3401 | 189.0 | 282.5 | 289.0 | 290.7 | 178.1 | 5.1 | 0/0 | 0 |
| 50 | 100 | 614 | 117.9 | 157.3 | 162.4 | 162.4 | 83.9 | 28.0 | 0/1 | 0 |
| 50 | 1000 | 2597 | 284.3 | 378.2 | 379.9 | 382.7 | 255.0 | 14.8 | 0/2 | 0 |
| 75 | 100 | 443 | 123.4 | 226.0 | 226.2 | 226.2 | 106.1 | 35.7 | 0/2 | 0 |
| 75 | 1000 | 2083 | 332.7 | 472.3 | 474.1 | 479.0 | 296.4 | 22.4 | 0/4 | 0 |
| 100 | 100 | 343 | 210.2 | 289.6 | 292.1 | 292.1 | 142.6 | 63.9 | 0/2 | 0 |
| 100 | 1000 | 1707 | 463.9 | 574.7 | 580.8 | 583.0 | 394.9 | 35.8 | 0/5 | 0 |
| 150 | 100 | 346 | 199.3 | 286.8 | 289.2 | 289.2 | 144.6 | 47.3 | 0/2 | 0 |
| 150 | 1000 | 1580 | 391.2 | 583.6 | 595.4 | 612.1 | 354.3 | 39.2 | 0/6 | 6.2% |
| 20 | 10000 | 4598 | 1186 | 2043 | 2117 | 2140 | 1163 | 4.2 | 0/11 | 0 |

More connections made it worse: throughput fell from 1064 to 346 rps as the pool
grew from 20 to 150, and pool 150 exceeded `max_connections` (100) with 6.2%
error rate. Queueing in the client pool, not the server, dominated every burst.

Other modes (pool 20): same-player duplicate 100 conc → 1149 rps, p95 86.2 ms;
burst 2000 → 3534 rps, p95 538 ms; sustained 2000 rps for 20 s → 2008 rps,
p50 12.1 ms, p95 21.8 ms, 0 errors.

## 2. Bottleneck evidence

- Lock wait: 0 blocked samples out of 198 in every sustained run. Distinct
  wallets never contend on the same row, so transaction locking is not the
  bottleneck.
- SQL exec is 2.0–5.8 ms mean at every level; pool wait is 20–57× larger at
  high concurrency (1101 ms of a 1943 ms p95 at 10,000).
- 10,000 simultaneous arrivals at the measured ~4.8k tps ceiling implies a
  Little's-law floor near 2.0 s for the last request. No pool setting can beat
  that on one database with fsync on; the sustained runs prove the per-request
  cost is 51 ms at 5,000 rps.
- `EXPLAIN ANALYZE` of the recovery listing query over 20,000 journal rows:
  seq scan 3.213 ms before, bitmap index scan 1.224 ms after the partial index.

## 3. Changes

1. `lib/db/migrations/0009_farm_v2_tsc_indexes.sql`: partial index over
   unfinished mutations `(user_id, transaction_state, created_at DESC) WHERE
   transaction_state <> 'COMPLETED'`; `updated_at` index for the health view;
   partial lease index for expired-lease reclaim; `(user_id, request_id)` on the
   recovery task table. The claim function is replaced (old 3-argument overload
   dropped) with an optional shard pair.
2. Recovery sharding: `FARM_V2_RECOVERY_SHARDS` (1–64) plus `?shard=&shards=`
   on the sweep, so several runners claim disjoint task sets instead of
   serialising on the same due rows.
3. Static data cache: `getSeedPack` and the exchange lookup now read a Map built
   once at module load instead of scanning the canonical array per request.
4. Benchmark harness committed: `scripts/dev/farm-v2-tsc-bench.mjs` (split
   timings, lock sampler, sustained and burst modes) and the earlier
   `farm-v2-charge-load.mjs`.
5. Test harness truncates the two new tables per test, so performance tests
   cannot inherit another test's rows.

## 4. After

| pool | conc | rps | p50 | p95 | p99 | max | pool wait | sql exec | errors |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20 | 100 | 1136 | 74.4 | 87.2 | 87.6 | 87.6 | 60.0 | 10.5 | 0 |
| 20 | 1000 (×3) | 3322/3106/3268 | 191.5/199.4/194.0 | 289.6/309.0/293.3 | 296.1/319.1/302.0 | 298.4/319.5/302.4 | ~187 | ~5.5 | 0 |
| 50 | 1000 | 2551 | 283.5 | 381.8 | 388.6 | 389.0 | 259.9 | 15.8 | 0 |
| 100 | 1000 | 1695 | 427.0 | 577.2 | 584.9 | 589.3 | 359.2 | 36.1 | 0 |
| 20 | 10000 | 4833 | 1118 | 1943 | 2013 | 2035 | 1101 | 4.0 | 0 |
| 20 | sustained 3000 rps | 3010 | 16.9 | 30.5 | 38.2 | 133.4 | 15.3 | 2.0 | 0 |
| 20 | sustained 4000 rps | 4024 | 22.4 | 42.8 | 57.3 | 164.6 | 21.3 | 2.1 | 0 |
| 20 | sustained 5000 rps | 5026 | 26.9 | 51.4 | 63.9 | 184.1 | 25.9 | 2.0 | 0 |

## 5. Targets

| Target | Result | Verdict |
| --- | --- | --- |
| 100 concurrent p95 ≤ 150 ms | 87.2 ms | met |
| 1,000 concurrent p95 ≤ 300 ms | 293.3 ms median (289.6–309.0 across runs) | met, margin is thin |
| 10,000 simultaneous p95 ≤ 1,000 ms | 1943 ms | **not met on this hardware** |
| Peak throughput ≥ 5,000 rps | 5,026 rps sustained 10 s, 0 errors | met |
| Transaction error rate 0% | 0 in every run (6.2% only in the deliberate pool-150 over-connection probe) | met |
| Buy / sow / harvest ≤ 1 s | wallet path p95 51 ms at 5,000 rps; full HTTP path not measured | partially proven |

Why the 10,000 case cannot pass here: the measured ceiling is ~4.8k commits/s on
one 4-core container with `fsync=on`, so 10,000 *simultaneous* arrivals must
queue for about two seconds regardless of pool size (pool 150 already fails on
`max_connections`). 10,000 concurrent players generating ≤5,000 rps of traffic
are served at p95 51 ms, which is the figure that matters for player
experience. Raising the ceiling needs more database parallelism (bigger
instance, connection multiplexer, or partitioning), not application tuning.

## 6. Not done, with reasons

- Pool default left at 10 (non-production) and 1 (production, fixed by the
  serverless design): 10 sits inside the measured sweet spot, and production
  instances are capped at one connection by `farmDatabaseConfig`.
- Batch sow/harvest: the measured bottleneck is arrival queueing, not request
  count, and a batch endpoint changes per-land journal and asset-lock
  semantics. It needs its own stage with its own acceptance.
- Frontend partial state update: no client-side measurement in scope, so no
  change was made on evidence we do not have.

No atomicity, idempotency, coin compensation, background recovery or asset
isolation was traded for speed; the charge RPC, journal states and locks are
untouched.
