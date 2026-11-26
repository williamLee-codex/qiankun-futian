# Farm V2 TSC V1.0 — delivery record (40% → 100%)

Branch `stage40/farm-v2-resource-precheck-20261126`. No merge to `main`, no
production migration applied.

## Commits

| Stage | Commit | Backup branch | Tag |
| --- | --- | --- | --- |
| 40% materials pre-check wired | `7bd0c56` | `backup/farm-v2-40pct-wired-7bd0c56` | `farm-v2-40pct-materials` |
| 50% coin compensation | `82260de` | `backup/farm-v2-50pct-82260de` | `farm-v2-50pct-compensation` |
| 60% durable recovery queue | `9671268` | `backup/farm-v2-60pct-9671268` | `farm-v2-60pct-recovery-queue` |
| 70% isolation evidence | `990fff2` | `backup/farm-v2-70pct-990fff2` | `farm-v2-70pct-isolation` |
| 80% monitoring + 90% shared contract | `59d753c` | `backup/farm-v2-90pct-59d753c` | `farm-v2-80pct-monitoring`, `farm-v2-90pct-tsc-contract` |

CI (all success): 45784076344 (40%), 45786317906 + 45786322930 (50%),
45792309374 + 45792313853 (60%), 45795389710 + 45795394017 (70–90%).

## Files

Server: `lib/db/migrations/0006_farm_v2_coin_compensation.sql`,
`0007_farm_v2_recovery_task.sql`, `0008_farm_v2_transaction_health.sql`;
`lib/db/src/schema/farm-v2.ts`;
`artifacts/api-server/src/lib/farm-v2-coin-compensation{,.policy}.ts`,
`farm-v2-recovery-queue.ts`, `farm-v2-recovery-config.ts`,
`farm-v2-transaction-health{,.policy}.ts`, `tsc-contract.ts`,
`farm-v2-wallet-saga.ts`, `farm-v2-precheck.ts`, `farm-v2-workshop.ts`,
`farm-v2-atomic-pot.ts`, `routes/farm-v2.ts`;
client: `FarmV2AuthenticatedView.tsx`, `FarmWorkshopPanel.tsx`,
`PotSynthesisGrid.tsx`, `MaterialShortageNotice`;
ops: `vercel.json` (cron), `.github/workflows/farm-v2-recovery-sweep.yml`,
`scripts/dev/farm-v2-charge-load.mjs`, `docs/farm-v2/tsc-v1-contract.md`.

## Migrations to apply, in order

`0006_farm_v2_coin_compensation.sql` → `0007_farm_v2_recovery_task.sql` →
`0008_farm_v2_transaction_health.sql`. All three are additive: new tables,
functions and one view. No existing column, row or constraint is changed, and
each can be rolled back by dropping only the objects it creates.

## Environment required before the first sweep

- `FARM_V2_RECOVERY_CRON_SECRET` — opens the sweep endpoint; unset means closed.
- `FARM_V2_ADMIN_KEY` (≥16 chars) — opens the operator health view; unset means closed.
- Optional timings: `FARM_V2_RECOVERY_LEASE_SECONDS` (60),
  `FARM_V2_RECOVERY_BATCH` (10), `FARM_V2_RECOVERY_MAX_ATTEMPTS` (8),
  `FARM_V2_RECOVERY_BACKOFF_SECONDS` (30), `FARM_V2_RECOVERY_MAX_BACKOFF_SECONDS` (3600).

## Acceptance evidence

- api-server: 64+ test files green; integration suite 63 passed / 2 skipped on a
  throw-away PostgreSQL built only from migrations and fixtures.
- 40%: refusal happens before any journal row, charge or reservation; all
  shortage names, required, held and missing amounts are reported.
- 50%: a lost charge answer is refunded in full once; concurrent compensation
  credits once; crystals and delivered requests are never refunded.
- 60%: two runners never share a task; an expired lease is reclaimed; a task
  with conflicting evidence stops at `abandoned` with its reason recorded.
- 70%: an unresolved request on land 1 leaves land 2 and new requests working.
- 80%: a shortage is `NORMAL`, an unconfirmed charge is `PENDING`, an abandoned
  task is `MAJOR`; the surface is closed without the operator key.
- 90%: `tsc-contract.ts` and `docs/farm-v2/tsc-v1-contract.md`; no other App touched.

## Load numbers (measured, isolated database only)

`scripts/dev/farm-v2-charge-load.mjs`, atomic charge RPC, 50 connections,
container-local PostgreSQL:

| Concurrent | rps | p50 | p95 | errors |
| --- | --- | --- | --- | --- |
| 100 | 621 | 112 ms | 159 ms | 0 |
| 1,000 | 2,725 | 268 ms | 362 ms | 0 |
| 10,000 | 4,283 | 1,308 ms | 2,219 ms | 0 |

These describe this isolated database, not the deployed site. At 10,000
concurrent charges the wallet path alone exceeds the 1 s target; the 100-player
case is inside it. Buy, sow and harvest latency on the deployed site is still
unmeasured.

## Not yet done (100%)

1. Full functional pass on the deployed site: every coin transaction, repeated
   operations, cancel and close, desktop 1920×1080 / 1366×768 and mobile
   390×844 / 360×800 for the 30% coin-transfer panels (the browser checks from
   the 30% stage remain open).
2. Fault injection against the deployed stack (network cut, API timeout, DB
   outage, restart during deploy, cross-day).
3. Load at 1,000 and 10,000 concurrent players on a production-like
   environment, and buy/sow/harvest latency there.
4. Apply `0006`–`0008` to production and set the two secrets.

## Deploy order

1. Apply migrations `0006`, `0007`, `0008` (additive, reversible).
2. Set `FARM_V2_RECOVERY_CRON_SECRET` and `FARM_V2_ADMIN_KEY` on
   `qiankun-farm-v2-api`.
3. Deploy the API, then the main site (`yuceluopan-main`) for the client panels.
4. Confirm the cron fires and `GET /api/farm/v2/admin/transaction-health`
   answers 200 with the operator key and 403 without it.

## Rollback

Redeploy the previous API build; the new tables and functions stay unused and
harmless. To remove them entirely, drop `farm_v2_transaction_health`,
`farm_v2_recovery_task_watch`, `farm_v2_recovery_task`,
`farm_v2_coin_compensation` and the functions created by `0006`–`0008`. No
player balance or item is touched by the rollback.
