# Farm local coins: candidate acceptance record

## Approved behavior
Players manually transfer coins from central into Farm and return coins from Farm to central. No automatic sweeps or balance duplication. Farm coin expenses/rewards use the Farm ledger; crystals remain central. Verified opaque identities may be reused for 30 minutes, bounded by the session's absolute expiry. Paid/refund qualification remains six hours. Production has not been changed.

## Implementation
- Additive private `farm_v2_bank` schema. Balances start at zero; existing central funds remain intact.
- Manual transfer uses one PostgreSQL transaction, local-wallet and central-wallet row locks, matching immutable ledger entries and a stable per-user request key. No cross-service transfer saga is needed because these deployments share one database.
- New coin seed/crop/workshop settlements use the same transaction as asset mutations. Pre-cutover pending central-wallet commands retain their original handler/key/recovery path. Definitive local insufficient-funds declines release workshop reservations.
- Local 88/888 land purchases preserve canonical central entitlement records and historical rights; there is no second charge on an existing right.
- Overlay wallet shows both balances, direction and amount; uncertain transfers lock the original command and offer retry. No automatic transfer on insufficient funds.
- Backend identity cache is process-local, capped at 2,000 entries, hashes scope/token, coalesces concurrent verification and never exceeds 30 minutes or credential expiry. Cold instances revalidate. Missing authority expiry disables caching.
- Platform companion change exposes authority expiry and forwards wallet reads to Farm when local mode is enabled, preventing a central balance from being mislabeled as Farm balance.

## Verified on isolated acceptance database
- Transfer in/out conservation, same-key duplicate replay, payload mismatch rejection, insufficient funds, local debit/reward, asset-failure rollback, ledger immutability and restricted grants: PASS. Synthetic transaction fixtures rolled back.
- Land 2/3 prerequisite, local charges 88/888, same/different-key repeat purchase without double charge, unchanged central balance, canonical rights and grants: PASS; fixture rolled back.
- Two simultaneous same-key deposits: exactly one Farm entry and one central entry; balances 40+60=100.
- Two concurrent 30-coin withdrawals against 40 Farm coins: one successful withdrawal and one insufficient-funds refusal; final balances 10+90=100. Dedicated acceptance-only fixture retained under `1623bc13-286e-4edc-afb3-e1bd68950caa`.
- `EXPLAIN ANALYZE` for one local debit: execution 15.131 ms. This excludes browser, proxy and connection latency and is NOT evidence of sub-second gameplay.
- Security advisor reports RLS-with-no-policies notices for the two private tables. This is intentional deny-by-default: no table privileges are granted to public/anon/authenticated/runtime; only the narrow backend functions are callable by the runtime role. No browser policy was added.

## Code verification and limits
Backend/frontend TypeScript checks and builds passed. Farm Vitest run: 246 passed, 53 skipped, one failure for absent local original scene PNGs (`sceneInteractionRuntime.test.ts`); binaries remain in the unchanged GitHub base and are not reconstructed. Final Node suite: 45 passed. Platform identity/proxy Node tests: 18 passed. The latest Farm full run retains 246 passed, 53 skipped and the one missing-scene-binary failure.

An attempted headless mobile interaction test could not launch Chromium: process singleton `socket() failed: Operation not permitted`. No UI-interaction or browser-latency pass is claimed. Test-site end-to-end acceptance is still required.

## Release gate
Keep `FARM_V2_LOCAL_COINS_ENABLED` and `FARM_V2_IDENTITY_CACHE_ENABLED` off until the matching Farm/platform code and schema are deployed to preview together. Platform also requires `FARM_V2_LOCAL_COINS_ENABLED=1` to forward the wallet read. `0004_farm_v2_local_coin_bank.sql` is the consolidated fresh-production candidate; isolated DB iteration migrations have separate acceptance journal names. Do not replay it on that already-provisioned acceptance schema.

Vercel last refused the corrected deployment with HTTP 402 `api-deployments-free-per-day`, retryAfter 86400. No local Vercel CLI is installed. Do not claim promotion or end-to-end sub-second performance until a real preview run succeeds. The candidate migration is registered in the authoritative map with execution disabled pending acceptance. Its guard now recognizes schema-qualified private tables; the hash/guard unit check passed. Audit the actual production schema/journal before execution. Preserve unresolved legacy seed transactions; do not clear or replace their keys.
