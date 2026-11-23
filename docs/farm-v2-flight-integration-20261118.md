# Farm V2 flight integration follow-up

## Source

Branch: fix/farm-v2-eight-features-20261117.
Remote base verified: b4716d63ab4d82365a27996c1e005438e01c2abb.
This retains 6f288d0 and the newer f466012 authoritative flight synchronization
and b4716d6 first-purchase artwork; no older integration worktree was substituted.

## Changes

- Only the named confirmed animation can remove a confirmed flight. A queued
  pending animationend no longer cuts off its final warehouse/field segment.
  Regression was reproduced failing before the fix, then passed.
- Unexpected rejected mutation Promises clear pending visuals and show the
  existing unconfirmed-result message. They do not assert rollback or retry
  automatically. Original API idempotency/request handling is unchanged.
- Existing field/warehouse geometry, desktop/mobile targets, rapid-click guard,
  server-confirmed completion, failure handling, economy and entitlement logic
  are retained. No backend SQL, assets or deployment settings changed.

## Verification

- Flight tests: 5 PASS, including desktop/mobile target geometry, rapid duplicate
  actions, harvest failure, pending/confirmed event race and rejection recovery.
- Full Vitest: 67 files PASS, 3 files skipped; 282 tests PASS, 53 skipped.
- Existing Node suite: 52 tests PASS, 0 skipped.
- Full workspace typecheck PASS (libraries, API, UI, sandbox, scripts).
- UI production build BASE_PATH=/farm-v2/ PASS; API build PASS.
- git diff --check PASS.

Skipped database/browser transaction cases require explicit isolated database
configuration and are not reported as passing. No formal wallet transaction,
initialization, asset mutation, database cleanup or migration was performed.
UI tests are unit/integration component checks, not real Google-login acceptance.

## Deployment safety and remaining blocker

The current tool catalog has no callable Vercel connector and managed environment
has no deployment credential binding. Production HTTP probe returned proxy
CONNECT 403; no configuration was changed to work around it. No deployment
source, production alias or rollback deployment can be authenticated here.

Farm root vercel.json is API-only: build API, output public, API rewrites and
Git deployment disabled. Do not deploy this configuration into yuceluopan-main
as the main frontend. Main-site source/branch and current immutable rollback
artifact must first be verified using the actual yuceluopan-main Vercel project.
An observed platform Git main ref is not proof of deployed revision.

Only the existing GitHub validation workflow is triggered by this branch push;
it typechecks/tests/builds and contains no deploy or database step. No main merge,
Vercel project relink, environment variable changes or 10%-release claim is made.
The remaining release dependency is authenticated Vercel access to yuceluopan-main
for source verification, safe preview/rollback selection and production promotion.
