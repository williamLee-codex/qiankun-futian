# Farm V2 first deployment

Status: local preparation; **NO-GO for production execution**. No prior Farm API service exists to recover. The chosen first database is the existing Core Wallet PostgreSQL project `qowjznvinqoxekiyjyvy`; this is a deployment decision, not evidence that configuration or migrations have been applied.

## Decision

| Option | Changes / operations | Cost and connection trade-off |
| --- | --- | --- |
| Put all Farm source/dependencies inside the main Next.js app | Larger cross-repository workspace/import/build change | One project, but substantially more integration and regression risk |
| **Main Vercel static frontend + Farm Vercel Node Functions API** | Reuse existing compiled Farm frontend, Express handlers and Core bridge; selected | No second frontend or always-on service. API invocation and pooler capacity depend on the existing plans; no unverified price estimate is claimed |
| Main frontend + always-on separate API | Reuse Express but introduce host/process lifecycle | Stable long-lived pool, additional idle service cost and maintenance |

The main site hosts `/farm-v2/` and proxies `/api/farm-backend/*` to the API project's `/api/*`. Farm V1 `/farm` is unchanged. Server middleware closes direct V2 HTML and proxy access while the flag is off; session revocation alone can pass through for authenticated backend cleanup. The backend separately checks its own entry flag and real platform session/operation authority. Flags are never inferred from request parameters.

The API uses the same physical PostgreSQL database as Core Wallet, with a dedicated restricted runtime login. No Core balances are copied and no new wallet is created. The existing transaction/receipt design remains unchanged. A genuine Core permit in that database is still required per operation.

## Local deliverables

- `api/index.mjs`, `vercel.json`, compiled `serverless.mjs`: Express function export without `listen()`. Existing CLI/local server entry remains. Generated runtime files are included in the function package; automatic Git deployments are disabled in the proposed API configuration.
- `connection-config.ts`: verified production TLS, optional trusted CA file, max two primary pool clients, five-second connection/idle timeouts and reusable pools. The existing separate journal pool has max two clients, so budget **up to four per warm instance**, not two total. No pool is closed per request. Do not use a statement pooler; Supabase transaction pooling must retain one backend for BEGIN through COMMIT and support the existing transaction-level locks. No named prepared statements/session-local authority is introduced.
- `/api/healthz` is liveness only. `/api/healthz/ready` reads catalog/privilege metadata, fails on missing RPC/grants and rejects direct Core table writers. It does not certify RPC source hashes, deployment topology or drained legacy work; the full preflight remains mandatory. Unexpected API failures return a fixed error code without driver details.
- Production CORS accepts only `FARM_V2_ALLOWED_ORIGIN`; browser cookies are not used by Farm. Use the primary website HTTPS origin. Direct server probes without Origin still require existing authentication for game routes.
- `.env.farm-v2.example`: names and empty placeholders only. Production variables must be injected securely, never copied into Git. The main repository has its own template for the API origin, launch URL, shared secret and disabled flag.
- The main site's local `prepare-farm-v2.mjs` builds from a **clean committed** Farm checkout and records exact commit/file hashes. Only existing V2 frontend assets are packaged; no second frontend project or gameplay implementation is added. Main build verifies that artifact. Production bundles do not ship the development-only V1 demo entry.

## Approved-operation sequence (not executed)

1. Authorize read-only target inspection and creating/linking one API-only Vercel project for this Farm branch. Confirm the main site's canonical HTTPS origin, account runtime/duration limits (configuration requests 60 seconds), Supabase pooler endpoint and available connection budget. No new frontend project is needed.
2. With a separate metadata observer/migration connection, verify existing Core authority, all current source/history entries, schema/privileges and every proposed version collision. Do not reuse the runtime role for migrations. Inspect Farm tables and any migration journals; never assume first deployment means tables are absent.
3. Platform dependency order: `0123 → 0124 → 0125 → 0126 → 0127 → 0128 → 0129 → 0130 → 0131 → 0132`. Use the reviewed per-file canonical versions and SHA-256 in `production-migration-map.json`; exactly matching applied entries are skipped, never replayed blindly. The existing tool's offline `--migration 0132 --plan` passes. Its actual preflight remains mandatory for each unapplied migration.
4. Farm runtime SQL order for a fresh target: `0001_farm_v2_authority_reconciliation.sql → 0002_farm_v2_game_baseline.sql`. 0001 does not structurally depend on the game baseline. Both are strict transactional CREATE operations, not idempotent schema pushes. Apply only after exact absence/conflict checks from `farm-v2-baseline-migration.md`. Both must be registered with the **approved target journal contract and collision-free canonical versions**; short Farm filenames must not be blindly fed to Supabase's timestamp migration runner. This registration/runner approval is an explicit remaining gate, not a completed production operation. Original SQL files are unchanged.
5. Create/verify the restricted Farm runtime role. Grant public/core schema USAGE, necessary Farm player/land/mutation/authorization journal DML, the restricted atomic RPC and audited reconciliation permissions as applicable. Do not grant raw Core table writes or unrestricted balance-changing RPCs. Anonymous/authenticated roles must not access Farm private tables. Review RLS/ACLs after schema creation.
6. Run Farm baseline readiness and the full atomic read-only preflight against this same database using the actual runtime role and an observer able to see all pending permits. Require exact RPC sources/guards, 0132 canonical history, privileges and zero unfinished legacy synthesis/OPEN permits. Stop on drift, version conflict, missing dependencies, excessive authority, unresolved work or uncertain physical identity. Health readiness alone is insufficient.
7. After separate migration/deployment approval, deploy the API with flags off and verified TLS/runtime credentials; verify liveness/readiness. Build/export the committed Farm frontend for the existing main site, set its trusted API origin and same-site `/farm-v2/` launch URL, and deploy the main site with entry off. Securely bind the existing shared secret on both sides. Never print the secret or URL credentials.
8. Perform actual deployed-session and atomic transaction acceptance, including interruption/original-key retry, suspension, logout/revocation and V1 regression. Only then authorize both entry flags and `FARM_V2_ATOMIC_POT_ENABLED=1`. Official festival/RPG mappings stay disabled and optional.

No authoritative production Farm inventory has been demonstrated to need relocation. If inspection finds existing Farm rows elsewhere, stop: a separately approved migration must copy the entire authoritative inventory/player/journal state with backup, drain and reconciliation; do not merely point this runtime at an empty database.

## Read-only/local commands

```sh
# Farm checkout (no SQL apply supported):
node scripts/farm-v2-db-preflight.mjs --plan
node scripts/farm-v2-atomic-pot-preflight.mjs --platform-checkout /path/to/platform --plan
# Secure observer DATABASE_URL is supplied out-of-band:
node scripts/farm-v2-atomic-pot-preflight.mjs --platform-checkout /path/to/platform --runtime-role ACTUAL_API_ROLE
# Platform checkout, offline only:
node scripts/production-migration-authority.mjs --migration 0132 --plan
node scripts/prepare-farm-v2.mjs --source /path/to/committed/farm
node scripts/verify-farm-v2-artifact.mjs
```

On a failed migration, stop subsequent steps, verify transaction rollback and journal state, fix the prerequisite and obtain approval for a retry. Never replay older function definitions after newer guards. On deployment/configuration failure keep entry closed, restore the previous artifact/configuration and retain transaction journals. Unknown transaction acknowledgements retry the original key; committed atomic receipts forbid reversing just the wallet leg.

## Verification scope

Local connection-policy tests, isolated transaction regression, compiled Functions HTTP probes, main-site route/flag tests, architecture/type checks and artifact hashes provide local evidence only. Actual Vercel function packaging/runtime, secure TLS handshake, production role/history, account limits and end-to-end deployed acceptance remain unverified. No hosted build, push, merge, formal environment-variable change, migration or production data operation is authorized or performed in this preparation.
