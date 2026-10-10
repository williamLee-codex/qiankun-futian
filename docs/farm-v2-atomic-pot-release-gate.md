# Farm V2 atomic pot release gate

## Local implementation and authority

POT-ATOMIC-001 and POT-GALLERY-004 now have a co-located PostgreSQL implementation. New public synthesis requires `FARM_V2_ATOMIC_POT_ENABLED=1`, the authenticated server authority context, and a fresh platform permit visible in the same database. The Farm transaction locks player state, computes the existing workshop plan, calls the platform-owned Core Wallet RPC on that **same transaction connection**, and writes inventory, display, gallery rewards and the request result before committing. No HTTP wallet write, copied wallet, or direct Core balance update is used.

Platform forward migration `0132_farm_v2_atomic_pot_settlement.sql` adds the restricted RPC and immutable settlement receipts. Independent legacy wallet compensation is rejected for an atomic receipt. Existing Core pricing, gross affordability, suspension, paid-operation authority and transaction-closure checks remain in charge. Old Saga records retain their original recovery path; they are not described as ACID. New synthesis fails closed when the atomic flag, local RPC, privileges or real platform permit is absent.

The database connection now handles active-client and idle-pool error events with fixed error codes. The transaction still rejects and rolls back on connection failure; driver errors and connection details are not logged.

## Production status: NO-GO

The platform project is identified as `qowjznvinqoxekiyjyvy`, but the actual production Farm API deployment and `DATABASE_URL` binding remain unavailable. This does **not** establish co-location. No production query, data relocation, role grant, migration, deployment or push was performed.

If the databases differ, the implementable remaining operation is an explicitly approved relocation of the **entire authoritative Farm inventory/player/journal state** onto the platform PostgreSQL database, with backup, drain and reconciliation. Moving only pots or rebinding the URL to an empty database is unsafe. Until physical co-location and fresh platform permits are verified, the strict production transaction gate remains BLOCKED.

## Cutover prerequisites and stopping conditions

1. Keep Farm V2 entry disabled (`FARM_V2_ENTRY_ENABLED` off); do not enable atomic mode during migration review.
2. Identify the real Farm API connection, migration operator and restricted runtime role without publishing credentials. Confirm the platform bridge writes its fresh permits into this exact database.
3. Reconcile/drain unfinished legacy synthesis journals and OPEN workshop permits. Preserve original idempotency keys and audit evidence; do not silently convert wallet legs into atomic transactions.
4. Verify the existing platform dependency chain `0123 → 0124 → 0125 → 0126 → 0127 → 0128 → 0129 → 0130 → 0131`, then review `0132` / canonical version `20261010000132`. Farm baseline tables and `0001`/`0002` must exist in the same database. A production history collision, schema/RPC drift or missing dependency stops execution.
5. Use a separate migration role. The runtime needs Farm player, mutation and authorization-attempt SELECT/INSERT/UPDATE, schema USAGE and only the restricted atomic RPC. It must not write Core tables or execute unrestricted balance-changing RPCs. The preflight retains legitimate authenticated Core ownership SELECT policies; it rejects browser writes and excess runtime privileges.
6. After separately authorized migration work, run the read-only preflight below with the actual runtime role. It checks exact source hashes/RPC bodies, columns, RLS, triggers, privileges, canonical migration history and drained work. An observer unable to see all permits is rejected to prevent a false empty result. Any false check stops cutover.
7. Only then separately authorize runtime deployment and flag enablement. Acceptance must use the actual deployed API: synthesis, same-key replay, concurrent first reward, display upgrade, suspension/canceled transaction and interruption recovery. Local tests are not production acceptance.

```sh
# Offline only, no database mutation:
node scripts/farm-v2-atomic-pot-preflight.mjs --platform-checkout /path/to/imperial-compass-platform --plan
# Read-only observer connection supplied securely; audit the actual API role:
node scripts/farm-v2-atomic-pot-preflight.mjs --platform-checkout /path/to/imperial-compass-platform --runtime-role ACTUAL_FARM_RUNTIME_ROLE
# In the platform checkout, offline migration plan:
node scripts/production-migration-authority.mjs --migration 0132 --plan
```

`--apply` is rejected by the Farm preflight. The platform plan succeeds locally; this is not a production history check.

SQL SHA256 (LF-normalized): `346990e8a92d5a38c0a8ff28ae3dc78f74edcb548f615643ebdd6d091679c551`.

## Failure recovery

Before commit, any SQL/domain error rolls back Core posting, receipt, inventory, display, gallery and journal together. After an unknown commit acknowledgement, retry the **original request ID and command**; the committed journal returns its result without duplicating assets. Do not issue a new key. Old Saga interruptions use their existing reconciliation/compensation flow. An already committed atomic settlement cannot be repaired by reversing only the wallet half; inspect and escalate for a separately reviewed coupled domain reversal. No destructive rollback or unrecorded production repair is provided here.

## Local evidence (2026-10-10)

- Farm isolated PostgreSQL: **14 passed**, 33 unrelated tests intentionally not selected. Includes late commit failure, actual in-flight visibility and backend termination, original-key retry, concurrent first reward/replay, gross funds, suspended wallet/canceled transaction, displayed upgrades, legacy recovery, and rejection of independent compensation/remote-only permits.
- Platform isolated migration/preflight tests: **6 passed**, 0 skipped. Includes canonical 0130/0131/0132 application, missing prerequisite stop, preserved wallet/closure protection, least-privilege Farm runtime, exact source/history checks and rejection of source/privilege drift.
- Farm workspace TypeScript and API server build: **PASS**. No frontend behavior was changed; no full unrelated suite or frontend rebuild was run.
- Platform `0132 --plan` and Farm read-only `--plan`: **PASS**, offline only.

## Other user-requested gates

All nine worksheets of both supplied XLSX files were read; the existing 208 effective FINAL rules remain the source. No new rules or prices were introduced.

Approved `0915手機版(2).png` and `0915電腦版(2).png` were not found in available local attachments, shared files or repository history. Platform generic scene assets originate from Farm V1 commit `99a45ad3`; they are not approved replacements. Existing desktop/mobile hotspots were preserved. Exact visual integration remains **ASSET BLOCKED**.

The specification defines festival formation types and RPG rewards, but supplies no deployable official festival code/time-window mapping or RPG achievement UUID/threshold master. `FORMATION-RPG-002` and `FORMATION-RPG-PROP-001..005` explicitly depend on that master. Existing trusted-grant acquisition stays disabled when the official mappings are absent. No event code, date, achievement ID or threshold was invented.

Remaining owners: platform/Farm operators for physical DB identification, co-location approval and restricted roles; platform repository for reviewed 0132 execution; Farm repository for runtime cutover; asset owner for approved scene originals; official specification/RPG owner for event and achievement mappings.
