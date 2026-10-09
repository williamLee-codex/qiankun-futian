# Farm V2 P0 integration

> Current release contract: see [P0 release gate](farm-v2-p0-release-gate.md). The new runtime additionally requires platform 0126/0127/0128/0129 and Farm 0001. Every HTTP wallet call supplies an `operationId` UUID from `/api/replit/farm-v2/authorization`; begin derives the verified owner, end settles the durable refund barrier. Credentials and operation IDs are not persisted in immutable wallet intent. The default-off `FARM_V2_ENTRY_ENABLED` flag provides a reversible entry switch. Production remains NO-GO pending target schema, refund retry handling, operator ownership and real-domain acceptance.


Implementation is on `codex/farm-v2-canonical-runtime`; its companion platform
change is on `codex/farm-v2-paid-value-authority`. No production migrations,
deployment, merge, push, or hosted CI run is part of this change.

## Core Wallet contract

`POST /api/replit/farm-v2/wallet` is server-to-server only. Require the existing
`x-replit-shared-secret`, a validated Farm launch/session credential in
`launchToken`, and `x-request-id` matching `[A-Za-z0-9._:-]{1,120}`. A caller cannot
supply the wallet owner. The platform derives the owner and app from its identity
authority; a different app is rejected.

The body contains integer `amount` (1..2147483647), `currency` (`coin`/`crystal`),
`direction`, `reason`, `referenceId`, `referenceType`, and `idempotencyKey`.
Primary key: `farm-v2:<request-id>:primary`. Compensation key:
`farm-v2:<request-id>:compensation`; it additionally requires
`originalTransactionId`. Do not change the key when retrying or changing credentials.

- Seed packs: reason `farm_seed_purchase`, reference type `farm_seed_pack`,
  reference `<land>:<packs>`, debit `packs` coins, lands 1..5 only.
- Crops: reason/type `farm_crop_exchange`, reference `<land>:<crops-consumed>`,
  canonical exchange units/rewards 5:1, 2:1, 1:1, 1:2, 1:4, 1:1.
  Land 6 credits crystals; other lands credit coins.
- Compensation: reason/type `farm_wallet_compensation`, reference request ID.
  Core looks up that owner's original primary entry and checks its exact inverse.
  The reversal links to the original ledger ID. A compensated primary cannot be
  retried as a new successful operation.

The platform migration wraps the **existing**
`public.core_wallet_apply_transaction` authority and immutable
`public.core_wallet_ledger`, rather than creating another balance store. The
wrapper validates the canonical economy and serializes Farm requests per owner.
Actual-paid qualification uses the existing `core.wallet_ledgers`
`paid_crystal` credit/refund projection via `farm_v2_effective_paid_crystals`.
Gate migration `0125` resolves verified auth IDs through `core.users.auth_user_id`
before selecting canonical wallets; auth and Core aggregate IDs are distinct.
Earned crop rewards never write payment qualification credits.

Successful responses contain `{duplicate,transaction,wallet}` using the Core
adapter's camelCase contract. Farm verifies owner, wallet ID, amount, currency,
direction, source, reference, key and reversal against its saved intent. Core
errors remain errors: insufficient funds/conflicting payloads 409, invalid
operation 400, unavailable authority 503, invalid Farm bridge responses 502.

## Durable Farm state and recovery

Wallet mutations first commit a reservation (`user_id`, request ID, exact
action), then serialize retries using a transaction advisory lock. Before HTTP
I/O, an independent journal connection persists `WALLET_PENDING` and the exact
command **without credentials**. Validated Core results persist `WALLET_APPLIED`.
Warehouse changes and `COMPLETED` commit in the Farm transaction together.

The journal has its own two-connection pool with a five-second connection
acquisition timeout. This prevents ten concurrent transaction/advisory-lock
waiters from starving the journal connection.

Lost Core responses repeat the saved command and primary key. Crop recovery uses
the original consumed quantity/reward, never a recalculation from a later
warehouse snapshot. Permanent recovery failure persists `COMPENSATING` before
the Farm transaction rolls back; compensation acquires the same request lock.
Lost compensation responses retry the same original-linked inverse key.
`COMPENSATED` is terminal. Transient failures retain recoverable state.

Recovery is request-driven; there is no new scheduler or reconciliation worker.
If previously credited rewards have been spent, Core may reject a debit reversal
for insufficient funds. That request remains `COMPENSATING`, requires operational
reconciliation, and is never reported as compensated. Pre-existing legacy
`WALLET_APPLIED` rows without an immutable command require explicit reconciliation;
the new code fails closed with `FARM_WALLET_INTENT_MISSING`.

## Continuous authorization

The five-minute Launch Token remains unchanged. Before gameplay the browser
calls Farm `POST /api/farm/v2/session` with its launch bearer. Farm exchanges it
through platform `POST /api/replit/farm-v2/session` (`action: "exchange"`).
The platform verifies signature, expiry, shared secret, Farm app availability,
and active launch record, then atomically consumes launch and creates a hashed,
opaque, Farm-scoped session. A lost bootstrap response may replay the identical
launch within its original validity window; it cannot create or extend a session.

Each request validates session authority on the platform. Activity extends only
the 30-minute idle window; the 12-hour absolute expiry is immutable. Session
revocation, root launch-record revocation, deletion, unavailable app or missing
authority deny access. `action: "revoke"` supports the UI's end-session control.
Credentials remain in browser memory, never localStorage/sessionStorage or saved
transaction intents. Only unresolved, non-secret operation/request IDs are kept
in sessionStorage, scoped to API and verified user, so same-tab platform re-login
can retry safely. Storage-disabled browsers retain only in-memory retry IDs.

After expiry/revocation, the UI stops actions and offers
`/api/apps/qiankun-futian/launch?farmV2=1` on the configured platform. This opt-in
route uses `FARM_V2_LAUNCH_URL` and preserves its query through account login;
default V1 routing remains unchanged. An unset/invalid external launch URL fails
closed. The configured URL should target this frontend. The build must set trusted
`VITE_FARM_API_BASE_URL` pointing at the Farm API, including `/api`; an
`apiBaseUrl` query parameter is ignored by the actual entry code. Never place credentials in this setting.

## Local verification

Use Node 24 and pnpm 10.28.2 for Farm; platform pins pnpm 11.7.0. Farm now declares
Vitest and `pnpm test`. Full typechecks/build: `PORT=8080 BASE_PATH=/ pnpm run build`.
Platform: `pnpm test`, `pnpm run typecheck`, `pnpm run check:architecture`,
`NEXT_TELEMETRY_DISABLED=1 pnpm run build`.

For isolated SQL/recovery tests only:

```sh
docker run --name farm-v2-p0-test-db -e POSTGRES_HOST_AUTH_METHOD=trust \
  -p 127.0.0.1:55432:5432 -d postgres:17
cd /workspace/imperial-compass-platform
LOCAL_TEST_POSTGRES_CONTAINER=farm-v2-p0-test-db node --test scripts/farm-v2-wallet-db.mjs scripts/farm-v2-session-db.mjs
docker exec farm-v2-p0-test-db createdb -U postgres farm_v2_saga_test
cd /workspace/qiankun-futian
FARM_V2_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/farm_v2_saga_test \
FARM_V2_PLATFORM_CHECKOUT=/workspace/imperial-compass-platform pnpm test
```

SQL tests create/drop PID-named databases inside the explicitly selected test
container. The Farm integration test requires an empty localhost database with
a `farm_v2_` prefix. Without these explicit opt-ins the eight Farm DB integration
tests are skipped, not passed. The integration fixture exercises real PostgreSQL
locks, Core Wallet RPCs, Farm transactions and rollback triggers; network-loss
injection replaces the external platform transport only.

## Release prerequisites and boundaries

Platform changes must be reviewed and its `0123`/`0124`/`0125` migrations applied through
the normal authorized release process. Check the target's existing
`public.launch_tokens` schema (not defined in this checkout's migration history),
Core Wallet RPC/ledger and `0122` paid qualification RPC before release. These
schema prerequisites were provided only in isolated test fixtures.

Farm requires its existing Farm tables, `DATABASE_URL`, trusted
`PLATFORM_BASE_URL` and shared `REPLIT_APP_SHARED_SECRET`. Platform requires its
existing Supabase admin bindings, `LAUNCH_TOKEN_SECRET`, the same shared secret,
and non-secret `FARM_V2_LAUNCH_URL`. Supply secret values through secure environment
settings. This workspace has no live bindings, so production end-to-end payment,
user login, deployed schema, and account revocation were not verified. Browser
game interaction was not covered by an E2E browser run.

The existing separate paid-qualification refresh/gameplay transaction gap is not
resolved here. No six-land capacities, growth times, prices, unlock thresholds,
or canonical economy constants were changed.

## Changed files

- `artifacts/api-server/src/lib/farm-v2-crop-exchange.ts`
- `artifacts/api-server/src/lib/farm-v2-idempotency.ts`
- `artifacts/api-server/src/lib/farm-v2-platform.ts`
- `artifacts/api-server/src/lib/farm-v2-seed-purchase.ts`
- `artifacts/api-server/src/lib/farm-v2-wallet-client.test.ts`
- `artifacts/api-server/src/lib/farm-v2-wallet-client.ts`
- `artifacts/api-server/src/lib/farm-v2-wallet-saga.integration.test.ts`
- `artifacts/api-server/src/lib/farm-v2-wallet-saga.ts`
- `artifacts/api-server/src/middlewares/farm-v2-error-handler.ts`
- `artifacts/api-server/src/middlewares/farm-v2-launch-auth.ts`
- `artifacts/api-server/src/routes/farm-v2.ts`
- `artifacts/qiankun-farm/src/components/QuickActions.tsx`
- `artifacts/qiankun-farm/src/game/v2/FarmV2AuthenticatedView.tsx`
- `artifacts/qiankun-farm/src/game/v2/farmV2ApiClient.test.ts`
- `artifacts/qiankun-farm/src/game/v2/farmV2ApiClient.ts`
- `artifacts/qiankun-farm/src/game/v2/petEffectsRuntime.test.ts`
- `artifacts/qiankun-farm/src/game/v2/useFarmV2Scene.ts`
- `artifacts/qiankun-futian/src/game/v2/petEffectsRuntime.test.ts`
- `docs/farm-v2-p0-core-integration.md`
- `lib/db/src/index.ts`
- `package.json`
- `pnpm-lock.yaml`
- `vitest.config.ts`

## Pre-release gate review

**NO-GO for production release.** The companion platform report is
`docs/farm-v2-p0-release-gate.md` on `codex/farm-v2-paid-value-authority`.
Its G1–G6 table names each repository, operation and acceptance criterion.

This gate fixes unresolved 409 request-ID retention, adds entry HTML
`no-referrer`, and removes automatic post-merge database push. Existing six-land
rules remain unchanged. Farm full suite passed 151 tests (eight isolated DB saga
cases), typechecks/full build passed, and local bearer-CORS preflight passed.
Platform additionally fixes auth/Core paid qualification mapping with 0125 and
checks wallet lifecycle under the authoritative row lock in 0123.

Open gates: verify actual target schema/privileges; separately authorize migrations
and bindings; decide refund ordering semantics; implement/rehearse orphan and
manual reconciliation; define and enforce account lifecycle revocation; validate
approved V2 entry, real browser login/cookies/CORS and transaction behavior.
Platform account logout currently does not revoke Farm sessions; default platform
home entry still opens V1. No production work, push, hosted CI or deployment ran.
