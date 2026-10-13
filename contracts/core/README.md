# Farm V2 coin-land unlock contract (staged)

This is an executable Core-side contract for FINAL LAND-UNLOCK-001/003 and UNLOCK-ATOMIC-001. It is not a deployed migration, a live API, or a claim that the unlock UI is complete.

The new `farm_v2_purchase_coin_land(owner UUID, land ID smallint, request ID text)` function accepts no caller price, currency, balance, qualification, or entitlement. The trusted Core API must verify its shared secret and the `qiankun-futian` launch token before passing the verified Auth owner ID. Core maps that identity to `core.users` and records account-scoped lifetime rights in the existing `platform.entitlements` domain. No Farm-side wallet or second entitlement authority is introduced.

Products `qiankun-futian:land:2` and `qiankun-futian:land:3` cost 88 and 888 coins respectively. Land 3 requires the owner's permanent Land 2 entitlement. Core serializes purchases on the owner's wallet row. The debit, ledger, entitlement and purchase event are one database transaction; an event failure rolls everything back. Active already-owned rights preserve their first grant timestamp and cost nothing, including when replayed with a different request ID. Inactive lifetime rights are never charged again or silently reactivated; they return `entitlement_unavailable` with their original grant. A later active platform regrant is recognized separately from the earliest historical timestamp and its current entitlement ID is returned without charging. Land 3 prerequisites use historical lifetime ownership irrespective of the current access status. Reusing a completed request for a different land conflicts. Insufficient funds, unavailable identity/product or a suspended/closed wallet do not debit.

The function is SECURITY INVOKER. PUBLIC/anon/authenticated cannot execute it. The trusted service role receives explicit, limited table/function access; no role or BYPASSRLS setting is created or altered.

## Reference dependencies and test boundary

`reference/0006-platform-entitlements.sql` and `reference/0019-core-wallet-runtime.sql` are exact read-only test inputs from `williamLee-codex/imperial-compass-platform` commit `35ea8c21457927a3de296cd3332a0199aa535018`:

- `supabase/migrations/0006_create_platform_entitlement_domain.sql`, Git blob `a73ba2d623cdf6ac31d7d0cd42158a8062b55f1a`.
- `supabase/migrations/0019_create_core_wallet_runtime.sql`, Git blob `75dc09dd3aad51feb858f4bc6e41be7fc997968b`.

The tests execute those actual wallet/entitlement migrations and the staged SQL on PGlite. Minimal Auth/Core identity tables and shared trigger helpers are test infrastructure. The eleven contract cases cover fixed prices, prerequisite, same/different-ID replay, conflicting request reuse, insufficient funds, player isolation, atomic failure, direct-client denial, service-role execution, malformed requests and suspended wallets.

This is single-connection PostgreSQL-engine evidence. It does **not** validate the platform's entire migration chain, real Supabase API authentication, concurrent connections, production role grants, Core launch-token verification, or Farm recovery across processes. The platform checkout could not be cloned with the available shell credentials; its relevant source was read through the connected GitHub service. No partial checkout is presented as a complete platform build.

## Required integration before release

1. Review this staged migration against the full current Core migration chain, run Supabase advisors, and verify ACLs in the target project before applying it.
2. Run Core typecheck/tests and CI against the trusted endpoint; add an account entitlement read endpoint and verify authoritative receipts in an end-to-end environment.
3. Reconcile Farm's permanent access projection from Core; expose the purchase in Farm's existing durable request/recovery flow. Never reverse a successful permanent unlock merely because Farm's subsequent read fails.
4. Run true concurrent database, lost-response, restart and end-to-end UI/Wallet/Ledger gates.

The isolated Core feature branch now contains the mission reward migration and trusted endpoint. No main branch, remote database, deployment or production wallet was modified.


# Farm V2 mission reward contract (staged)

`farm-v2-mission-reward.sql` adds the `farm_v2_claim_mission_reward(owner UUID, mission ID text, request ID text)` Core Wallet contract. The server allowlist sets D01/D02/D03/D04 and W01/W02/W03/W04 credits to 2/3/3/5/10/15/15/20 coins. The RPC accepts no client amount, currency, material, period, or balance. Ledger reason/reference type are `farm_v2_mission_reward`; reference ID is the mission ID; idempotency key is `farm-v2:mission-claim:<requestId>`. Exact replay returns the original ledger entry, while request reuse with a different mission conflicts. It requires an active Core identity and wallet, and is executable only by `service_role`.

`platform-files/supabase/migrations/20261013100000_farm_v2_mission_reward.sql` is the Farm-side contract mirror. The matching migration is staged in Core branch `fix/farm-v2-core-coin-land-api`, currently at `a4a72283869b086b41e8249ff3f78098621e25e3`; it has not been applied. `artifacts/api-server/src/lib/farm-v2-core-mission-reward-contract.test.ts` exercises the SQL contract with the pinned wallet reference migration on PGlite, including replay after an identity becomes inactive.

The Core handler and route are mirrored under `platform-files/src/lib/farm-v2/mission-reward-handler.ts` and `platform-files/src/app/api/replit/farm-v2/mission-rewards/route.ts`, and are now staged in the same Core branch/commit above. The handler accepts only `missionId` and `launchToken`, reads the stable request ID from `x-request-id`, verifies the trusted secret and `qiankun-futian` launch token, and calls only `farm_v2_claim_mission_reward` with owner, mission and request ID. Its seven handler contract cases pass in the Farm workspace. The Core checkout is not mounted here, so the actual Core Vitest/typecheck and CI results remain pending; the staged endpoint is not deployed or database-backed until its migration is applied.
