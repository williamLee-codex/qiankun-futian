# Follow-up acceptance — 2026-11-08 (Asia/Taipei)

**NO-GO remains in effect.** This follow-up closes 50 previously skipped database tests; it does not claim Google OAuth, deployed acceptance or a live GitHub-writing Agent worker cycle.

## New evidence

- PostgreSQL 17.11 was started locally from the pinned npm binary package `@embedded-postgres/linux-x64@17.11.0-beta.19`, without system installation or a new cloud resource. It listened only on 127.0.0.1:55432; Unix sockets were disabled because this runtime forbids them. The server was stopped after each run.
- Platform migrations 0123–0132 were read from immutable GitHub revision `b884034c3c1eb6d627fec7d9474cca65f5e1d1fb` and used only to construct disposable local test databases. Production and the shared Supabase farm data were not used for these tests.
- The original wallet saga and connection lifecycle suites ran against real PostgreSQL: **49 passed, 2 browser cases skipped** (`postgres-integration.log`). This includes replay, concurrent wallet requests, lost responses, rollback, compensation, atomic synthesis, authorization fences, revocation and connection failure behavior covered by those existing tests.
- The schema catalog test now accepts a guarded local PostgreSQL URL as well as its existing Docker path. It requires localhost and a `farm_v2_` database name, creates its own disposable schema-test database, verifies the actual catalog, and drops that local test database afterward. It never falls back to a remote URL.
- Final `pnpm test` with local database settings: **267 Vitest tests passed / 2 skipped, 34 Node-native tests passed**, exit 0 (`full-postgres-final.log`). All 56 Vitest files contain passing tests.
- Full workspace typecheck/build passed again (`build-final.log`).

## Browser failures are retained, not reported as passes

An explicit run with `FARM_V2_BROWSER_ACCEPTANCE=1` failed its two browser tests (`full-postgres-browser.log`). One test fixture had not been updated for CSS imports and Vite's base URL; its bundle now emits both JavaScript and CSS, with the base URL defined. The standalone bundle smoke check passes (`browser-bundle-smoke.log`).

Chromium itself cannot start here: its process-singleton Unix socket is denied with `Operation not permitted`. No runtime/security restriction was weakened to work around that denial. The final green run leaves the two browser cases disabled; they must still pass in a browser-capable environment. The existing workshop browser scenario also contains older controls/furniture assertions and needs reconciliation with the current UI before it can serve as current-scope acceptance. No furniture feature was added.

## Agent concurrent recovery claim

Using the already authorized `imperial-agent-test` Supabase project, two parallel calls ran on different PostgreSQL backend PIDs (1123583 and 1123584). One recovery claim returned attempt 1; the other returned NULL. This is additional real database evidence beyond the prior single-transaction duplicate-claim test.

Fixture approval `80a3f4f8-81c9-4fbd-8d41-6f3f8fe61108` was then set to terminal `failed` with the explicit marker `isolated_concurrency_fixture_completed`, and its lease was cleared. A delete attempt required a confirmation that expired; deletion was not performed. The terminal fixture is retained as test audit evidence, not pending work. See `agent-concurrency.json`.

## Reproduction

1. Unpack the exact binary package and run its shipped symlink hydration script.
2. Initialize a local PGDATA with `initdb`, then start PostgreSQL on localhost with `unix_socket_directories=''`. Start the server and tests within the same execution session; separate command sessions do not share localhost listeners in this runtime.
3. Create roles `anon`, `authenticated`, `service_role BYPASSRLS` and a fresh `farm_v2_...` database using the local postgres administrator.
4. Run `FARM_V2_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55432/<fresh-farm_v2_database> FARM_V2_PLATFORM_CHECKOUT=<verified-platform-fixture-checkout> pnpm test`.
5. Run `PORT=4173 BASE_PATH=/ pnpm run build`.
6. Stop the local server. Never run these schema-creating/teardown fixtures on a shared or production database.

The earlier deployment/secret/OAuth blockers in `../rescue-20261108/RESULT.md` remain. No deployment, production configuration, production data, model call or paid resource was changed in this follow-up.
