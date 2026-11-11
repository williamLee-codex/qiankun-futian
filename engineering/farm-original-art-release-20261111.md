# Farm original-art release — 2026-11-11 (Asia/Taipei)

## Result
Release remains blocked. Production was not switched. Do not restart integration or regenerate the six images.

## Sources
- UI source: 31251f66377eadfee1023fa42b0ef9a4abd4dcba, branch fix/farm-v2-original-art-ui-20261111.
- Seed-purchase authority fix: 61f667c6633a3b48ca6d6d17dbeb87d044eee6e4, branch fix/farm-seed-wallet-authority-20261111.
- Platform integration: williamLee-codex/imperial-compass-platform commit 38cafd5f8628778f6b7356ae5a67319d5df8c8d5, branch fix/farm-original-art-release-20261111. Its build script pins UI source 31251f66 and verifies the artifact manifest. It preserves ads integration from 3f3d572b.

## Verified
- Full test command: 240 Vitest tests passed, 53 skipped; all 35 Node tests passed.
- Full workspace typecheck and API build passed.
- Added regression first failed with HTTP 400, then passed after retaining per-transaction authority on seed purchase. Six-hour paid-land refresh caching remains in the handler; cached qualification cannot supply Core Wallet's required operation UUID.
- Preview platform deployment dpl_9y8pXS5qu8M356NUffCoEjrHhcNL is READY. Test alias qiankun-futian-main-git-test-ff65ec-williamlee-codexs-projects.vercel.app now points there.
- Preview API deployment dpl_3VJXvAgmxwLYej4P2ZSHJGrvVP5i is READY at UI-era source 31251f66, and the existing test API alias points there. This API does NOT yet include the seed authority fix.
- Preview login and authenticated reads worked. Inventory before/after UI switch stayed at 80 first-field seeds and 391 crops.
- Farmhouse opens warehouse; mobile-sized viewport also opened warehouse.
- Real harvest succeeded: crops 391 -> 411; real sow succeeded: seeds 80 -> 60 and growing countdown rendered.
- Crop exchange succeeded: crops 411 -> 406, credit 1 coin.
- Locked field 2 has an 88-coin unlock button and no seed purchase button. Insufficient-funds rejection produced zero unlock debits.
- Six original PNGs are included in deployed UI manifest; farmer PNG endpoint returned HTTP 200 image/png.

## Test environment repair
Only Supabase project ijguwqserwiufpxizgzy (imperial-agent-test) was changed. Added missing existing entitlement-domain structures and coin-land RPCs from repository migrations, plus system.set_updated_at dependency. Search path was pinned to pg_catalog. Public/anonymous and authenticated direct coin-land RPC execution is denied; service_role is allowed. No production DB migration or balance edit was performed.
Existing preview bridge secret scope was moved from codex/farm-v2-session-identity-20261110 to fix/farm-original-art-release-20261111 without reading, replacing or disclosing the value.

## Blocker and recovery
Vercel POST /v13/deployments returned HTTP 402 api-deployments-free-per-day: more than 100 deployments; retryAfter 86400 seconds. No Vercel CLI or CLI credentials are available here. Do not retry repeatedly or change billing automatically.
The failed seed purchase has one WALLET_PENDING intent for 1 coin and ZERO matching ledger entries; retain the original request key and retry the same operation after the patched API is deployed. Do not clear journals, issue refunds, mint coins, or create a replacement purchase to hide the pending result.

Next: deploy the latest commit on fix/farm-seed-wallet-authority-20261111 to preview; point the existing test API alias to it; retry the pending seed purchase in the retained browser session; verify one debit and 20 added seeds. Then perform final release verification and deploy the same backend fix with production environment settings, followed by the pinned platform build. Never promote a preview-configured artifact directly into production.

## Remaining limitations
Less-than-one-second performance is NOT achieved: preview harvest 8.341 s, sow 3.110 s, crop exchange 11.590 s. Do not report complete V2 acceptance or performance success.
Production www.yuceluopan.com remained on dpl_Hfifz8Vi9ReQGafTE2f9Jmt82wbJ at the final check. New original-art UI and seed fix have not been installed there.

## Harvest latency follow-up
The harvest route still refreshed Core paid-access authorization on every operation, unlike sowing. Harvest now uses the same approved six-hour qualification policy as sowing. Expired/missing qualification still establishes Core authority and refreshes access; the existing launch/session authentication and domain/idempotent inventory transaction remain in force. Seed purchases continue to require per-transaction authority for Core Wallet.

The new cached-harvest regression first failed (one unnecessary authority invocation), then passed after the route fix. Full tests passed: 240 Vitest plus 35 Node; 53 Vitest tests skipped. Full workspace typecheck and API build passed. No deployment was retried during this follow-up because the recorded quota rejection remains unresolved. No improved deployed latency or sub-second success is claimed.

Pending purchase clarification: the old deployed client treats the HTTP 400 wallet-schema error as definitive and may have removed the original client request key. The server WALLET_PENDING row remains authoritative. Before any further purchase, recover/reconcile that exact stored request and confirm its ledger outcome; do not assume the browser retained the key or create a replacement charge.
