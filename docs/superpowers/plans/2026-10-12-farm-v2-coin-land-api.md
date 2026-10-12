# Farm V2 Coin Land API Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Execute natively and request one final independent review.

**Goal:** Wire account-owned Core land2/3 purchases into Farm's existing authenticated UI and persistent retry flow.
**Architecture:** Core atomically owns payment and permanent rights. Farm saves intent before calling Core, caches only a projection, and replays the original request after ambiguous failure. Completed Core unlocks are never compensated by Farm.
**Tech Stack:** Existing TypeScript/Fetch, Express, Drizzle, PostgreSQL and React.
**Spec:** contracts/core/README.md and Canonical FINAL LAND-UNLOCK-001/003, UNLOCK-ATOMIC-001, TX-IDEMPOTENCY-001.

## Global Constraints
- Costs 88/888 coins; land3 requires historical land2; no V1 fallback or client prices.
- Core verified launch owner only; no auth/wallet duplication.
- No production schema application, merge or deployment.

## Review Focus
- Lost Core response: replay same request, no compensation or duplicate debit.
- Farm write/read failure after Core success: recover permanent Core entitlement.
- Account/viewport changes: no cross-user pending operation.
- Inactive or regranted lifetime entitlement: preserve history and respect current Core access.
- Core outage: no stale access projection accepted for gameplay.

## Task 1: Trusted Core endpoint and entitlement read RPC
- [x] Add read RPC to staged SQL; test actual SQL via framework-independent HTTP handler.
- [x] Wire the tested handler into a Core Next route using existing shared-secret/launch verification and admin RPC.
- [x] Generate migration with CLI; do not apply it.

## Task 2: Farm persistent purchase and projection
- [x] Test Core-only read/purchase transport and complete snapshot validation.
- [x] Save durable request/amount before Core, write receipt independently, apply Core projection under player lock; never compensate permanent unlock.
- [x] Extend state/pending request recovery and authenticated route; allow only land2/3.

## Task 3: UI and verification
- [x] Add explicit 88/888 purchase buttons; gate land3 by historical land2 and disable already-owned inactive rights.
- [x] Test request-ID replay, SQL persistence, failure recovery, UI and all four viewport sizes.
- [x] Run the full Farm suite/build and independent review; publish branch artifacts after final hash verification.

## Verified Scope and Release Gates
- Farm workspace: 187 Vitest cases + 4 route guards, workspace typecheck/build, and fixture-backed browser flow at 320/390/768/1440. Browser fixture confirms 23 writes including a lost-response reload/retry with the original unlock request ID; console errors 0.
- Core SQL: 12 PGlite contract tests using actual reference wallet/entitlement SQL. No live database migration or multi-connection concurrency run was performed.
- Core HTTP handler: five tests against the exact handler source. The Next route wrapper is staged for the platform repository; a full platform checkout/build and production migration-chain check were not available in this workspace.
- No migration was applied, no merge/deployment occurred, and no production data was changed.
