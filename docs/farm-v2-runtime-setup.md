# Runtime configuration checklist

Review-only; no formal operations have run. Original Migration SQL is unchanged.

## Roles and execution order

1. Approve candidate roles `farm_v2_runtime` and `farm_v2_operator`, check pg_roles for collisions, and run the generated role creation SQL only with separate approval. Both have LOGIN, NOINHERIT, no membership, no elevated attributes, PASSWORD NULL and CONNECTION LIMIT 0. They are intentionally unusable until capacity and credentials are approved. Do not inherit service_role (NOLOGIN) or use postgres as runtime.
2. Approve/install Platform 0123–0133, Farm 0001/0002 using the reviewed Journal wrappers. Then review and approve the generated GRANT SQL. Runtime: four game/authority tables SELECT/INSERT/UPDATE and only the restricted atomic Wallet RPC. Operator: those four tables SELECT only; case SELECT/INSERT/UPDATE, event SELECT/INSERT and sequence USAGE. No direct Core table writes or generic Wallet RPC. Existing transaction DML is explicitly revoked from operator.
3. The old reconciliation CLI's direct mutation/authorization finalization now fails under this operator role by design. Observation and case/event tracking work; transactional settlement requires a separately approved authority workflow. Do not solve this by restoring operator transaction write rights.
4. Inject passwords through approved secret tooling (never SQL artifacts/logs/chat), approve concrete per-role connection limits from the capacity calculation below, and verify direct/session access using actual credentials. Password NULL is not a substitute for evaluating provider IAM/trust authentication. Never grant schema CREATE, role membership or ownership of SECURITY DEFINER functions to either role.
5. Audit every effectively executable SECURITY DEFINER function returned by the role preflight, including PUBLIC grants and SET ROLE memberships. NOINHERIT alone does not stop PUBLIC access or membership-based SET ROLE. Existing Core/public functions are not changed; unexpected effective authority requires STOP and a separately approved remedy.

Offline generation:

```bash
node scripts/farm-v2-runtime-roles.mjs --runtime-role farm_v2_runtime --operator-role farm_v2_operator --emit-create
node scripts/farm-v2-production-authority.mjs --runtime-role farm_v2_runtime --operator-role farm_v2_operator --emit-grants
node scripts/farm-v2-runtime-roles.mjs --runtime-role farm_v2_runtime --operator-role farm_v2_operator --emit-preflight > /tmp/farm-v2-runtime-preflight.sql
node scripts/farm-v2-runtime-roles.mjs --runtime-role farm_v2_runtime --operator-role farm_v2_operator --emit-revoke
```

All emitters are offline and reject --apply. Execute readonly SQL only in the securely established session with ON_ERROR_STOP=1 and verified TLS; never place a DSN/password in command-line arguments. The preflight lists non-secret role/catalog/TLS/privilege metadata, not balance/token data. Also run the existing atomic-pot preflight with an operator observer and --runtime-role, then actual runtime readiness; an unprivileged role cannot substitute for the unfiltered observer's legacy-transaction check.

Incident approval order: close both V2 entry flags, pause new requests, disable LOGIN/clear password/limit=0 and commit containment, terminate exactly these two roles' existing backends, then revoke scoped privileges. Containment commits before optional table/RPC revocation, so a missing object cannot undo account disablement. Failed termination remains an incident blocker. No DROP OWNED/CASCADE, no deletion of audit/assets, no Core RPC modification; unknown in-flight commit is resolved using original idempotency key and authoritative receipt/journal.

## Separate API-only Vercel project

- Repository: qiankun-futian, Root Directory **`.` (repository root)**, Framework **Other** (`framework:null`). Not artifacts/api-server: the API uses sibling workspace packages.
- Install: `pnpm install --frozen-lockfile`; Build: `pnpm --filter @workspace/api-server run build`; Output Directory: **unset**, no dist/public override. API entry api/index.mjs imports artifacts/api-server/dist/serverless.mjs.
- Node **24.x** pinned by root engines; Functions maxDuration **60s** requested, includeFiles artifacts/api-server/dist/**, rewrite /api/:path* → /api/index. Git automatic deployment remains disabled. Do not deploy another frontend; existing qiankun-futian-main owns it.
- Inject only API names from .env.farm-v2.example: NODE_ENV, DATABASE_URL, FARM_DB_POOL_MAX, FARM_DB_CONNECTION_MODE, optional FARM_DB_CA_FILE, PLATFORM_BASE_URL, REPLIT_APP_SHARED_SECRET, FARM_V2_ALLOWED_ORIGIN, FARM_V2_ENTRY_ENABLED=0, FARM_V2_ATOMIC_POT_ENABLED=0. BASE_PATH/VITE_FARM_API_BASE_URL are existing frontend build settings, PORT is local-only. Never inject the operator credential into API runtime.
- Actual separate project/plan, available duration, concurrency/instance controls and resources remain BLOCKED; main-site READY/Node 24 is not proof of the API project's entitlement. Creating the project and binding variables require approval; no such action occurred.

## Capacity and deadlines

Let M=60 (supplied server max), R=reserved connections, O=other workload peak, H=operator/maintenance/safety reserve, P=provider session/direct effective remaining backend/client budget. Farm budget F=min(M-R-O-H,P); require F>0 and 3×N<=F, N<=floor(F/3). Cap role connections to the approved budget (not arbitrary unlimited), and ensure runtime/operator combined limits plus other apps fit the server/pooler budget. Illustration only: R=3,O=12,H=9,P>=36 gives F=36,N<=12; none of these assumed values is production evidence. The observed six connections are not a workload peak.

Three separate module pools each max=1 per warm instance; session lock uses its same pinned client, destroyed on release. Transaction-mode pooling is rejected; session/direct configuration declaration still needs actual provider/peer verification. Production TLS verifies the peer (rejectUnauthorized=true), optional provider CA; never disable TLS verification. DB statement=15s, lock=3s, idle transaction=8s, acquisition=5s, HTTP acknowledgement=50s, requested Function=60s. Effective host limit must exceed the HTTP deadline with teardown margin. A client/HTTP timeout is not a rollback proof; result unknown must resume/query under the original idempotency key, never new-key debit or direct balance repair.

Local evidence this round: 2/2 new targeted Node/isolated PostgreSQL tests (no full suite); role attributes and collision stop, readonly preflight, operator transaction/RPC rejection, Core raw-write rejection, service_role membership rejection, audit case/event success, emergency disable and privilege revocation. Previous Node 24 build/Functions/pool/session-affinity results are retained without rerunning them. Formal TLS, physical same database, actual role credentials, budgets/instance limit and API project remain BLOCKED.

Recovery amendment: the user has created the empty qiankun-farm-v2-api project (prj_0QZ4HyWNmMYkb1pgB4QJnTTDjmLL, Node24, no deployment). Candidate Farm 0003 adds read-only inspection and runtime-only append-only recovery observation. Operator case/event rights are now SELECT ONLY; prior write descriptions are superseded. CLI applies are disabled, readiness requires recovery RPCs. See farm-v2-recovery-runbook.md. Project creation is no longer blocked, while actual limits, credentials/TLS/co-location and deployment remain unverified.
