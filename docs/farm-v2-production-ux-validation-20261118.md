# Farm V2 production UX batch — validation and release boundary

## Verified source

Repository williamLee-codex/qiankun-futian; branch
fix/farm-v2-production-ux-batch-20261118. Both its remote head and PR #13 head
were 448e8ecf387074a4d6f7d5e6c5142b316e4f28ba when inspected.
An independent worktree preserves all earlier checkouts and local-only work.
Existing coin conversion, 30-day sign-in, first-purchase links/rewards, bag,
scene artwork and formation rules are retained; no project recreation.

## Fixes and evidence

- Initial full regression found two failures: old unit fixtures used timestamp 0,
  which this branch correctly rejects for newbie eligibility. Fixtures now use
  a valid fixed date, preserving their original expected economic outcomes.
- Real disposable PostgreSQL exercised the actual initialization function:
  first visit commits timestamp and six fields; later visits preserve timestamp,
  inventory and field versions; four concurrent first visits converge to one
  timestamp and six rows; failed field creation rolls back the timestamp/player
  too; unknown historical timestamps remain unknown, never reset to today.
- Invalid initialization clocks now reject before persisting player state.
  A separate reward helper now agrees with the existing canonical invalid-time
  guard. No price, eligibility threshold, multiplier or registered SQL changed.
- Countdown handles missing/invalid/future evidence separately from expiry, ticks
  by seconds and ends exactly at 168h. Twelve actual owner-harvest unit cases
  cover all six fields immediately before and at the same 168h boundary.
- Replacing a wallet reader clears old verified balances, amount and old pending
  presentation; pending intents are reloaded from the current client's existing
  store. Transfers cannot use stale verified balance state while rereading.
  Existing backend ownership, idempotency, bank transaction and replay are unchanged.
- Pet and formation panels update time locally while open. Expired owned pets
  show resting/inactive, not locked; expired timed formation slots disappear;
  permanent Tai Xu ownership remains. No feeding, rewards or asset operation
  is automatically triggered by these presentation timers.
- CI now includes this existing repair branch and builds the authenticated UI
  with its CI-only same-origin API path. An artifact check rejects a build that
  contains only the missing-connection guard. No Vercel environment setting changed.

## Executed checks

- Full Vitest: 70 files PASS, 4 skipped; 310 tests PASS, 58 skipped.
- Initial-entry disposable PostgreSQL suite separately executed: 5/5 PASS.
  These five are among the default run's skipped tests; the other 53 skipped
  cases remain unexecuted, not inferred PASS.
- Node suite: 52 PASS, zero skipped.
- Full workspace TypeScript check PASS.
- API bundle PASS.
- Frontend build with BASE_PATH=/farm-v2/ and VITE_FARM_API_BASE_URL=/api/ PASS.
  Artifact inspection confirms actual repaired farm/countdown/resting code is
  included. This path is a local/CI build input, not a verified production binding.
- git diff --check PASS.

Failing cases were reproduced before the corresponding fixes. The original
310-test successful run was not replaced with a smaller green-only suite.
The PostgreSQL container was disposable and loopback-only, stopped after tests.
No existing Farm/Supabase database or account was recreated, cleared or altered.
No production business RPC, migration, formal initialization or asset test ran.

## Deployment remains blocked

The current callable catalog has no Vercel connector and the managed environment
has no Vercel credential binding. A production HTTP probe returned proxy CONNECT
403. Plugin mentions alone do not establish usable access. No deployment settings
were changed in response and no Vercel deployment ID or formal-site PASS is claimed.

Before releasing into yuceluopan-main, use its actual authenticated Vercel
connection to verify current linked repository/branch/root/build input, current
immutable production deployment and rollback target. Farm root Vercel settings
are API-only and must not be used blindly as the main frontend project. Back up
and compare current deployed configuration, then promote a verified preview;
retain database/credentials/flags, account IDs, wallets, journals and storage.
No migration is part of this UX release. Code parent 448e8ecf is a source
rollback reference, not an authenticated production rollback deployment.

Real Google login/session, production feature behavior and transaction timings
still require that connection and an authorized non-destructive acceptance path.
Unit/integration test fixtures and the isolated database are not formal acceptance.
Missing official pet description PNGs still fall back to the existing honest
unavailable message; no image was fabricated or declared recovered in this batch.
