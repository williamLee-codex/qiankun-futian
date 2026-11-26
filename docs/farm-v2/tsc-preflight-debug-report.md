# TSC pre-release debug pass (branch `fix/farm-v2-tsc-preflight-20261126`)

Base `7c3daf5`, unchanged. Only defects fixed; no features, no performance work.

## Defect 1 — a compensation record could stall in `claimed` forever

`farm-v2-coin-compensation.ts` inserted the row as `claimed` and treated any
later `claimed` row as `in_progress`. A process that died before or after
posting left the request permanently stuck: no retry, no credit, no signal.

Fix:

- `claimed_at` is the lease anchor (migration `0010`), with a partial index over
  stale claims.
- A claim older than `FARM_V2_COMPENSATION_CLAIM_TIMEOUT_SECONDS` (default 120,
  range 30–3600) may be taken over by a single conditional `UPDATE` that requires
  `status='claimed'` and `claimed_at < now() - interval`, so exactly one taker
  wins and the rest see `in_progress`.
- `FARM_V2_COMPENSATION_MAX_ATTEMPTS` (default 8) bounds the takeover attempts;
  the row then becomes `failed` with `FARM_COMPENSATION_CLAIM_EXHAUSTED`, which
  the operator view shows instead of an invisible stall.
- `decideCoinClaim` is pure and unit tested (stale, live, missing timestamp,
  future timestamp, exhausted, non-claimed).
- Crash after the credit but before the record update is safe: the next taker
  gets `duplicate`, verifies the ledger, and records the existing entry.
- The background sweep already retries the request, so a takeover is reachable
  without player action. The credit is single-shot by ledger key, not by the
  claim row, so an overlapping taker cannot pay twice.

## Defect 2 — a `duplicate` answer was returned without closing the record

The RPC result `duplicate` returned `{status:"duplicate"}` while the record
stayed `claimed`. Fix: `duplicate` is now only accepted after the real ledger
entry for this request, wallet and amount is found (central:
`farm-v2:<request>:compensation`; farm: `compensation:<request>`). The record is
then marked `posted` with that ledger id. If no entry is found the record goes to
`failed` with `COIN_COMPENSATION_LEDGER_UNCONFIRMED`, so an inconsistency is
visible instead of being reported as success.

## SQL 0006 audit — findings and what `0010` changes

| Question | Finding | Action |
| --- | --- | --- |
| Do both wallets identify the original debit? | Central did, by `farm-v2:<request>:primary`. The Farm wallet did not: a farm-scope compensation was never compared with `farm_v2_bank.ledger`. | `0010` looks up the farm debit (`op:`, `transfer:` or `reference` = request) and refuses `evidence_conflict` on an amount mismatch. |
| Is the amount bounded by server evidence? | Central: yes. Farm: only by the journal the server wrote. | Bound to the farm ledger entry as above; a caller cannot inflate the refund. |
| Does closing the request stop a delayed charge from both wallets? | Central: yes, `farm_v2_closed_wallet_request_guard`. Farm bank: no trigger existed. | `0010` adds `farm_v2_bank_request_closure_guard` on `farm_v2_bank.ledger` inserts for `op:`/`transfer:` keys, raising `FARM_BANK_MUTATION_COMPENSATED`. |
| Compensation concurrent with delivery? | Both paths serialise on the same per-user advisory lock and both close the request; the first one wins and the second sees the closure. | Unchanged; covered by tests. |
| Record, ledger and terminal state consistent? | `posted` was written without checking the ledger on the `duplicate` path; a closure without a credit returned `duplicate`. | `duplicate` now returns the ledger id, or `closure_without_credit` when the closure exists but no credit does. |

## Scheduling review

- `vercel.json` asked for `*/5 * * * *`. Sub-daily crons are not available on
  every Vercel plan (the Hobby plan only runs crons daily), and an unsupported
  schedule can fail the deployment. It is now `0 3 * * *`, which deploys on any
  plan, and no plan was upgraded.
- `vercel.json` also sets `git.deploymentEnabled: false`, so crons only exist on
  deployments created through the CLI/API. The five-minute cadence therefore
  cannot be relied on from git.
- The primary runner is `.github/workflows/farm-v2-recovery-sweep.yml` every 10
  minutes; it skips itself unless `FARM_V2_RECOVERY_CRON_SECRET` and
  `FARM_V2_API_BASE_URL` exist. GitHub schedules are best effort and are disabled
  after 60 days of repository inactivity, so the daily Vercel cron is the
  backstop.
- Cron authentication is unchanged: Vercel sends `Authorization: Bearer
  $CRON_SECRET`, the workflow sends the same bearer, and the endpoint rejects
  anything else with 403.

## Fault injection results (isolated database, migrations + fixtures only)

| Scenario | Test | Result |
| --- | --- | --- |
| Claim created, process dies | `FIX/COMPENSATION-TAKEOVER` (claim 10 min old) | taken over, posted, credited once, attempts=2 |
| Claim inside its lease | `FIX/COMPENSATION-TAKEOVER: inside its lease` | `in_progress`, no credit |
| Credit posted, process dies before recording | `FIX/COMPENSATION-LOST-RESPONSE` | `duplicate` accepted only after ledger proof, record `posted`, no second credit |
| Compensation succeeded, answer lost | same test as above (RPC returns `duplicate`) | record closed as `posted`, not stuck |
| Several background takers at once | `FIX/COMPENSATION-CONCURRENT-TAKEOVER` (6 takers) | exactly one ledger credit, record `posted` |
| Delayed charge with compensation | `FIX/COMPENSATION-CLOSURE` | central and farm late charges both refused |
| Asset protection released | `70%/ISOLATION: compensation releases the request` | land works again |
| Completed transaction never compensated | `50%/COIN-COMPENSATION: crystals and delivered requests are never refunded` | refused |
| Farm amount forged | `FIX/FARM-EVIDENCE` | `evidence_conflict` |

Suite: `Test Files 1 passed` (integration, isolated PostgreSQL built from
migrations and fixtures), policy unit tests 14 passed.

## Deployment candidate

- Commit `7c3daf5`.
- Migrations: `0010_farm_v2_compensation_takeover.sql` only (additive: one
  column with a default, one partial index, one trigger, one function replaced).
  Apply before the API deploy; `0006`–`0009` must already be applied.
- New optional environment: `FARM_V2_COMPENSATION_CLAIM_TIMEOUT_SECONDS` (120),
  `FARM_V2_COMPENSATION_MAX_ATTEMPTS` (8).
- Order: migration `0010` → API deploy → main site unchanged (no client change)
  → confirm the sweep runs and `farm_v2_coin_compensation` has no row in
  `claimed` older than the timeout.
- Rollback: redeploy the previous API build. `0010` only widens the table and
  replaces one function; the previous function body still works with the extra
  column, so the migration can stay. To remove it, drop the trigger
  `farm_v2_bank_request_closure_guard`, the index
  `farm_v2_coin_compensation_stale_idx` and restore the `0006` function body.
