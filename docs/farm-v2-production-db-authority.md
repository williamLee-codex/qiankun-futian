# Farm deployment engineering — 2026-10-11

Sources remain unchanged: lib/db/migrations/0001_farm_v2_authority_reconciliation.sql and 0002_farm_v2_game_baseline.sql. lib/db/production-migration-map.json reserves reviewed candidates 20261011000201 and 20261011000202 in supabase_migrations.schema_migrations, after Platform 20261011000133. They are NOT formally registered or authorized. No raw Wallet balance columns are added.

## Review-only authority

```bash
node scripts/farm-v2-production-authority.mjs --platform-checkout ../imperial-compass-platform --plan
node scripts/farm-v2-production-authority.mjs --platform-checkout ../imperial-compass-platform --migration 0001 --emit-preflight
node scripts/farm-v2-production-authority.mjs --platform-checkout ../imperial-compass-platform --migration 0001 --emit-reviewed-sql
node scripts/farm-v2-production-authority.mjs --emit-grants --runtime-role farm_v2_runtime --operator-role farm_v2_operator
```

Repeat the last migration commands for 0002 only after 0001. This tool has no network/apply mode; --apply is rejected. Exported SQL is an artifact for explicit approval, not permission to execute. Candidate version collision checks and predecessor original statements are rechecked under the same transaction advisory lock used by Platform authority. Each file's DDL and unmodified original SQL Journal registration commit together. Missing/changed predecessors, any already registered target/later version, existing target tables/functions, or non-postgres migration operator stop before DDL. No auto-skip and no IF NOT EXISTS. Any SQL error stops with ON_ERROR_STOP and rollback; earlier committed files remain installed. Check Journal and actual catalog before any retry after unknown COMMIT result.

Both migrations are hash-pinned to their source. 0001 creates authorization_attempt and reconciliation case/event; it has no game-table prerequisite. 0002 creates player_state/land/mutation. Overall release order: Platform 0123–0133, Farm 0001, Farm 0002, separately approved role grants, live preflight, API deployment with entry/atomic flags OFF. Never use drizzle-kit push. Candidate versions still require live collision checks.

## Minimal roles versus actual SQL

| Caller/source | SQL resources | Granted privileges |
|---|---|---|
| API state/game repository, idempotency, authority and friend authority | player_state, land, mutation, authorization_attempt | SELECT/INSERT/UPDATE only; no DELETE/TRUNCATE |
| API atomic-pot.ts inside the same Drizzle transaction | farm_v2_apply_atomic_pot_wallet(uuid,uuid,text,jsonb,text) | EXECUTE only for this restricted RPC; no generic Core apply |
| Separate CLI reconciliation.ts | previous four tables, reconciliation_case, reconciliation_event | case SELECT/INSERT/UPDATE; event SELECT/INSERT, event sequence USAGE; no event UPDATE/DELETE |
| CLI Core actions | platform operator HTTP bridge | Existing operator authentication, not new direct Wallet SQL grants |

Grant generation requires two distinct existing, non-superuser/non-BYPASSRLS/non-CREATEROLE/non-CREATEDB roles, without role membership. Existing Core table DML or generic Core/Farm wallet RPC EXECUTE rejects the entire grant transaction before any grant. Role creation/login/secret injection is deliberately separate and requires approval; do not inherit service_role. The API credential MUST use runtime, and the operator credential is ONLY for separately authorized CLI execution. No Core Wallet table privileges are granted (schema USAGE is not table write permission). Existing broad role grants are not silently revoked. An unsafe role is rejected for operator correction.

## Node 24 and connection evidence

Root engines pins 24.x for the API-only Vercel project. Node 24.19.0 locally builds the real serverless bundle and runs compiled Express API smoke checks. Vercel main-site Node 24/READY evidence does not bind the future separate API project. vercel.json requests maxDuration=60 and preserves API routing, includeFiles and git deploymentDisabled; actual account entitlement remains BLOCKED.

Existing production TLS remains rejectUnauthorized=true (optional provider CA), session/direct required, transaction mode rejected. Three module-level pools each max=1, total up to 3 clients/warm instance; authority uses its pinned session client through acquire/release(true), while domain transactions use one Drizzle transaction connection for Farm assets and restricted Wallet RPC. No architecture change or second Wallet. DB deadlines statement=15s, lock=3s, idle-in-transaction=8s; acquisition/idle=5s; HTTP ack=50s < requested host 60s. Client expiry does not prove rollback: retain the original request key and inspect authoritative receipts/journal before retry.

New test uses two actual isolated PostgreSQL clients: backend PID stays constant across COMMIT/ROLLBACK on the locked client, competing client cannot acquire the session advisory lock until its explicit release. This is a direct local connection test, NOT proof of formal Supabase pooler session mode. Formal API session/direct target, verified TLS peer/role/database, same physical database and 3×instance capacity remain BLOCKED until live evidence. Core/project identity must match actual runtime deployment binding, not just database name postgres.

## Actual validation

Node 24.19.0 `node artifacts/api-server/build.mjs`: PASS. The pnpm front-end invocation initially attempted an unnecessary dependency install into a non-writable default store; using the repository's actual build script with existing installed dependencies succeeded. No package lock changes or dependency installation were made.

`LOCAL_TEST_POSTGRES_CONTAINER=farm-v2-p0-test-db node --test scripts/farm-v2-production-authority.test.mjs`: 3/3 PASS, zero skipped. This creates/destroys a disposable clone of the existing isolated Core-contract template; Journal rows are explicit fixtures, not production evidence.

Covered: hash/version plan, apply rejection, missing predecessor, duplicate version, late error rollback of both table and Journal, runtime denial before grant, successful actual game/authority writes after grant, Core-write and runtime reconciliation denial, operator append-only audit rights, unsafe Core-granted role rejection, two-client session affinity, production TLS/session/direct configuration and transaction-pooler rejection.

Compiled Node 24 handler smoke: three scenarios PASS (restricted-role readiness/entry off; missing RPC grant readiness 503; production exact-origin CORS). Production CORS smoke does not connect to a database. Existing game and atomic economic behavior suites were not rerun. Source atomic-pot.ts still executes the Core restricted RPC and Farm updates on the same tx; actual production colocation remains unverified.

## Remaining formal blockers

Live collision/catalog/Journal evidence; creation/binding of dedicated roles with exact grants; runtime identity/TLS and supplier session/direct proof; Vercel API project/account maxDuration/Node/resources/instance capacity; explicit migration, credentials, deployment and later opening approval. No formal operation was performed.

Runtime-role amendment: docs/farm-v2-runtime-setup.md and scripts/farm-v2-runtime-roles.mjs now provide LOGIN role creation (initially disabled with connection limit 0/password NULL), effective definer/membership inventory and emergency containment. Operator grants on the four game/authority tables are now SELECT only; case/event rights remain. Earlier descriptions of operator transaction UPDATE rights are superseded. Legacy CLI direct settlement is intentionally blocked, pending a separately approved authority workflow.
