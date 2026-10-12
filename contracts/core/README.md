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

1. Port this contract into a generated, reviewed Core migration and verify it against the full current migration chain and advisors.
2. Add a trusted Core endpoint and an account entitlement read endpoint; verify launch identities and return definitive rejections and authoritative receipts.
3. Reconcile Farm's permanent access projection from Core; expose the purchase in Farm's existing durable request/recovery flow. Never reverse a successful permanent unlock merely because Farm's subsequent read fails.
4. Run true concurrent database, lost-response, restart and end-to-end UI/Wallet/Ledger gates.

No remote database, main branch, deployment or production wallet was modified.
