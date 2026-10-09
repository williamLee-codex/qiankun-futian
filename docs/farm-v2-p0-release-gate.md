# Farm V2 P0 release gate — 2026-10-09

**Decision: NO-GO for production release.** The five requested implementation gaps now have code paths and local tests. Target schema, production refund handling, operational ownership and real-domain acceptance remain unverified. No production migration/data change, push, merge, deployment or hosted CI/build was performed.

Starting commits: Farm `73a6eca80dca9c7b002b802e5e4304dfa7a20a82`; platform `6026b04626d9b90498c4245b71c5b0ab17ab7af8`, on their existing Farm V2 development branches.

## Authority and strict refund ordering

Spendable Core Wallet remains `public.core_wallets` / `public.core_wallet_ledger`, via the existing `core_wallet_apply_transaction` authority (0019). Seed purchases debit `coin`; land-six exchanges credit `crystal`. No fake wallet or new currency was introduced.

Paid qualification uses the distinct canonical `core.wallet_ledgers` paid-credit/refund history. 0125 maps `auth.users.id` through `core.users.auth_user_id` and `core.wallets.user_id`; Core aggregate IDs are different IDs. Paid spending, gifted and farm-bound crystals do not add payment qualification. Undefined adjustments fail closed. Land-six earned crystals never enter actual-paid qualification.

0127 adds durable, owner-bound paid-operation permits. Begin and canonical paid-ledger inserts use the same Core owner advisory lock. A refund/adjustment cannot commit while an OPEN permit exists: it raises SQLSTATE `55P03` / `FARM_PAID_OPERATION_IN_PROGRESS`. After Farm commit/rollback, the permit settles and a retried refund may commit; the next Farm operation reads the reduced qualification before gameplay. An operation admitted before the refund finishes first; operations admitted after a committed refund cannot retain the old qualification. This is ordering, not a distributed transaction or a guarantee that in-flight work is rolled back.

Farm serializes HTTP operations with a separate per-user advisory-lock pool. It persists an attempt before sending begin, and each domain transaction checks the attempt under FOR SHARE. An operator must obtain that same user lock and persist FENCED before settling Core. The UPDATE waits for already-writing transactions, while delayed callbacks fail before writes. Core settlement creates a terminal tombstone even if begin has not arrived; delayed begin and wallet mutations then fail. HTTP wallet mutations require the matching OPEN permit. Canonical paid ledgers and wallet ownership/identity mappings are protected against mutation/remapping.

**No permit TTL or force-close is allowed.** Lost settlement is discoverable in Farm attempts and blocks refunds until audited fencing. Production refund writers must recognize the retryable blocker, retain the original refund idempotency key, retry safely and alert on unresolved permits. This handling and an operator SLA are still release gates. Migration 0127 affects existing canonical refund/adjustment writers and ledger UPDATE/DELETE paths; review every writer before release.

## Audited operator reconciliation

Farm provides `pnpm farm:reconcile --list` for outstanding mutations, authorizations and cases. Reconciliation is dry-run unless both `--apply` and `--confirm-case` matching the case are supplied. Restricted operators need Farm DATABASE_URL and server-only platform Supabase bindings; never give browser/player credentials to the tool.

Examples below use placeholders, not credentials:

```sh
pnpm farm:reconcile --list
pnpm farm:reconcile --user AUTH_UUID --request REQUEST_ID --case CASE_ID --actor OPERATOR_ID --evidence TICKET_ID
# After reviewing the dry-run evidence:
pnpm farm:reconcile --user AUTH_UUID --request REQUEST_ID --case CASE_ID --actor OPERATOR_ID --evidence TICKET_ID --apply --confirm-case CASE_ID
pnpm farm:reconcile --user AUTH_UUID --authorization OPERATION_UUID --case CASE_ID --actor OPERATOR_ID --evidence TICKET_ID --apply --confirm-case CASE_ID
```

The operator tool never edits balances or immutable ledgers. It compares owner/request-linked primary evidence with saved command amount, currency, direction, reason, references, summary and ledger ID. Mismatches or ambiguous evidence are ESCALATED, never compensated or silently closed. Known legacy primary keys without a command are supported only when persisted action/summary and canonical Core source agree. Unknown legacy sources need a separately reviewed authority resolution.

0128 supplies service-only inspection/inverse/cancellation RPCs. Compensation derives the exact inverse from the original authority ledger. Absent primary effects can be canceled with an immutable closure blocking late primary writes. Insufficient reversal funds remain NEEDS_FUNDS/COMPENSATING without granting assets. Lost inverse responses record RETRY_PENDING and use the same inverse key; retry confirms one inverse before closure. CLOSED cases retain actor, evidence, timestamps, original/reversal IDs; append-only audit cannot be overwritten. Completed Farm evidence conflicting with a Core reversal/closure is escalated. No repair worker, alert transport or automatic scheduling was added: a named operations owner must inventory and resolve these states.

## Account lifecycle and safe entry

0126 records immutable revocation audits and revokes all Farm roots/sessions on global logout, auth ban/deletion or Core archive/deletion. Current identity state is checked during exchange/use, including accounts disabled before migration. Re-enabling an account never revives revoked credentials. Platform account sign-out and Core logout perform Farm revocation first and fail closed if it cannot be confirmed. An administrator can use the service-only user-session revocation RPC with an allowed reason. Launch-signing-key rotation alone does not revoke existing opaque sessions.

Launch tokens retain the five-minute TTL. Opaque hashed sessions retain 30-minute idle and immutable 12-hour absolute expiry; refresh cannot revive expired/revoked roots or substitute another owner. Fresh authenticated launch creates a new independent session. Browser credentials remain in memory and Farm uses bearer authorization.

`FARM_V2_ENTRY_ENABLED=1` is a server-only, default-off switch for the platform home link and default Farm app launch. Unset/other values preserve `/farm`; explicit `/api/apps/qiankun-futian/launch?farmV2=1` remains available for authorized acceptance. V2 fails closed with 503 if its trusted launch URL is missing. Turning the flag off restores entry routing without a database rollback. Existing `/farm` is preserved. Enabling the flag requires the remaining gates and a separately authorized release.

Farm browser CORS uses bearer Authorization, Content-Type and X-Request-ID, without credentialed cookies. Platform login retains existing first-party Supabase cookies/OAuth. Verify real HTTPS origins, Secure/SameSite, OAuth allowlist, return path, SPA fallback, `/api` routing and log redaction in a real browser. The frontend uses build-time VITE_FARM_API_BASE_URL (including `/api`); launch query overrides are ignored. Redact launch queries from proxy logs; HTML no-referrer protects external requests.

## Migration dependencies, replay and recovery

Review target metadata and migration history first; local baseline fixtures are not proof of production compatibility. Required authority prerequisites: auth.users with id/banned_until/deleted_at; baseline 0003 Core identity/status and 0006 canonical wallets/ledgers; 0019 public Core wallet authority; existing launch_tokens schema and 0122 paid RPC. Verify identity/token uniqueness, columns, constraints, owner mappings, existing triggers and function grants. No automatic db push is permitted.

Apply forward in the normal separately authorized release process:

1. Platform 0123 wallet bridge and 0124 sessions, then 0125 auth-identity paid authority.
2. Platform 0126 lifecycle revocation (depends on 0124, auth/Core lifecycle columns).
3. Platform 0127 permits/refund guard (depends on 0123/0125 and canonical identity/wallet/ledger columns).
4. Platform 0128 reconciliation (depends on public Core wallet authority/0123; retains the 0127 authorized wrapper calling the replaced wallet function).
5. Platform 0129 forward repair, retaining the 0128 closure-aware function and audited historical session revocation.
6. Farm existing V2 tables/journal columns plus `lib/db/migrations/0001_farm_v2_authority_reconciliation.sql`, before running the new API code. Drizzle definitions match the new tables; audit triggers require explicit SQL migration.

0123/0125 use replaceable function definitions and can be replayed in a controlled forward sequence before 0128. **Never reapply 0123 alone after 0128**: it would replace the newer closure-aware wrapper. The independent closure trigger still prevents late primary ledger writes, but this is defense in depth, not an endorsed downgrade procedure.

0124/0126/0127/0128 and Farm 0001 are once-only BEGIN/COMMIT transactions, not arbitrary rerunnable scripts. Duplicate application intentionally fails on existing objects; the failed transaction rolls back without modifying retained data. Use verified migration-history records/checksums to skip already-applied versions. Do not add IF NOT EXISTS to conceal partial schema drift. Controlled local replay tests cover 0123/0125 and rejected duplicate 0124/0126/0127.

On failure, confirm transaction rollback and target history/object definitions through authorized read-only metadata review, identify the failed prerequisite, then rerun only the verified unapplied migration. Partial objects/history mismatch require reviewed repair before retry. Preserve all permits, closures, journals and audit records. Do not drop/recreate these tables to recover. Disable V2 entry and stop admission first for rollback; drain requests and audit/fence outstanding authorizations before any compatible code rollback. Never remove the refund/closure guard while unresolved operations exist.

## Required settings — names only

| Owner | Setting | Requirement |
| --- | --- | --- |
| Farm build | VITE_FARM_API_BASE_URL, BASE_PATH, PORT | Correct HTTPS API base including /api and SPA hosting path |
| Farm API | DATABASE_URL, PORT, NODE_ENV | Secret existing Farm DB binding, production runtime/TLS and connection budget |
| Farm API | PLATFORM_BASE_URL | Trusted platform HTTPS origin |
| Both servers | REPLIT_APP_SHARED_SECRET | Matching private binding, never frontend |
| Platform | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY | Correct project public auth bindings |
| Platform / restricted operator | SUPABASE_SERVICE_ROLE_KEY | Server-only secret for verified project |
| Platform | LAUNCH_TOKEN_SECRET | Private signing/session derivation binding |
| Platform | FARM_V2_LAUNCH_URL | Trusted built Farm HTTPS frontend |
| Platform | FARM_V2_ENTRY_ENABLED | Default off; set 1 only for separately authorized switch |
| Platform auth | Supabase site/OAuth redirect settings | Real HTTPS login/callback/return allowlist |

Runtime connection budget is default Farm pool 10 + wallet journal pool 2 + authority lock pool 2 per API instance; operator runs add a short-lived pool. Node 24, Farm pnpm 10.28.2 and platform pnpm 11.7.0 were used locally. Secrets must never be exported in reports, frontend builds or operator evidence.

## Remaining production gates

| Gate | Responsible repository | Necessary operation | Acceptance |
| --- | --- | --- | --- |
| G1 target schema | Platform + Farm | Authorized metadata/history/grant review of actual target and all writers | Exact compatible structures/identity mappings, no unexplained drift, restricted service-only RPCs |
| G2 migrations/settings | Platform + Farm | Separately authorized forward migrations and secure bindings after G1 | Versions recorded, correct authority project, frontend/API routing and bindings verified |
| G3 refund operations | Platform + Farm operations | Verify real refund/adjustment writers handle 55P03 safely; rehearse failed settlement/fencing | Original-key refund eventually completes, no post-refund qualification, no unsafe timeout/force-close |
| G4 reconciliation operations | Farm + Platform operations | Assign owner/SLA, restrict credentials, inventory legacy rows, rehearse cases | Every supported outstanding state tracked/audited/closed; unknown or conflicting evidence escalated |
| G5 lifecycle acceptance | Platform with Farm | Authorized deployed logout/ban/archive/admin revoke and two-user acceptance | Existing sessions fail immediately on subsequent validation, old roots cannot revive, new login isolated |
| G6 entry/browser/deployment | Platform + Farm | Real-domain acceptance with default-off switch, then separate release authorization | Launch/exchange, >5-minute play, expiry/relogin, CORS/cookies, purchases/exchanges, retry/compensation and rollback entry verified |

**NO-GO remains until production evidence meets these gates.** The local tests below are development evidence only and do not authorize release or database changes.

## Local validation

All PostgreSQL tests use disposable local PostgreSQL 17 databases, not production data.

- Farm: 38 test files / 160 tests passed, including 17 real PostgreSQL integration cases. Coverage includes lost wallet response, interrupted Farm commit, retry/conflict isolation, barrier/fencing, insufficient inverse funds, lost inverse response, modern and actual legacy keys, intent conflicts, cancellation and real sow/harvest after refund.
- Platform: 611 test files / 2,530 tests passed. Existing jsdom scrollTo warnings did not fail tests.
- Isolated PostgreSQL platform authority/session suite: 21 tests passed. Includes global logout, ban/archive/relogin, refund barriers, late authorization tombstones, wallet fencing, identity/owner immutability and migration replay failures. Farm integration additionally verifies duplicate 0128/Farm 0001 rollback.
- Four source-level paid-route guard checks passed; these are structural checks, not transactional or production proof.
- Both TypeScript checks, platform architecture check (1,175 files) and both local full builds passed. Farm full build needs PORT=4173 BASE_PATH=/ for the existing mockup package; the initial missing-variable failure was corrected without changing that package. Platform retains an existing img lint warning.
- Operator CLI --list executed against the isolated test database and returned the expected empty inventory. Static independent review reported no remaining important/critical findings after intent/owner hardening.
- No production migration, production data access/write, hosted CI, deployment or real-domain browser acceptance ran.

## Changed file inventory

Farm development branch:

```text
artifacts/api-server/src/cli/farm-v2-reconcile.ts
artifacts/api-server/src/lib/farm-v2-authority-context.ts
artifacts/api-server/src/lib/farm-v2-authority.ts
artifacts/api-server/src/lib/farm-v2-core-paid-value.ts
artifacts/api-server/src/lib/farm-v2-harvest.ts
artifacts/api-server/src/lib/farm-v2-idempotency.ts
artifacts/api-server/src/lib/farm-v2-init.ts
artifacts/api-server/src/lib/farm-v2-reconciliation.ts
artifacts/api-server/src/lib/farm-v2-sow.ts
artifacts/api-server/src/lib/farm-v2-wallet-client.ts
artifacts/api-server/src/lib/farm-v2-wallet-saga.integration.test.ts
artifacts/api-server/src/middlewares/farm-v2-error-handler.ts
artifacts/api-server/src/routes/farm-v2.ts
docs/farm-v2-p0-core-integration.md
docs/farm-v2-p0-release-gate.md
docs/farm-v2-paid-refund-race-audit-20261009.md
lib/db/migrations/0001_farm_v2_authority_reconciliation.sql
lib/db/src/schema/farm-v2.ts
package.json
scripts/farm-v2-paid-route-guard.test.mjs
```

Platform development branch:

```text
docs/farm-v2-p0-bridge-release.md
docs/farm-v2-p0-release-gate.md
scripts/farm-v2-session-db.mjs
scripts/farm-v2-wallet-db.mjs
src/app/api/apps/[appId]/launch/route.ts
src/app/api/replit/farm-v2/authorization/route.ts
src/components/home/HomeFarmOverview.tsx
src/features/auth/server.ts
src/features/farm/accountRevocation.test.ts
src/features/farm/authorization.test.ts
src/features/farm/authorization.ts
src/features/farm/walletBridge.test.ts
src/features/farm/walletBridge.ts
src/lib/core-api/auth/index.ts
src/lib/launch/farmSessionRevocation.ts
src/platform/farm-v2/authorization.ts
src/platform/farm-v2/walletBridge.ts
src/platform/server/authSessionContext.ts
src/tests/components/homeV2PortalLayout.test.ts
src/tests/features/farmV2LaunchRoute.test.ts
src/tests/platform/authSessionContext.test.ts
supabase/migrations/0126_farm_v2_account_revocation.sql
supabase/migrations/0127_farm_v2_paid_operation_authority.sql
supabase/migrations/0128_farm_v2_operator_reconciliation.sql
```

## Forward correction 0129 — local verification

The newly reserved `0129_farm_v2_wallet_creation_and_historical_revocation.sql` follows 0128. Historical 0123–0128 files remain unchanged. It replaces the final 0128 closure-aware wallet function with only a Core get-or-create call before the existing wallet row lock/status check. This closes the absent-row suspension race without changing amount/source validation, idempotency, compensation or closure protection.

The same transaction uses existing identity validation and audited user-session revocation to revoke outstanding Farm roots/sessions of currently disabled identities missed by 0126's later-update triggers. Healthy identities and already-revoked credentials are excluded. Affected auth rows are locked until commit. Controlled 0129 replay repeats the function definition but produces no duplicate historical revocation audits in the tested state. Never replay old 0123 after this forward correction.

Release sequence is now **0123 → 0124 → 0125 → 0126 → 0127 → 0128 → 0129**, with all existing prerequisites and Farm 0001 still mandatory. Missing prerequisite, privilege or lock-timeout errors must roll back the whole transaction; investigate target metadata/history before retry, never drop records or force a partial application. Review affected credential counts, auth-table locking, current lifecycle status and migration-owner privileges before authorized production execution.

Both reproduced defects changed from FAIL to PASS in isolated PostgreSQL. New regression cases include historical auth ban and Core archival, reactivation, healthy Session preservation, first-wallet suspension creation, compensation under suspension/reactivation, duplicates, closures, refund barriers and audited replay. Farm integration fixtures now apply the complete Session/wallet forward sequence through 0129.

Local result: PostgreSQL suites **27 passed** (original 21 plus 6 focused forward-repair cases); Farm **38 files / 160 passed**, including 17 wallet integration cases using 0129; both TypeScript checks and platform architecture check passed. Platform full suite **611 files / 2,530 passed**; existing jsdom scrollTo warnings did not fail tests. Independent read-only review found no critical/important issues. No production migration, data changes, push, PR, merge, deployment or hosted CI was performed.

**Eligible to enter production Migration preparatory review; production release remains NO-GO.** Target schema/history/grants, production refund 55P03 retry handling, operator ownership/SLA and deployed acceptance remain unverified. The backfill can identify identities inactive when 0129 executes. Accounts already reactivated before repair require trusted lifecycle audit evidence and a separately authorized targeted revocation decision; healthy sessions cannot be indiscriminately revoked to guess historical state.
