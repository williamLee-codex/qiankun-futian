# Imperial Compass / Farm V2 rescue result — 2026-11-08 (Asia/Taipei)

**Release decision: NO-GO. Agent rescue remains incomplete.** No production deployment, OAuth setting, secret, schema or player record was changed. No model request, GitHub Actions dispatch, Vercel Sandbox or new paid resource was created.

## Implemented and verified

- Started from PR #9 head `a5d123b54515ccef27314e633394c3d6b6e88cca`, not an assumed newer revision. Its original five bridge regressions pass.
- Integrated the existing dual-warehouse/UI branch at `14e23b049e5d23e17622b036b2c6f25bd77fed3a`. Preserved the API deployment configuration when resolving its conflict with the frontend-only Vercel configuration. The merged source and artwork preserve the existing warehouse, six-category bag, synthesis, pets, friends and wallet work.
- Farm warehouse supplies harvested plants. Synthesis reads those crop counts; the 36 crafted pots are counted in synthesis, not duplicated in bag inventory. Furniture remains marked for the next version. Existing UI regressions exercise these rules.
- Fixed test execution: Node-native suites run separately, UI dependencies are pinned in the lockfile, JSX uses automatic transformation, UI tests select jsdom, and the entry-gate test no longer creates a real DB pool. Corrected stale farmer-test fixtures to explicitly disable switches; did not change the existing default-on farmer behavior.
- Corrected the browser-session Node fixtures to provide the standard global `location`. Verified uncertain retries retain the mutation request ID.
- Added real loopback HTTP Session exchange/revoke and unauthorized rejection tests using the actual fetch adapter. The HTTP server is a fixture; this is not Google OAuth or deployed Supabase acceptance.
- Agent repair commit: `1eac9838a536ccd6ad2d739f4fd4864dc2365ae5` on existing platform isolation branch `codex/agent-farm-api-source-scope-20261104`. It permits exactly `artifacts/api-server/src/lib/farm-v2-platform.ts` and pins this repair to `codex/farm-bridge-header-contract-20261107`. Neighboring server files remain forbidden.
- Applied matching migration `20261108141347_agent_farm_bridge_isolated_repair_scope` only to Supabase `ijguwqserwiufpxizgzy` (imperial-agent-test). The old DB CHECK would otherwise reject the newly authorized repair path.

## Commands and results

| Verification | Result | Evidence |
|---|---|---|
| Node / pnpm | v24.22.1 / 11.25.0 | Session runtime |
| `pnpm install --frozen-lockfile --ignore-scripts` on original PR head | PASS | Original lockfile installed; UI test dependencies subsequently pinned |
| `pnpm exec vitest run artifacts/api-server/src/lib/farm-v2-platform-bridge-contract.test.ts` | 5 PASS | pr9-five-tests.log |
| `PORT=4173 BASE_PATH=/ pnpm run build` | PASS, including all workspace typechecks and builds | build-final.log |
| `pnpm test` | 217 Vitest PASS, 52 SKIP; 34 Node PASS | test-final.log |
| Agent scope regression before fix | Expected failure: unsafe_change_path | agent-bridge-scope-red.log |
| Agent focused scope regressions after fix | 20 PASS | agent-bridge-scope-green.log |
| `node node_modules/vitest/vitest.mjs run src/features/agent-center src/tests/agent-center` | 510 PASS / 93 files | agent-tests-final.log |
| `node node_modules/typescript/bin/tsc -p tsconfig.agent-worker.json` | PASS (exit 0, no diagnostics) | agent-worker-build.log |
| Real isolated PostgreSQL recovery RPC exercise | 8 assertions PASS; fixture transaction rolled back | agent-recovery-acceptance.sql / result JSON |
| Existing isolated API `/api/healthz/ready` | HTTP 200, ready | remote-evidence.json |

The Agent modules used for these tests were checked against GitHub blob SHAs at `3f07417c80c2a939708508b74a2a0581623a35d2`, refreshed where different, then patched. Shared dependencies came from the preserved local rescue checkout. This is Agent-module and Worker verification, not a claim that the entire platform repository passed every check.

The 52 skipped tests belong to the PostgreSQL baseline, connection lifecycle, wallet saga and embedded browser acceptance paths. Their guards require a disposable local PostgreSQL/container and, for browser cases, the browser acceptance setting. Those prerequisites were unavailable. They were not run against the shared cloud test DB as a substitute: their setup creates and tears down schemas.

The real cloud SQL exercise verifies the authorized path, rejects an adjacent route path, obtains a recovery lease, rejects duplicate/wrong-owner claims, rejects stale finalization/release, and enforces a 24-hour cooldown. Independent concurrent connections were NOT tested. No actual GitHub-writing Agent worker cycle was claimed.

## Deployment mapping (read-only)

| Surface actually resolved | Deployment | Git revision / limitation |
|---|---|---|
| `www.yuceluopan.com` | `dpl_5bWnCy6N7dy9y3uRA6FrTpCx4bGN` | Production CLI deployment; Git SHA absent in returned metadata |
| `qiankun-futian-main.vercel.app` | `dpl_H8WPdjrNkygFNmbYVhviDEieM4Et` | Platform repo `5c2351fe28eaebb2862f0f92b5b469892f71d5dc` |
| Farm API account alias | `dpl_FtYWjVE4jN9FgSB4JBwn3jczTyHy` | Staging, Farm repo `6da96e3594ddcfd22e7aa5a64d7ab9a5b5d9cc32` |
| Dual-bag preview account alias | `dpl_4wUbE6xTFCyAtyrYAhtEo1T4jSbX` | Staging, Farm repo `14e23b049e5d23e17622b036b2c6f25bd77fed3a` |

The newest production-target Farm API history entry was `dpl_AeRhfmwj1FPB3zR9avbQh8oxzYaC`, platform repo `3396c38108088d18cecf9bf4ac423fdae14dcc00`. It is not the account alias above. A current production Farm API URL/alias must be positively resolved before switching. The latest project deployment was not treated as the active production deployment.

## Remaining blockers

1. Production Farm API environment metadata contains neither `REPLIT_APP_SHARED_SECRET` nor `FARM_V2_BRIDGE_SHARED_SECRET`. Production platform metadata has the legacy secret name but no bridge secret name. Values were not printed or rotated. The reported deployed platform Session contract still needs a complete current-source check: the deployment source-content tool truncated its base64 response, so the full deployed handler could not be independently revalidated in this run.
2. Preview frontend points to the older API account alias. That API permits the existing platform preview origin, not the dual-bag standalone preview origin. The merged code has not been deployed to a newly verified isolated platform/API/frontend set.
3. The connected Browser reported that the originating browser context was unavailable. No verified user/operator Session was available to perform Google login, consent, launchToken issuance, real expiration/logout/relogin, or a live authorized Agent worker cycle. OAuth redirect allowlists could not be read with the available Supabase tools; no OAuth changes were made.
4. No deployed sow/harvest/bag/synthesis/transaction-idempotency acceptance was run with an authenticated isolated player. Unit, UI, loopback HTTP and recovery SQL results cannot stand in for that acceptance.
5. Agent preview has `AGENT_CODE_WORKER_ENABLED=false`; manual code review/execution settings alone do not prove an operational repair worker. Model credentials, LIGHT routing and live model/tool execution remain unverified. No provider request or budget upgrade was attempted.

## Data preservation and rollback

Production read-only baseline: V2 has 1 player and 6 land rows; V1 has 2 profiles and 12 land rows. Warehouse and wallet hashes before/after match. Isolated player warehouse/wallet hashes and all six land versions also match. See remote-evidence.json and data-preservation-final.json. These checks are not a full backup or a restore drill.

No production switch occurred, so no production rollback is needed now. Any future switch requires a verified snapshot/restore artifact, exact deployment/commit mapping, an isolated end-to-end acceptance pass, known previous deployment IDs and reversible environment changes, followed by explicit user authorization. Do not copy production secrets into previews.

The isolated Agent schema rollback is to restore the prior `code_approval_path_scope` CHECK without the platform bridge file, after confirming no pending approvals use that path. Git repair commits can be reverted on the isolation branches. Do not replay failed/uncertain wallet mutations with a new request ID.
