# Farm V2 TSC — production deployment manifest (round 2)

Supersedes the migration list in `tsc-v1-delivery-record.md`. Only additive,
Farm-owned objects are listed. `0009` is excluded on purpose: it belongs to the
performance branch and is not part of this release.

## 1. Migrations, in this order

| Order | File | What it creates | Depends on |
| --- | --- | --- | --- |
| 1 | `0006_farm_v2_coin_compensation.sql` | `farm_v2_coin_compensation`, `farm_v2_coin_compensation_watch`, `farm_v2_bank.post_compensation`, `farm_v2_post_coin_compensation` | `farm_v2_mutation`, `core_wallet_ledger`, `farm_v2_bank`, `farm_v2_wallet_closures` (already in production) |
| 2 | `0007_farm_v2_recovery_task.sql` | `farm_v2_recovery_task`, `farm_v2_claim_recovery_tasks`, `farm_v2_finish_recovery_task`, `farm_v2_recovery_task_watch` | 0006 |
| 3 | `0008_farm_v2_transaction_health.sql` | `farm_v2_transaction_health(timestamptz,int)` | 0006, 0007 |
| 4 | `0010_farm_v2_compensation_takeover.sql` | `claimed_at` column, stale-claim index, `farm_v2_bank_request_closure_guard`, fixed `farm_v2_post_coin_compensation` | 0006 |
| 5 | `0011_farm_v2_lease_and_health_fix.sql` | lease-checked `farm_v2_finish_recovery_task`, corrected `farm_v2_transaction_health` | 0007, 0008 |
| 6 | `0012_farm_v2_tsc_runtime_permissions.sql` | restricted runtime grants/RLS, receipt-only ledger lookup | 0006–0011, existing `farm_v2_runtime` LOGIN role |

Excluded: `0009_farm_v2_tsc_indexes.sql` (performance branch only; nothing in this
release needs it). Applying it later is harmless and independent.

Rollback requires a reviewed, state-aware script; do not blindly drop TSC objects
once compensation or recovery rows exist. The pre-install function/schema backup
must remain intact. Migration 0012 grants rights only on TSC objects and does
not grant raw Core or Farm wallet ledger access to `farm_v2_runtime`.
Migration 0010 now validates the accepted Farm journal's user, request, debit
currency, amount, state and wallet scope before permitting compensation.

## 2. API changes requiring the migrations

- Compensation takeover and duplicate verification (`0010`).
- Recovery finish now requires a live lease (`0011`), so an old worker cannot
  overwrite a new one's result.
- Operator health reports only money that actually moved (`0011`).
- Receipt-only compensation verification, without direct Core/Farm ledger SELECT (`0012`).

## 3. Main site

The main site must ship the frontend that was never deployed:

- `artifacts/qiankun-farm/src/game/v2/coinShortfallNotice.tsx` — the approved
  central/farm shortfall panels with their artwork
  (`public/images/farm/coin-shortfall-{central,farm}.png`, both 1536×1024).
- `artifacts/qiankun-farm/src/game/v2/FarmV2AuthenticatedView.tsx` — the balance
  pre-checks, the coin conversion entry and the material-shortage notice wiring
  (`FARM_MATERIALS_INSUFFICIENT`).
- `artifacts/qiankun-farm/src/game/v2/PotSynthesisGrid.tsx` — material shortage
  reporting on the workshop grid.

Deploy order: migrations → `qiankun-farm-v2-api` → `yuceluopan-main`. The client
tolerates the old API only for reads; the shortfall panels need no API change, so
the main site may be deployed directly after the API.

## 4. Environment

| Variable | Needed by | Notes |
| --- | --- | --- |
| `FARM_V2_RECOVERY_CRON_SECRET` | sweep endpoint | unset = endpoint returns 403 |
| `FARM_V2_ADMIN_KEY` (≥16 chars) | operator health | unset = endpoint returns 403 |
| `FARM_V2_COMPENSATION_CLAIM_TIMEOUT_SECONDS` | compensation | optional, default 120 |
| `FARM_V2_COMPENSATION_MAX_ATTEMPTS` | compensation | optional, default 8 |

Cron authentication: GitHub Actions sends `POST` with `x-farm-recovery-key`;
Vercel Cron sends `GET` with `Authorization: Bearer $CRON_SECRET`. Both are
served by the same handler and both are covered by the endpoint test.

## 5. Post-deploy checks

1. `GET /api/farm/v2/admin/transaction-health` → 200 with the operator key, 403
   without.
2. Sweep: `GET .../recovery/sweep` with the bearer → 200 and a JSON body.
3. `SELECT count(*) FROM farm_v2_coin_compensation WHERE status='claimed' AND
   claimed_at < now() - interval '10 minutes'` → 0 after a sweep.
4. Shortfall panel shown on a deficit purchase; convert is refused when the other
   wallet cannot cover the exact deficit.

## 6. Restricted runtime grant validation

The production API's `DATABASE_URL` is secret and must not be printed. Confirm
its actual SQL `current_user` equals `farm_v2_runtime` through a non-secret
readiness probe; do not substitute `service_role` or grant Core ledger SELECT.
`farm_v2_runtime` needs the 0012 TSC table policies, table DML and RPC EXECUTE.
The browser's `anon` and `authenticated` roles receive no new grants.
Do not turn on the recovery scheduler before the 0012 grants, the API release,
and both sweep authentication paths are verified.

Environment keys `FARM_V2_RECOVERY_CRON_SECRET` and `FARM_V2_ADMIN_KEY` must be
configured as private production secrets, not logged or committed. Until the
operator and scheduler entry gates pass, keep them closed; never invent a
successful production probe.
