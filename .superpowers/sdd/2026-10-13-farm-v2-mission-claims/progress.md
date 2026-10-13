# SDD ledger — plan: docs/superpowers/plans/2026-10-13-farm-v2-mission-claims.md

## Setup
- Worktree: `/workspace/scratch/6d60f303061c/qiankun-futian`, branch `fix/farm-v2-coin-land-api`.
- Starting HEAD: `ffd11d8ff30c7b2da05cfc6833cf2d8e95d6c0fb`.
- Pre-existing unrelated edit preserved: `scripts/farm-v2-browser-fixture.cjs` (font response/content-type and font-load assertions).
- Core repository checkout is absent from mounted workspaces. Core changes were later staged through the connected GitHub app on the existing isolated feature branch; actual Core checkout tests remain pending.

## Preflight task/interface scan
| Tasks | Shared file/interface | Producer → consumer | Finding / ruling |
|---|---|---|---|
| 1, 2 | Core RPC `farm_v2_claim_mission_reward` | SQL RPC → trusted HTTP handler | Interface agrees on owner, mission ID and request ID. Core SQL, handler and route are now on the isolated Core branch; full-chain and live integration checks remain open. |
| 1, 4 | Core credit response/ledger semantics | RPC receipt → Farm transport/saga | Spec requires stable idempotent receipt and known business errors; Farm transport can be contract-tested with mock responses, but live Core implementation is unverified. |
| 3, 4 | `farm_v2_mutation` mission fields and material JSON | Migration/schema → claim journal | Fields align; ensure legacy rows remain valid via nullable mission columns and all-or-none check. |
| 4, 5 | Claim route and state pending-recovery shape | API state → client retry controls | Interface aligns on `claimMission`, `missionId`, `requestId`; verify existing pending-mutation representation before changing API types. |
| 5, 6 | Four-size browser fixture and release evidence | UI fixture → acceptance matrix | Fixture is already dirty from prior font work; preserve those edits and add only mission-specific coverage. |
| Task 1 self-check | Spec tests vs SQL and files | Contract mirror/test → RPC | Farm PGlite contract passes; Core migration is staged but has not been checked against the full migration chain or remote ACLs. |
| Task 2 self-check | Handler tests vs route files | handler factory → Next route | Farm handler contract passes; actual Core Vitest/typecheck and CI await a Core checkout or branch CI. |
| Task 3 self-check | New migration/schema/warehouse tests | inventory persistence → integration tests | Interfaces and file map consistent; migration integration fixture must apply new SQL after base migration. |
| Task 4 self-check | Core transport, saga, route, state mapping | HTTP receipt → journal recovery | Tests and file map consistent; reuse existing idempotency recovery only if its hooks support WALLET_APPLIED. |
| Task 5 self-check | API client/hook/view/fixture | server-owned state → controls | Tests and files consistent; no client-authored progress/reward calculation. |
| Task 6 self-check | Acceptance doc and contract README | verification evidence → release gate | No inconsistency; keep NO-GO for missing live Core, remote ACL/RLS, multi-connection and production integration. |

## Rulings
- Ruling: Work in the existing isolated Farm branch; preserve existing user changes and do not merge/deploy or alter remote database state.
- Ruling (superseded): Core was initially held read-only because no checkout was mounted. On continuation, the existing isolated Core feature branch was updated through the connected GitHub app; no merge, deployment or database write was performed.
- Task 1 Farm-side staged SQL contract, mirror, and PGlite test are implemented. Matching Core migration is staged on `fix/farm-v2-core-coin-land-api`.
- Task 3 complete locally: migration/schema/material inventory, invalid/partial journal rejection, fixed rewards and uniqueness tests.
- Task 4 Farm side complete locally: Core transport, authenticated route, durable intent, receipt replay, `WALLET_APPLIED` recovery, explicit rejection and daily-period boundary coverage. Core HTTP endpoint is staged on its feature branch but is not deployed or database-backed.
- Task 5 complete locally: canonical titles, server mission progress/materials, claim controls, expired projection, pending retry with original request ID; browser fixture extended, execution blocked because Playwright's headless-shell binary is absent.
- Ruling: On an allowlisted definitive Core rejection, clear only mission-specific uniqueness columns while retaining the REJECTED journal/action/request ID/error; only then may a fresh request ID claim the same period. This follows the design's no-credit guarantee and avoids a rejected claim permanently occupying the unique key — cost if wrong: if Core marks a committed credit as a definitive rejection, retrying under a new ID could duplicate credit; the transport therefore treats unknown errors as ambiguous and preserves the original ID.

## Final local verification — 2026-10-13
- `pnpm test`: 48 Vitest files, 225 tests passed; 4 paid-route guards passed.
- `PORT=4173 BASE_PATH=/ pnpm run build`: workspace typecheck and builds passed.
- `git diff --check` and staged Core SQL/migration mirror `cmp`: passed.
- Browser fixture remains unexecuted: Playwright `chromium_headless_shell` is unavailable in this environment.
- Self-review completed; no independent reviewer was available. Full Core handler/repository, Supabase remote migration/RLS, multi-connection failure tests, and production end-to-end remain blocked; release status NO-GO.

## Supabase read-only gate check — 2026-10-13
- Queried only the user-confirmed `imperial-compass-dev` project (`qowjznvinqoxekiyjyvy`). Migration metadata's newest entry is `20261006000121`; no `farm_v2` base tables exist in `public` or `platform`.
- This confirms the remote project is reachable and Farm V2 schema has not been applied. No player data queried and no remote writes or migrations performed.

## Core branch read-only check — 2026-10-13
- GitHub confirms `williamLee-codex/imperial-compass-platform` exists and remote branch `fix/farm-v2-core-coin-land-api` is at `212e3ec0f3ecc211d21f9d8e0bed0616ad4a862d`.
- Its `src/app/api/replit/farm-v2` tree currently contains `coin-land-unlocks`, `paid-value`, and `wallet`; no mission-rewards route. The existing coin-land route establishes the trusted route pattern, but no local Core checkout is mounted for implementation and verification.
- Read-only GitHub inspection only; no branch, issue, commit, or file was changed.
- Compared the Core branch's `0019_create_core_wallet_runtime.sql` with the Farm contract test's pinned reference: identical after newline normalization. The allowlisted RPC's Wallet function signatures match; the subsequent Core grant migration restricts those Wallet RPCs to `service_role`.

## Continued Core HTTP contract staging — 2026-10-13
- Added a Farm-side staged mirror of the Core mission reward handler and Next route under `contracts/core/platform-files/src/`, following the existing Core coin-land route pattern fetched read-only from `fix/farm-v2-core-coin-land-api`. These files are not in the Core checkout or remote branch.
- Added 7 handler contract cases covering trusted secret, strict body allowlist, launch identity and app ID, request-ID validation, all eight mission IDs, exact RPC argument allowlist, definitive business errors, and ambiguous RPC failure. TDD evidence: the test first failed because the staged handler module was missing; after implementation all 7 passed.
- Fresh full Vitest run: 49 files, 230 passed, 2 HTTP integration tests blocked by `listen EPERM` on `127.0.0.1`; these are sandbox limitations, not passing tests. The other 11 database integration tests passed.
- Fresh `tsc --build`, standalone strict typecheck of the staged handler, paid-route guard (1 test), `git diff --check`, and SQL mirror `cmp` passed.
- Core route mirror itself cannot be typechecked against its Next/Core imports without the Core checkout. No Core remote file, branch, commit, database, merge, or deployment was changed. Release status remains NO-GO.
- Attempted a shallow read-only clone of Core branch `fix/farm-v2-core-coin-land-api` into the writable workspace; GitHub CLI authentication is unavailable (`could not read Username`; `gh` is not installed). The connected GitHub app can read the branch and confirmed HEAD remains `212e3ec0f3ecc211d21f9d8e0bed0616ad4a862d`, but that app's read access does not create a local checkout. No credential was requested or exposed; no remote write was attempted.

## Core mission reward API staged — 2026-10-13
- Added the Core-owned mission reward SQL migration, trusted Next route, handler, and 7-case route-contract test to `williamLee-codex/imperial-compass-platform`, branch `fix/farm-v2-core-coin-land-api`, initial commit `fd5847c91f76396d233a62aaa248979fe55749a0`.
- Review found an inactive identity could mask a prior successful credit on replay. Added a regression that first failed against the old SQL, then moved the identity check after the existing-ledger replay check. The fix is in follow-up commit `a4a72283869b086b41e8249ff3f78098621e25e3`; verified remote branch head and fetched migration contents.
- Re-ran Farm-side focused tests: 3 files, 28 tests passed (6 transport, 7 handler contract, 15 PGlite SQL contract); includes fixed reward allowlist, replay/conflict including inactive-identity replay, wallet rollback, service-role restriction, trusted caller, identity and failure mapping. `git diff --check` and byte-identical migration mirror `cmp` passed.
- GitHub Actions run for the Core branch ended `startup_failure` with zero jobs; available run metadata does not state why, so it is not counted as a test result or attributed to quota. Core's actual Vitest/typecheck/build were not run because the Core checkout is unavailable. Existing coin-land migration, wallet schema and trusted route were read for alignment. Supabase migration remains unapplied; no merge, deployment or database write occurred. Overall release remains NO-GO pending Core CI, full migration-chain/ACL review, real multi-connection and end-to-end checks, and remaining visual deliverables.
