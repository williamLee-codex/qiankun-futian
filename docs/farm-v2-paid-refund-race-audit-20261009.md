# Farm V2 × Core Wallet — refund concurrency audit (2026-10-09)

## Verified code path
- `artifacts/api-server/src/routes/farm-v2.ts`: sow, harvest, seed purchase, and crop exchange call `reconcileFarmV2PaidAccessFromCore` before the gameplay mutation.
- `artifacts/api-server/src/lib/farm-v2-paid-access.ts`: fetches Core qualification while holding the Farm player row lock, then commits reconciliation.
- `artifacts/api-server/src/lib/farm-v2-idempotency.ts`: Farm mutations are independently transactional and keyed by request ID.
- `artifacts/api-server/src/lib/farm-v2-core-paid-value.ts`: requests the Core authority and fails closed on errors or malformed responses.

## Confirmed gap
Reconciliation and the subsequent gameplay action use **separate Farm database transactions**. The Core refund transaction is in a **different database**. The player lock prevents concurrent Farm reconciliations from overtaking one another but cannot prevent a Core refund between qualification read and gameplay commit.

Example:
1. T1 Farm requests qualification; Core reports 600 paid crystals.
2. T2 Farm commits reconciliation and releases its player lock.
3. T3 Core records refund; effective qualification falls below 600.
4. T4 Farm executes a gameplay mutation against its previously reconciled access state.
5. T5 A later Farm request rechecks Core and revokes the relevant benefits.

The T4 action may be accepted even though the refund committed at T3. **This is a potential race from source inspection, not a reproduced production incident.**

## Deterministic test matrix (to implement in isolated tests)
| Case | Injection point | Expected observable behavior |
| --- | --- | --- |
| A | Refund committed before Core qualification read | New qualification reflected; disallowed paid benefit rejected |
| B | Refund committed after Core read but before Farm reconciliation commit | Identify snapshot staleness; test must not assert impossible cross-DB atomicity |
| C | Refund committed after Farm reconciliation but before gameplay transaction | Reproduce potential stale authorization; regression test should fail until authorization design changes |
| D | Core unavailable during qualification read | Fail closed; no paid operation or entitlement mutation proceeds |
| E | Two Farm requests concurrently refresh qualification | Farm player lock serializes reconciliation; later read must not be overwritten by earlier snapshot |
| F | Retry a previously completed request after refund | Reconciliation re-reads Core even for reused refresh request ID; gameplay idempotency does not replay an unauthorized new action |
| G | Refund followed by paid crystal repurchase | Benefits restore at qualifying threshold without duplicate milestone grants |

## Required design decision before claiming strict refund cutoff
Option 1: **Documented bounded consistency**. Core remains authoritative at the most recent check. Clearly state that a concurrent refund may take effect on the next operation. This does not satisfy a guarantee that every operation committing after a refund is blocked.

Option 2: **Core-issued authorization/commit protocol**. For paid-only gameplay actions, obtain an operation-scoped Core authorization tied to the wallet's qualification version, then define how Core refund and Farm commit are ordered. A version token **alone** cannot guarantee cross-database atomicity: revalidation can race with refund too. Strict cutoff requires a serialized authority decision and a documented linearization point, plus recovery semantics for interrupted cross-service operations.

## Release gate
1. Implement deterministic concurrency tests A–G with controlled barriers; no live-wallet mutation.
2. Agree whether bounded consistency is acceptable or strict cutoff is mandatory.
3. If strict, design Core authorization and refund serialization before changing gameplay routes.
4. Validate SQL migration in an isolated database; migration currently not applied.
5. Deploy Core migration before Core adapter and Farm runtime, only after explicit approval.
6. Do not merge, deploy, or create a billable Supabase branch as part of this audit.

**Status:** Audit and test specification only. No concurrency test executed; no production change.
